#!/usr/bin/env node
import { Command } from 'commander';
import {
  ValidationError,
  effectiveBatchCap,
  estimateCost,
  formatUsd,
  loadModelsConfig,
  loadProject,
  providerForRole,
  recordSpend,
  remainingBudget,
  resolveModelRole,
  saveState,
  setStageDone,
  setStageFailed,
  setStageRunning,
  setStageSkipped,
  resetStage,
  type ModelPricing,
} from '@coreslopper/core';
import { validateProject } from './validate.js';
import { validateChangedFile } from './validate-file.js';
import { writeContactSheet } from './contact-sheet.js';
import { renderProject } from './render.js';
import { createProject } from './new-project.js';
import { linkProjectMedia } from './media-dir.js';
import { generateBatch } from './generate.js';
import { runQa } from './qa.js';
import { importFootage, importSong, importTakes, normalizeAudio, extractFrame, extractAudioSegment } from './media.js';
import { voiceTrack } from './voice-track.js';
import { episodeTrack } from './episode-track.js';
import { writeSubtitles } from './subtitles.js';
import { runDoctor } from './doctor.js';
import { runInitCommand, validateChoice, type InitCommandOptions } from './init-command.js';
import { printStatus } from './status.js';
import { printSeriesStatus, seriesDirFromArg } from './series.js';
import { createSeries } from './new-series.js';
import { formatSeconds, parseCsv, projectDirFromArg, run } from './utils.js';
import { findWorkspaceRoot, loadWorkspaceEnv, ownVersion } from './workspace.js';
import type { FormatId } from '../../remotion/src/types.js';

const workspaceRoot = findWorkspaceRoot();
if (workspaceRoot) loadWorkspaceEnv(workspaceRoot);

const packageVersion = ownVersion();

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
      await printStatus(projectDirFromArg(project));
    }),
  );

program
  .command('new-series <slug>')
  .description('Create a series canon in series/<slug>/ from templates/series.')
  .requiredOption('--budget <usd>', 'Series budget in USD: canon generations plus every episode budget', (value) => Number(value))
  .option('--title <title>')
  .option('--format <id>', 'Master format: 16x9 | 9x16 | 1x1 | 4x5 (default: config/defaults.yaml)')
  .option('--brand <kit>', 'Brand kit', 'example')
  .option('--image-provider <provider>', 'mock | fal | higgsfield | comfyui', 'mock')
  .option('--video-provider <provider>', 'mock | fal | higgsfield | comfyui', 'mock')
  .option('--audio-provider <provider>', 'mock | comfyui', 'mock')
  .action(
    (
      slug: string,
      options: {
        budget: number;
        title?: string;
        format?: string;
        brand: string;
        imageProvider: string;
        videoProvider: string;
        audioProvider: string;
      },
    ) =>
      run(async () => {
        const visual = ['mock', 'fal', 'higgsfield', 'comfyui'] as const;
        await createSeries({
          slug,
          title: options.title,
          budget: options.budget,
          format: options.format
            ? validateChoice(options.format, ['16x9', '9x16', '1x1', '4x5'] as const, 'format')
            : undefined,
          brand: options.brand,
          providers: {
            image: validateChoice(options.imageProvider, visual, 'image provider'),
            video: validateChoice(options.videoProvider, visual, 'video provider'),
            audio: validateChoice(options.audioProvider, ['mock', 'comfyui'] as const, 'audio provider'),
          },
        });
      }),
  );

