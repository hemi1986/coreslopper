#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ValidationError,
  effectiveBatchCap,
  estimateCost,
  formatUsd,
  loadModelsConfig,
  loadProject,
  nextStage,
  recordSpend,
  remainingBudget,
  saveState,
  setStageDone,
  setStageFailed,
  setStageRunning,
  setStageSkipped,
  stageTable,
} from '@coreslopper/core';
import { validateProject } from './validate.js';
import { validateChangedFile } from './validate-file.js';
import { writeContactSheet } from './contact-sheet.js';
import { renderProject } from './render.js';
import { createProject } from './new-project.js';
import { generateBatch } from './generate.js';
import { runQa } from './qa.js';
import { importFootage, normalizeAudio } from './media.js';
import { formatSeconds, parseCsv, projectDirFromArg, run } from './utils.js';
import type { FormatId } from '../../remotion/src/types.js';

const packageVersion = (() => {
  try {
    return (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }).version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
})();

const program = new Command();
program
  .name('coreslopper')
  .description('Music video workflow: validate, render, and manage projects.')
  .version(packageVersion)
  .showHelpAfterError();

program
  .command('validate [project]')
  .description('Validate timing, style, characters, and storyboard coverage.')
  .option('--no-write', 'Do not write timing.effective.json')
  .action((project: string | undefined, options: { write: boolean }) =>
    run(async () => {
      const projectDir = projectDirFromArg(project);
      const { project: loaded, resolved } = await validateProject(projectDir, { write: options.write });
      console.log(
        `✔ ${loaded.config.title}: ${resolved.shots.length} shots, ${formatSeconds(resolved.durationSeconds)}, ${resolved.durationInFrames} frames`,
      );
      if (resolved.warnings.length) {
        console.log('Warnings:');
        for (const warning of resolved.warnings) console.log(`  ! ${warning}`);
      }
      console.log(`Effective timing: ${loaded.paths.effectiveTiming}`);
    }),
  );

program
  .command('status [project]')
  .description('Show project stage state and budget.')
  .action((project: string | undefined) =>
    run(async () => {
      const projectDir = projectDirFromArg(project);
      const loaded = await loadProject(projectDir);
      const state = loaded.state;
      console.log(`${loaded.config.title} (${loaded.config.slug})`);
      console.log(`Stage: ${state.stage} · Overall: ${state.status}`);
      console.log(stageTable(state).join('\n'));
      console.log(
        `Budget: ${formatUsd(state.budget.spentUsd)} spent / ${formatUsd(state.budget.totalUsd)} total · ${formatUsd(remainingBudget(state))} remaining · batch cap ${formatUsd(effectiveBatchCap(loaded.config, state))}`,
      );
      const next = nextStage(state);
      console.log(`Next: ${next ? `${next.id} (${next.skills.join(', ')})` : 'done'}`);
      if (!existsSync(loaded.paths.state)) console.log('Note: state.json does not exist yet; showing the initial state.');
    }),
  );

program
  .command('contact-sheet [project]')
  .description('Write review/contact-sheet.svg from the validated storyboard.')
  .action((project: string | undefined) =>
    run(async () => {
      const projectDir = projectDirFromArg(project);
      const { project: loaded, resolved } = await validateProject(projectDir);
      await writeContactSheet(
        loaded.paths.contactSheet,
        loaded.config.title,
        resolved.durationSeconds,
        loaded.effectiveTiming!.bpm,
        resolved.shots,
        loaded.style!,
      );
      console.log(`✔ Contact sheet written to ${loaded.paths.contactSheet}`);
    }),
  );

program
  .command('render [project]')
  .description('Render a format with Remotion.')
  .option('--format <format>', '16x9 | 9x16 | 1x1 | 4x5', '16x9')
  .option('--preview', 'Render a half-scale preview')
  .option('--still <frame>', 'Render a single still at this frame', (value) => Number(value))
  .option('--still-scale <scale>', 'Scale for --still (default 1)', (value) => Number(value))
  .option('--out <path>', 'Override the output path')
  .option('--require-audio', 'Fail if audio/song.wav is missing')
  .action(
    (
      project: string | undefined,
      options: {
        format: string;
        preview?: boolean;
        still?: number;
        stillScale?: number;
        out?: string;
        requireAudio?: boolean;
      },
    ) =>
      run(async () => {
        const projectDir = projectDirFromArg(project);
        const format = options.format as FormatId;
        if (!['16x9', '9x16', '1x1', '4x5'].includes(format)) {
          throw new ValidationError(`Unknown format "${options.format}". Use 16x9, 9x16, 1x1, or 4x5.`);
        }
        await renderProject({
          projectDir,
          format,
          preview: options.preview,
          stillFrame: options.still,
          stillScale: options.stillScale,
          out: options.out,
          requireAudio: options.requireAudio,
        });
      }),
  );

