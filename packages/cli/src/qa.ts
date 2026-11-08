import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import {
  ValidationError,
  formatUsd,
  hashFile,
  loadProject,
  repoRoot,
  writeTextAtomic,
} from '@coreslopper/core';
import { validateProject } from './validate.js';
import { buildVideoProps } from './render.js';

export interface QaOptions {
  projectDir: string;
  determinismFrame?: number;
}

interface Check {
  name: string;
  result: 'PASS' | 'FAIL' | 'WARN' | 'N/A';
  evidence: string;
}

function checkAssets(project: Awaited<ReturnType<typeof loadProject>>, assetsDone: boolean): Check {
  const shots = project.storyboard?.shots ?? [];
  const hasAssets = shots.some(
    (shot) => Boolean(shot.asset) || Boolean(shot.layers?.some((layer) => layer.asset)),
  );
  if (!assetsDone && !hasAssets) {
    return { name: 'Assets', result: 'N/A', evidence: 'no generated assets to check' };
  }
  const missing: string[] = [];
  for (const shot of shots) {
    if (shot.asset) {
      const path = resolve(project.paths.root, shot.asset);
      if (!existsSync(path)) missing.push(shot.asset);
    }
    for (const layer of shot.layers ?? []) {
      if (layer.asset) {
        const path = resolve(project.paths.root, layer.asset);
        if (!existsSync(path)) missing.push(layer.asset);
      }
    }
  }
  return missing.length
    ? { name: 'Assets', result: 'FAIL', evidence: `missing: ${missing.join(', ')}` }
    : { name: 'Assets', result: 'PASS', evidence: 'all referenced assets exist' };
}

async function checkManifest(project: Awaited<ReturnType<typeof loadProject>>): Promise<Check> {
  if (!existsSync(project.paths.manifest)) {
    return {
      name: 'Manifest',
      result: project.state.budget.spentUsd > 0 ? 'FAIL' : 'PASS',
      evidence: project.state.budget.spentUsd > 0 ? 'spend recorded but no manifest' : 'no generations yet',
    };
  }
  const lines = (await readFile(project.paths.manifest, 'utf8')).trim().split('\n').filter(Boolean);
  let total = 0;
  let failures = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as { costUsd?: number; status?: string };
      total += Number(entry.costUsd ?? 0);
      if (entry.status === 'failed') failures += 1;
    } catch {
      failures += 1;
    }
  }
  const difference = Math.abs(total - project.state.budget.spentUsd);
  if (failures > 0) {
    return { name: 'Manifest', result: 'FAIL', evidence: `${failures} malformed or failed entries` };
  }
  if (difference > 0.01) {
    return {
      name: 'Manifest',
      result: 'FAIL',
      evidence: `manifest total ${formatUsd(total)} does not match spent ${formatUsd(project.state.budget.spentUsd)}`,
    };
  }
  return { name: 'Manifest', result: 'PASS', evidence: `${lines.length} entries, ${formatUsd(total)} reconciled` };
}

export async function runQa(options: QaOptions): Promise<string> {
  const { project, resolved } = await validateProject(options.projectDir);
  const checks: Check[] = [];

  checks.push({
    name: 'Storyboard validation',
    result: 'PASS',
    evidence: `${resolved.shots.length} shots, ${resolved.durationInFrames} frames, no gaps`,
  });
  checks.push(checkAssets(project, project.state.stages.assets?.status === 'done'));
  checks.push({
    name: 'Audio',
    result: existsSync(join(project.paths.root, 'audio', 'song.wav')) ? 'PASS' : 'FAIL',
    evidence: existsSync(join(project.paths.root, 'audio', 'song.wav')) ? 'audio/song.wav exists' : 'missing audio/song.wav',
  });
  checks.push(await checkManifest(project));

  const renderPath = join(project.paths.renders, '16x9.mp4');
  checks.push({
    name: 'Master render',
    result: existsSync(renderPath) ? 'PASS' : 'FAIL',
    evidence: existsSync(renderPath) ? relative(project.paths.root, renderPath) : 'renders/16x9.mp4 is missing',
  });

  const derivatives = project.config.formats.derivatives.map((format) => {
    const id = format.aspect === '9:16' ? '9x16' : format.aspect === '1:1' ? '1x1' : format.aspect === '4:5' ? '4x5' : format.aspect;
    return { id, path: join(project.paths.renders, `${id}.mp4`) };
  });
  for (const derivative of derivatives) {
    checks.push({
      name: `Format ${derivative.id}`,
      result: existsSync(derivative.path) ? 'PASS' : 'WARN',
      evidence: existsSync(derivative.path)
        ? relative(project.paths.root, derivative.path)
        : 'not rendered yet',
    });
  }

  if (options.determinismFrame !== undefined) {
    const { props } = await buildVideoProps({ projectDir: options.projectDir });
    const root = repoRoot();
    const serveUrl = await bundle({ entryPoint: join(root, 'packages/remotion/src/index.ts'), publicDir: root });
    const composition = await selectComposition({ serveUrl, id: 'MusicVideo', inputProps: props });
    const a = join(tmpdir(), `coreslopper-det-a-${process.pid}.png`);
    const b = join(tmpdir(), `coreslopper-det-b-${process.pid}.png`);
    const optionsCommon = {
      composition,
      serveUrl,
      frame: options.determinismFrame,
      inputProps: props,
      imageFormat: 'png' as const,
      scale: 0.25,
      overwrite: true,
    };
    await renderStill({ ...optionsCommon, output: a });
    await renderStill({ ...optionsCommon, output: b });
    const hashA = await hashFile(a);
    const hashB = await hashFile(b);
    checks.push({
      name: 'Determinism',
      result: hashA === hashB ? 'PASS' : 'FAIL',
      evidence: `${hashA.slice(0, 16)} vs ${hashB.slice(0, 16)} at frame ${options.determinismFrame}`,
    });
    await rm(a, { force: true });
    await rm(b, { force: true });
  } else {
    checks.push({ name: 'Determinism', result: 'N/A', evidence: 'run with --determinism <frame>' });
  }

  const ready = checks.every((check) => check.result !== 'FAIL');
  const report = [
    `# QA Report — ${project.config.title}`,
    '',
    `Project: \`${project.config.slug}\``,
    `Duration: ${resolved.durationSeconds.toFixed(2)}s · ${resolved.shots.length} shots`,
    `Budget: ${formatUsd(project.state.budget.spentUsd)} spent / ${formatUsd(project.state.budget.totalUsd)}`,
    '',
    '| Check | Result | Evidence |',
    '|---|---|---|',
    ...checks.map((check) => `| ${check.name} | ${check.result} | ${check.evidence.replaceAll('|', '\\|')} |`),
    '',
    `READY: ${ready ? 'yes' : 'no'}`,
    '',
    'Visual checks (sync, readability, character consistency) are performed by the `qa-checker` agent using stills and clip frames.',
    '',
  ].join('\n');

  const reportPath = join(project.paths.review, 'report.md');
  await writeTextAtomic(reportPath, report);
  console.log(`QA report written to ${reportPath}`);
  for (const check of checks) console.log(`${check.result.padEnd(4)} ${check.name}: ${check.evidence}`);
  console.log(`READY: ${ready ? 'yes' : 'no'}`);
  if (!ready) throw new ValidationError('QA failed; see review/report.md');
  return reportPath;
}