program
  .command('series-status <series>')
  .description('Show a series: canon, planned and created episodes, their stages, spend, and length.')
  .action((series: string) =>
    run(async () => {
      await printSeriesStatus(series);
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

function parseFrameRange(value: string | undefined): [number, number] | undefined {
  if (value === undefined) return undefined;
  const match = /^(\d+)-(\d+)$/.exec(value.trim());
  if (!match || Number(match[1]) > Number(match[2])) {
    throw new ValidationError(`Invalid --frames "${value}". Use <start>-<end>, for example 0-899.`);
  }
  return [Number(match[1]), Number(match[2])];
}

program
  .command('render [project]')
  .description('Render a format with Remotion.')
  .option('--format <format>', '16x9 | 9x16 | 1x1 | 4x5 (default: the master format)')
  .option('--preview', 'Render a half-scale preview')
  .option('--still <frame>', 'Render a single still at this frame', (value) => Number(value))
  .option('--still-scale <scale>', 'Scale for --still (default 1)', (value) => Number(value))
  .option('--out <path>', 'Override the output path')
  .option('--require-audio', 'Fail if the song (audio/song.wav) or episode track (audio/episode.wav) is missing')
  .option('--subtitles <language>', 'Burn in episode subtitles (en); writes renders/<format>.en.mp4')
  .option('--frames <range>', 'Render only frames <start>-<end> (inclusive), for test renders')
  .action(
    (
      project: string | undefined,
      options: {
        format?: string;
        subtitles?: string;
        preview?: boolean;
        still?: number;
        stillScale?: number;
        out?: string;
        requireAudio?: boolean;
        frames?: string;
      },
    ) =>
      run(async () => {
        const projectDir = projectDirFromArg(project);
        const frames = parseFrameRange(options.frames);
        const format = options.format as FormatId | undefined;
        if (format && !['16x9', '9x16', '1x1', '4x5'].includes(format)) {
          throw new ValidationError(`Unknown format "${options.format}". Use 16x9, 9x16, 1x1, or 4x5.`);
        }
        if (options.subtitles && options.subtitles !== 'en') {
          throw new ValidationError(`Unknown subtitle language "${options.subtitles}". Episodes have English subtitles (en).`);
        }
        await renderProject({
          projectDir,
          format,
          preview: options.preview,
          stillFrame: options.still,
          stillScale: options.stillScale,
          out: options.out,
          requireAudio: options.requireAudio,
          frames,
          subtitles: options.subtitles as 'en' | undefined,
        });
      }),
  );

program
  .command('init [dir]')
  .description('Create a new workspace from the bundled runtime.')
  .option('-y, --yes', 'Use defaults and skip prompts')
  .option('--force', 'Merge into a non-empty directory')
  .option('--no-install', 'Skip npm install and uv sync')
  .option('--no-git', 'Do not initialize a git repository')
  .option('--install-tools', 'Install missing uv, Python, ffmpeg, and Claude Code')
  .option('--no-tool-install', 'Do not offer to install system tools')
  .option('--visual <provider>', 'mock | fal | higgsfield', 'mock')
  .option('--image-provider <provider>', 'mock | fal | higgsfield')
  .option('--video-provider <provider>', 'mock | fal | higgsfield | comfyui')
  .option('--budget <usd>', 'First project budget in USD', (value) => Number(value))
  .option('--project <slug>', 'First project slug')
  .option('--title <title>', 'First project title')
  .option('--fal-key <key>', 'fal.ai API key (prefer FAL_KEY in the environment)')
  .option('--higgsfield-key <key>', 'Higgsfield credential (prefer HIGGSFIELD_API_KEY in the environment)')
  .option('--skip-project', 'Create the workspace without a first project')
  .action((dir: string | undefined, options: InitCommandOptions) =>
    run(async () => {
      const visuals = ['mock', 'fal', 'higgsfield'] as const;
      const videoProviders = [...visuals, 'comfyui'] as const;
      if (options.visual) options.visual = validateChoice(options.visual, visuals, 'visual provider');
      if (options.imageProvider) {
        options.imageProvider = validateChoice(options.imageProvider, visuals, 'image provider');
      }
      if (options.videoProvider) {
        options.videoProvider = validateChoice(options.videoProvider, videoProviders, 'video provider');
      }
      await runInitCommand(dir, options);
    }),
  );

program
  .command('new <slug>')
  .description('Create a new project from templates/project, or an episode from templates/episode.')
  .option('--kind <kind>', 'music-video | episode', 'music-video')
  .option('--series <slug>', 'Episode: the series in series/<slug>/')
  .option('--episode <n>', 'Episode: the episode number', (value) => Number(value))
  .option('--title <title>')
  .option('--budget <usd>', 'Project budget in USD (required)', (value) => Number(value))
  .option('--brand <kit>', 'Brand kit', 'example')
  .option('--visual <provider>', 'mock | fal | higgsfield', 'mock')
  .option('--image-provider <provider>', 'mock | fal | higgsfield')
  .option('--video-provider <provider>', 'mock | fal | higgsfield | comfyui')
  .action(
    (
      slug: string,
      options: {
        title?: string;
        budget?: number;
        brand: string;
        visual: string;
        imageProvider?: string;
        videoProvider?: string;
        kind: string;
        series?: string;
        episode?: number;
      },
    ) =>
      run(async () => {
        const kind = validateChoice(options.kind, ['music-video', 'episode'] as const, 'project kind');
        const visuals = ['mock', 'fal', 'higgsfield'] as const;
        const visual = validateChoice(options.visual ?? 'mock', visuals, 'visual provider');
        const imageProvider = options.imageProvider
          ? validateChoice(options.imageProvider, visuals, 'image provider')
          : visual;
        const videoProvider = options.videoProvider
          ? validateChoice(options.videoProvider, [...visuals, 'comfyui'] as const, 'video provider')
          : visual;
        await createProject({
          slug,
          title: options.title,
          budget: options.budget,
          brand: options.brand,
          imageProvider,
          videoProvider,
          kind,
          series: options.series,
          episode: options.episode,
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
  .command('stage-reset <project> <stage>')
  .description('Reset a done, failed, or skipped stage to pending so it can run again.')
  .action((project: string, stage: string) =>
    run(async () => {
      const { loaded } = await loadAndSave(project);
      resetStage(loaded.state, stage);
      await saveState(loaded.paths.state, loaded.state);
      console.log(`↺ ${stage} reset to pending`);
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
  .option('--provider <provider>', 'Provider override: fal | higgsfield | comfyui | mock')
  .action((options: { role: string; units: number; project?: string; provider?: string }) =>
    run(async () => {
      const models = await loadModelsConfig();
      const role = models.roles[options.role];
      if (!role) throw new ValidationError(`Unknown model role "${options.role}".`);
      const loaded = options.project ? await loadProject(projectDirFromArg(options.project)) : undefined;
      const provider = options.provider
        ? validateChoice(options.provider, ['fal', 'higgsfield', 'comfyui', 'mock'] as const, 'provider')
        : loaded
          ? providerForRole(loaded.config, options.role)
          : role.provider;
      const override = (() => {
        const value = loaded?.config.models[options.role];
        return value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      })();
      const resolved = resolveModelRole(role, provider, override, options.role);
      const pricing =
        provider === 'mock' || provider === 'comfyui'
          ? ({ unit: 'request', usd: 0 } satisfies ModelPricing)
          : resolved.pricing;
      if (!pricing) {
        throw new ValidationError(
          `Role "${options.role}" has no pricing entry for provider "${provider}".`,
        );
      }
      const cost = provider === 'mock' || provider === 'comfyui' ? 0 : estimateCost(options.units, pricing);
      console.log(
        `${options.role} [${provider}/${resolved.model}]: ${options.units} ${pricing.unit}(s) × ${formatUsd(pricing.usd)} = ${formatUsd(cost)}`,
      );
      if (loaded) {
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
  .option('--series <series>', 'Run the batch for a series canon (budget and manifest of series/<series>/) instead of a project')
  .option('--dry-run', 'Estimate and print the batch without generating')
  .option('--provider <provider>', 'Provider override for this batch: fal | higgsfield | comfyui | mock (lip-sync keeps its own provider)')
  .action((project: string | undefined, options: { batch: string; series?: string; dryRun?: boolean; provider?: string }) =>
    run(async () => {
      await generateBatch({
        projectDir: projectDirFromArg(project),
        seriesDir: options.series ? seriesDirFromArg(options.series) : undefined,
        batchPath: options.batch,
        dryRun: options.dryRun,
        provider: options.provider
          ? validateChoice(options.provider, ['fal', 'higgsfield', 'comfyui', 'mock'] as const, 'provider')
          : undefined,
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
  .command('import-song [project]')
  .description('Register the song at audio/song.wav and the stem at audio/stems/vocals.wav in song.json; converts other formats to WAV.')
  .option('--song <path>', 'Song file (default: audio/song.wav or audio/song.*)')
  .option('--vocals <path>', 'Vocal stem (default: audio/stems/vocals.wav or audio/stems/vocals.*)')
  .action((project: string | undefined, options: { song?: string; vocals?: string }) =>
    run(async () => {
      await importSong(projectDirFromArg(project), options);
    }),
  );

program
  .command('voice-track [project]')
  .description('Episode: generate a take for every audible script line without a current one, then the scene ambience.')
  .option('--dry-run', 'Estimate the takes without generating')
  .action((project: string | undefined, options: { dryRun?: boolean }) =>
    run(async () => {
      await voiceTrack(projectDirFromArg(project), { dryRun: options.dryRun });
    }),
  );

program
  .command('import-takes [project]')
  .description('Episode: register recordings at audio/lines/<line-id>.wav (other formats are converted) in takes.json.')
  .option('--lines <ids>', 'Comma-separated line IDs (default: every file in audio/lines/)')
  .action((project: string | undefined, options: { lines?: string }) =>
    run(async () => {
      await importTakes(projectDirFromArg(project), { lines: parseCsv(options.lines) });
    }),
  );

program
  .command('episode-track [project]')
  .description('Episode: place the takes, write timing.json, and mix audio/episode.wav and the speaker stems.')
  .action((project: string | undefined) =>
    run(async () => {
      await episodeTrack(projectDirFromArg(project));
    }),
  );

program
  .command('subtitles [project]')
  .description('Episode: write the English subtitles to renders/<slug>.en.srt from the script and effective timing.')
  .action((project: string | undefined) =>
    run(async () => {
      await writeSubtitles(projectDirFromArg(project));
    }),
  );

program
  .command('media-link [project]')
  .description('Store assets/ and renders/ in CORESLOPPER_MEDIA_DIR (e.g. /mnt/d/{slug}) and symlink them into the project.')
  .option('--move', 'Move existing media into the media directory')
  .option('--media-dir <path>', 'Override CORESLOPPER_MEDIA_DIR for this project')
  .action((project: string | undefined, options: { move?: boolean; mediaDir?: string }) =>
    run(async () => {
      const results = await linkProjectMedia(projectDirFromArg(project), {
        move: options.move,
        mediaDir: options.mediaDir,
      });
      for (const link of results) console.log(`✔ ${link.dir} → ${link.target} (${link.action})`);
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
  .command('audio-segment [project]')
  .description('Cut a vocal segment (seconds) for a lip-sync shot into assets/audio-segments/<name>.mp3.')
  .requiredOption('--start <seconds>', 'Segment start in song seconds')
  .requiredOption('--end <seconds>', 'Segment end in song seconds')
  .requiredOption('--name <name>', 'Output name (lowercase, dashes), e.g. shot-012')
  .option('--source <path>', 'Audio source relative to the project (default: audio/stems/vocals.wav, or the speaker stem of --character for an episode)')
  .option('--character <id>', 'Episode: cut from the speaker stem audio/stems/<id>.wav')
  .action((project: string | undefined, options: { start: string; end: string; name: string; source?: string; character?: string }) =>
    run(async () => {
      await extractAudioSegment(
        projectDirFromArg(project),
        Number(options.start),
        Number(options.end),
        options.name,
        { source: options.source, character: options.character },
      );
    }),
  );

program
  .command('frame [project]')
  .description('Extract the first, middle, or last frame of a clip for review or frame chaining.')
  .requiredOption('--input <path>', 'Source clip')
  .option('--position <position>', 'first | middle | last', 'last')
  .option('--out <path>', 'Override the output path')
  .action((project: string | undefined, options: { input: string; position: string; out?: string }) =>
    run(async () => {
      if (!['first', 'middle', 'last'].includes(options.position)) {
        throw new ValidationError('Position must be first, middle, or last.');
      }
      await extractFrame(
        projectDirFromArg(project),
        options.input,
        options.position as 'first' | 'middle' | 'last',
        options.out,
      );
    }),
  );

program
  .command('doctor')
  .description('Check local prerequisites.')
  .option('--json', 'Print machine-readable JSON')
  .action((options: { json?: boolean }) =>
    run(async () => {
      const root = workspaceRoot ?? process.cwd();
      const result = await runDoctor(root, { json: options.json });
      if (!result.ok) process.exitCode = 1;
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