program
  .command('new <slug>')
  .description('Create a new project from templates/project.')
  .option('--title <title>')
  .option('--budget <usd>', 'Project budget in USD (required)', (value) => Number(value))
  .option('--brand <kit>', 'Brand kit', 'example')
  .option('--image-provider <provider>', 'fal | mock', 'mock')
  .option('--video-provider <provider>', 'fal | mock', 'mock')
  .option('--song-provider <provider>', 'suno | import | mock', 'import')
  .action(
    (
      slug: string,
      options: {
        title?: string;
        budget?: number;
        brand: string;
        imageProvider: 'fal' | 'mock';
        videoProvider: 'fal' | 'mock';
        songProvider: 'suno' | 'import' | 'mock';
      },
    ) =>
      run(async () => {
        await createProject({
          slug,
          title: options.title,
          budget: options.budget,
          brand: options.brand,
          imageProvider: options.imageProvider,
          videoProvider: options.videoProvider,
          songProvider: options.songProvider,
        });
      }),
  );

async function loadAndSave(project: string | undefined) {
  const projectDir = projectDirFromArg(project);
  const loaded = await loadProject(projectDir);
  return { loaded, projectDir };
}

program
  .command('stage-start <project> <stage>')
  .description('Mark a stage as running and save state.json.')
  .action((project: string, stage: string) =>
    run(async () => {
      const { loaded } = await loadAndSave(project);
      setStageRunning(loaded.state, stage);
      await saveState(loaded.paths.state, loaded.state);
      console.log(`▶ ${stage} running`);
    }),
  );

program
  .command('stage-done <project> <stage>')
  .description('Mark a stage as done and save state.json.')
  .option('--outputs <paths>', 'Comma-separated output paths')
  .option('--hash <hash>', 'Input hash')
  .action((project: string, stage: string, options: { outputs?: string; hash?: string }) =>
    run(async () => {
      const { loaded } = await loadAndSave(project);
      setStageDone(loaded.state, stage, parseCsv(options.outputs), options.hash);
      await saveState(loaded.paths.state, loaded.state);
      console.log(`✔ ${stage} done`);
    }),
  );

program
  .command('stage-fail <project> <stage>')
  .description('Mark a stage as failed and save state.json.')
  .option('--error <message>', 'Error message', 'Unknown error')
  .action((project: string, stage: string, options: { error: string }) =>
    run(async () => {
      const { loaded } = await loadAndSave(project);
      setStageFailed(loaded.state, stage, options.error);
      await saveState(loaded.paths.state, loaded.state);
      console.log(`✖ ${stage} failed: ${options.error}`);
    }),
  );

program
  .command('stage-skip <project> <stage>')
  .description('Mark a stage as skipped and save state.json.')
  .option('--reason <message>')
  .action((project: string, stage: string, options: { reason?: string }) =>
    run(async () => {
      const { loaded } = await loadAndSave(project);
      setStageSkipped(loaded.state, stage, options.reason);
      await saveState(loaded.paths.state, loaded.state);
      console.log(`↷ ${stage} skipped${options.reason ? `: ${options.reason}` : ''}`);
    }),
  );

program
  .command('spend <project> <usd>')
  .description('Record a completed generation spend in state.json.')
  .action((project: string, usd: string) =>
    run(async () => {
      const { loaded } = await loadAndSave(project);
      recordSpend(loaded.state, Number(usd));
      await saveState(loaded.paths.state, loaded.state);
      console.log(`Recorded ${formatUsd(Number(usd))} spent.`);
    }),
  );

