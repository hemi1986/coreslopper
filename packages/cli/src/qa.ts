import { existsSync, statSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { renderStill, selectComposition } from '@remotion/renderer';
import {
  ValidationError,
  formatId,
  formatUsd,
  hashFile,
  isSubtitledLine,
  loadProject,
  projectAudioPath,
  repoRoot,
  scriptLines,
  writeTextAtomic,
} from '@coreslopper/core';
import { validateProject } from './validate.js';
import { buildVideoProps, bundleFor, masterFormatId, renderLimits } from './render.js';
import { subtitlesPath } from './subtitles.js';
import { listThumbnails, thumbnailProblems } from './thumbnail-files.js';
import {
  SHORTS_PER_VIDEO,
  listShorts,
  parseUploadText,
  shortName,
  shortPaths,
  shortProblems,
  uploadTextProblems,
  type ShortProbe,
} from './release-files.js';
import { probeVideo } from './short.js';
import { loadUploadData, uploadPaths } from './upload-text.js';
import { releaseChecks } from './release-qa.js';

export interface QaOptions {
  projectDir: string;
  determinismFrame?: number;
}

interface Check {
  name: string;
  result: 'PASS' | 'FAIL' | 'WARN' | 'TODO' | 'N/A';
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

/** Three 1280x720 JPEGs under 2 MB in renders/thumbnails/; fewer is a warning, a bad file a failure. */
export async function checkThumbnails(renders: string, root: string): Promise<{ check: Check; files: string[] }> {
  const files = await listThumbnails(renders);
  const bad: string[] = [];
  for (const file of files) {
    const problems = await thumbnailProblems(file);
    if (problems.length) bad.push(`${relative(root, file)}: ${problems.join(', ')}`);
  }
  const check: Check = bad.length
    ? { name: 'Thumbnails', result: 'FAIL', evidence: bad.join('; ') }
    : files.length < 3
      ? { name: 'Thumbnails', result: 'WARN', evidence: `${files.length} of 3 in renders/thumbnails/; run thumbnail` }
      : { name: 'Thumbnails', result: 'PASS', evidence: `${files.length} JPEGs, 1280x720, under 2 MB` };
  return { check, files: files.map((file) => relative(root, file)) };
}

/**
 * The Shorts of the release package: each 9:16 and at most 60 s (else FAIL)
 * with a 1080x1920 thumbnail beside it; fewer than three is a warning.
 */
export async function checkShorts(
  renders: string,
  root: string,
  probe: (path: string) => Omit<ShortProbe, 'name'> = probeVideo,
): Promise<{ checks: Check[]; files: string[]; names: string[] }> {
  const videos = await listShorts(renders);
  const names = videos.map((video) => shortName(video)!);
  const bad: string[] = [];
  const badThumbs: string[] = [];
  const missingThumbs: string[] = [];
  let unprobed = 0;
  for (const [index, video] of videos.entries()) {
    const name = names[index]!;
    try {
      const problems = shortProblems({ name, ...probe(video) });
      if (problems.length) bad.push(`${relative(root, video)}: ${problems.join(', ')}`);
    } catch {
      unprobed += 1;
    }
    const thumb = shortPaths(renders, name).thumbnail;
    if (!existsSync(thumb)) missingThumbs.push(name);
    else {
      const problems = await thumbnailProblems(thumb, '9x16');
      if (problems.length) badThumbs.push(`${relative(root, thumb)}: ${problems.join(', ')}`);
    }
  }
  const shorts: Check = bad.length
    ? { name: 'Shorts', result: 'FAIL', evidence: bad.join('; ') }
    : videos.length < SHORTS_PER_VIDEO || unprobed
      ? {
          name: 'Shorts',
          result: 'WARN',
          evidence: `${videos.length} of ${SHORTS_PER_VIDEO} in renders/shorts/${unprobed ? `; ${unprobed} not probed (ffprobe missing)` : '; run short'}`,
        }
      : { name: 'Shorts', result: 'PASS', evidence: `${videos.length} videos, 9:16, at most 60 s` };
  const thumbs: Check = badThumbs.length
    ? { name: 'Short thumbnails', result: 'FAIL', evidence: badThumbs.join('; ') }
    : missingThumbs.length || videos.length === 0
      ? {
          name: 'Short thumbnails',
          result: 'WARN',
          evidence: videos.length ? `missing for ${missingThumbs.join(', ')}; run thumbnail --format 9x16` : 'no Shorts yet',
        }
      : { name: 'Short thumbnails', result: 'PASS', evidence: `${videos.length} JPEGs, 1080x1920, under 2 MB` };
  const files = videos.flatMap((video, index) => {
    const thumb = shortPaths(renders, names[index]!).thumbnail;
    return [relative(root, video), ...(existsSync(thumb) ? [relative(root, thumb)] : [])];
  });
  return { checks: [shorts, thumbs], files, names };
}

/** `review/upload.md`: missing is a warning; an item without title, description, or hashtags a failure. */
export async function checkUploadText(review: string, root: string, shortNames: string[]): Promise<Check> {
  const path = join(review, 'upload.md');
  if (!existsSync(path)) {
    return { name: 'Upload text', result: 'WARN', evidence: `${relative(root, path)} is missing; write it from the release-package step` };
  }
  const markdown = await readFile(path, 'utf8');
  const { errors, warnings } = uploadTextProblems(parseUploadText(markdown), markdown, shortNames);
  if (errors.length) return { name: 'Upload text', result: 'FAIL', evidence: errors.join('; ') };
  if (warnings.length) return { name: 'Upload text', result: 'WARN', evidence: warnings.join('; ') };
  return { name: 'Upload text', result: 'PASS', evidence: `${relative(root, path)}: main video and ${shortNames.length} Shorts` };
}

/**
 * `review/upload.yaml`, the source of the upload text and of `publish`:
 * missing is a warning; invalid, or pointing at a missing file, a failure.
 */
export async function checkUploadData(projectDir: string, shortNames: string[]): Promise<Check> {
  const paths = uploadPaths(projectDir);
  const root = resolve(projectDir);
  if (!existsSync(paths.data)) {
    return { name: 'Upload data', result: 'WARN', evidence: `${relative(root, paths.data)} is missing; write it from the release-package step` };
  }
  let data;
  try {
    data = await loadUploadData(projectDir);
  } catch (error) {
    const details = error instanceof ValidationError && error.details.length ? `: ${error.details.join('; ')}` : '';
    return { name: 'Upload data', result: 'FAIL', evidence: `${(error as Error).message}${details}` };
  }
  const missing: string[] = [];
  for (const item of [data.main, ...data.shorts]) {
    for (const file of [item.file, ...(item.thumbnail ? [item.thumbnail] : [])]) {
      if (!existsSync(isAbsolute(file) ? file : join(root, file))) missing.push(file);
    }
  }
  if (missing.length) return { name: 'Upload data', result: 'FAIL', evidence: `missing files: ${missing.join(', ')}` };
  const warnings: string[] = [];
  const described = new Set(data.shorts.map((short) => short.name));
  for (const name of shortNames) if (!described.has(name)) warnings.push(`Short ${name} is not in upload.yaml`);
  if (!existsSync(paths.text) || statSync(paths.text).mtimeMs < statSync(paths.data).mtimeMs) {
    warnings.push('upload.md is older than upload.yaml; run upload-text');
  }
  if (warnings.length) return { name: 'Upload data', result: 'WARN', evidence: warnings.join('; ') };
  return { name: 'Upload data', result: 'PASS', evidence: `${relative(root, paths.data)}: main video and ${data.shorts.length} Shorts, all files present` };
}

/**
 * The manifest reconciles with the recorded spend. A failed call stays in the
 * log as history (a provider error, a timeout, a retried request): it is a
 * WARN, not a FAIL. Only an unreadable line or a total that does not match
 * the spend fails the check.
 */
export async function checkManifest(project: Pick<Awaited<ReturnType<typeof loadProject>>, 'paths' | 'state'>): Promise<Check> {
  if (!existsSync(project.paths.manifest)) {
    return {
      name: 'Manifest',
      result: project.state.budget.spentUsd > 0 ? 'FAIL' : 'PASS',
      evidence: project.state.budget.spentUsd > 0 ? 'spend recorded but no manifest' : 'no generations yet',
    };
  }
  const lines = (await readFile(project.paths.manifest, 'utf8')).trim().split('\n').filter(Boolean);
  let total = 0;
  let malformed = 0;
  const failed: { hash?: string; costUsd: number }[] = [];
  const succeeded = new Set<string>();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as { hash?: string; costUsd?: number; status?: string };
      const cost = Number(entry.costUsd ?? 0);
      total += cost;
      if (entry.status === 'failed') failed.push({ hash: entry.hash, costUsd: cost });
      else if (entry.hash) succeeded.add(entry.hash);
    } catch {
      malformed += 1;
    }
  }
  if (malformed > 0) {
    return { name: 'Manifest', result: 'FAIL', evidence: `${malformed} malformed entries` };
  }
  const difference = Math.abs(total - project.state.budget.spentUsd);
  if (difference > 0.01) {
    return {
      name: 'Manifest',
      result: 'FAIL',
      evidence: `manifest total ${formatUsd(total)} does not match spent ${formatUsd(project.state.budget.spentUsd)}`,
    };
  }
  if (failed.length > 0) {
    const retried = failed.filter((entry) => entry.hash && succeeded.has(entry.hash)).length;
    const cost = failed.reduce((sum, entry) => sum + entry.costUsd, 0);
    return {
      name: 'Manifest',
      result: 'WARN',
      evidence: `${lines.length} entries, ${formatUsd(total)} reconciled; ${failed.length} failed call(s) (${retried} retried successfully, ${formatUsd(cost)})`,
    };
  }
  return { name: 'Manifest', result: 'PASS', evidence: `${lines.length} entries, ${formatUsd(total)} reconciled` };
}