program
  .command('estimate')
  .description('Estimate a generation batch cost against the project budget.')
  .requiredOption('--role <role>', 'Role from config/models.yaml')
  .requiredOption('--units <n>', 'Number of images, seconds, or requests', (value) => Number(value))
  .option('--project <project>', 'Project directory for budget checks')
  .action((options: { role: string; units: number; project?: string }) =>
    run(async () => {
      const models = await loadModelsConfig();
      const role = models.roles[options.role];
      if (!role) throw new ValidationError(`Unknown model role "${options.role}".`);
      if (!role.pricing) throw new ValidationError(`Role "${options.role}" has no pricing entry.`);
      const cost = estimateCost(options.units, role.pricing);
      console.log(`${options.role}: ${options.units} ${role.pricing.unit}(s) × ${formatUsd(role.pricing.usd)} = ${formatUsd(cost)}`);
      if (options.project) {
        const loaded = await loadProject(projectDirFromArg(options.project));
        const cap = effectiveBatchCap(loaded.config, loaded.state);
        console.log(
          `Project remaining: ${formatUsd(remainingBudget(loaded.state))} · batch cap: ${formatUsd(cap)}`,
        );
        if (cost > cap) console.log('✖ Estimate exceeds the batch cap.');
      }
    }),
  );

program
  .command('generate [project]')
  .description('Run a paid or mock generation batch with cache, manifest, and budget checks.')
  .requiredOption('--batch <path>', 'Batch JSON/YAML file')
  .option('--dry-run', 'Estimate and print the batch without generating')
  .action((project: string | undefined, options: { batch: string; dryRun?: boolean }) =>
    run(async () => {
      await generateBatch({
        projectDir: projectDirFromArg(project),
        batchPath: options.batch,
        dryRun: options.dryRun,
      });
    }),
  );

program
  .command('qa [project]')
  .description('Run schema, asset, manifest, render, and optional determinism checks; write review/report.md.')
  .option('--determinism <frame>', 'Render this frame twice and compare hashes', (value) => Number(value))
  .action((project: string | undefined, options: { determinism?: number }) =>
    run(async () => {
      await runQa({
        projectDir: projectDirFromArg(project),
        determinismFrame: options.determinism,
      });
    }),
  );

program
  .command('normalize-audio [project]')
  .description('Normalize audio to -14 LUFS / -1 dBTP with ffmpeg.')
  .requiredOption('--input <path>', 'Source audio file')
  .option('--output <path>', 'Destination (default: audio/song.wav)')
  .action((project: string | undefined, options: { input: string; output?: string }) =>
    run(async () => {
      await normalizeAudio(projectDirFromArg(project), options.input, options.output);
    }),
  );

program
  .command('footage [project]')
  .description('Import and normalize a footage clip to 1080p/30fps, silent, yuv420p.')
  .requiredOption('--input <path>', 'Source clip')
  .requiredOption('--name <name>', 'Output name (lowercase, dashes)')
  .action((project: string | undefined, options: { input: string; name: string }) =>
    run(async () => {
      await importFootage(projectDirFromArg(project), options.input, options.name);
    }),
  );

program
  .command('doctor')
  .description('Check local prerequisites.')
  .action(() =>
    run(async () => {
      const root = process.cwd();
      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
      const major = Number(process.versions.node.split('.')[0]);
      checks.push({ name: 'Node >= 22', ok: major >= 22, detail: process.versions.node });
      try {
        execFileSync('which', ['ffmpeg'], { stdio: 'ignore' });
        checks.push({ name: 'ffmpeg', ok: true, detail: 'found on PATH' });
      } catch {
        checks.push({ name: 'ffmpeg', ok: false, detail: 'missing (needed for footage and loudness normalization)' });
      }
      checks.push({
        name: 'Example fonts',
        ok: existsSync(join(root, 'brand/example/fonts/SpaceGrotesk.ttf')),
        detail: 'brand/example/fonts',
      });
      checks.push({
        name: 'Remotion entry',
        ok: existsSync(join(root, 'packages/remotion/src/index.ts')),
        detail: 'packages/remotion/src/index.ts',
      });
      checks.push({
        name: 'FAL_KEY',
        ok: Boolean(process.env.FAL_KEY),
        detail: process.env.FAL_KEY ? 'set' : 'not set (mock works without it)',
      });
      checks.push({
        name: 'Suno MCP',
        ok: existsSync(join(root, '.mcp.json')),
        detail: '.mcp.json',
      });
      for (const check of checks) console.log(`${check.ok ? '✔' : '✖'} ${check.name}: ${check.detail}`);
      if (checks.some((check) => !check.ok)) process.exitCode = 1;
    }),
  );

program
  .command('validate-file <file>')
  .description('Validate a changed project file (used by the Claude Code hook).')
  .action((file: string) =>
    run(async () => {
      const kind = await validateChangedFile(file);
      if (kind) console.log(`✔ ${kind} valid: ${file}`);
    }),
  );

await program.parseAsync(process.argv);