/**
 * The episode checks: subtitles complete, canon references resolved, the
 * episode length inside the series limits, and the SRT written.
 */
function episodeChecks(project: Awaited<ReturnType<typeof loadProject>>, durationSeconds: number): Check[] {
  const checks: Check[] = [];
  const lines = project.script ? scriptLines(project.script).map(({ line }) => line) : [];
  const subtitled = lines.filter(isSubtitledLine);
  const missing = subtitled.filter((line) => !line.text_en?.trim()).map((line) => line.id);
  checks.push({
    name: 'Subtitles text',
    result: missing.length ? 'FAIL' : 'PASS',
    evidence: missing.length ? `no text_en: ${missing.join(', ')}` : `${subtitled.length} line(s) with text_en`,
  });

  const characterIds = new Set(project.characters?.characters.map((character) => character.id));
  const setIds = new Set(project.sets?.sets.map((set) => set.id));
  const unknown = [
    ...subtitled.filter((line) => !characterIds.has(line.speaker)).map((line) => `speaker ${line.speaker}`),
    ...(project.script?.scenes ?? []).filter((scene) => !setIds.has(scene.set)).map((scene) => `set ${scene.set}`),
    ...(project.storyboard?.shots ?? []).flatMap((shot) => [
      ...shot.refs.characters.filter((id) => !characterIds.has(id)).map((id) => `${shot.id} character ${id}`),
      ...shot.refs.sets.filter((id) => !setIds.has(id)).map((id) => `${shot.id} set ${id}`),
    ]),
  ];
  checks.push({
    name: 'Canon',
    result: unknown.length ? 'FAIL' : 'PASS',
    evidence: unknown.length
      ? `unknown: ${unknown.join(', ')}`
      : `${characterIds.size} character(s), ${setIds.size} set(s) in series ${project.config.series}`,
  });

  const limit = project.series?.limits.episode_seconds;
  const inside = !limit || (durationSeconds >= limit.min && durationSeconds <= limit.max);
  checks.push({
    name: 'Episode length',
    result: inside ? 'PASS' : 'FAIL',
    evidence: limit
      ? `${durationSeconds.toFixed(2)}s; series limit ${limit.min}–${limit.max}s`
      : `${durationSeconds.toFixed(2)}s; the series sets no limit`,
  });

  const srt = subtitlesPath(project.paths.renders, project.config.slug);
  checks.push({
    name: 'Subtitles file',
    result: existsSync(srt) ? 'PASS' : 'FAIL',
    evidence: existsSync(srt) ? relative(project.paths.root, srt) : `${relative(project.paths.root, srt)} is missing; run subtitles`,
  });
  return checks;
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
  const audio = projectAudioPath(project.config);
  checks.push({
    name: 'Audio',
    result: existsSync(join(project.paths.root, audio)) ? 'PASS' : 'FAIL',
    evidence: existsSync(join(project.paths.root, audio)) ? `${audio} exists` : `missing ${audio}`,
  });
  checks.push(await checkManifest(project));
  if (project.config.kind === 'episode') checks.push(...episodeChecks(project, resolved.durationSeconds));

  const master = masterFormatId(project.config);
  const renderPath = join(project.paths.renders, `${master}.mp4`);
  checks.push({
    name: 'Master render',
    result: existsSync(renderPath) ? 'PASS' : 'FAIL',
    evidence: existsSync(renderPath) ? relative(project.paths.root, renderPath) : `renders/${master}.mp4 is missing`,
  });

  const derivatives = project.config.formats.derivatives.map((format) => {
    const id = formatId(format.aspect);
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

  const thumbnails = await checkThumbnails(project.paths.renders, project.paths.root);
  checks.push(thumbnails.check);
  const shorts = await checkShorts(project.paths.renders, project.paths.root);
  checks.push(...shorts.checks);
  checks.push(await checkUploadText(project.paths.review, project.paths.root, shorts.names));
  checks.push(await checkUploadData(project.paths.root, shorts.names));
  checks.push(...(await releaseChecks(project.paths.root)));

  if (options.determinismFrame !== undefined) {
    const { props } = await buildVideoProps({ projectDir: options.projectDir });
    const root = repoRoot();
    const workDir = join(root, '.cache', 'render', `${props.project.slug}-qa`);
    const serveUrl = await bundleFor(props, root, workDir);
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
      offthreadVideoCacheSizeInBytes: renderLimits().offthreadVideoCacheSizeInBytes,
      mediaCacheSizeInBytes: renderLimits().mediaCacheSizeInBytes,
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
    await rm(serveUrl, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  } else {
    checks.push({ name: 'Determinism', result: 'N/A', evidence: 'run with --determinism <frame>' });
  }

  // TODO marks what the user still fills in (release metadata, texts); it never blocks delivery.
  const ready = checks.every((check) => check.result !== 'FAIL');
  const todos = checks.filter((check) => check.result === 'TODO').length;
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
    `READY: ${ready ? 'yes' : 'no'}${todos ? ` · ${todos} TODO(s) for the user, see renders/release/README.md` : ''}`,
    '',
    ...(thumbnails.files.length ? ['## Thumbnails', '', ...thumbnails.files.map((file) => `- \`${file}\``), ''] : []),
    ...(shorts.files.length ? ['## Shorts', '', ...shorts.files.map((file) => `- \`${file}\``), ''] : []),
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
