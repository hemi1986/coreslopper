#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
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
  repoRoot,
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
import { renderThumbnail } from './thumbnail.js';
import { cutShort, probeVideo } from './short.js';
import { openReview } from './review.js';
import { publishProject, type PlatformChoice } from './publish.js';
import { publishAuth, saveEnvValue } from './publish-auth.js';
import { writeUploadText } from './upload-text.js';
import { runRelease } from './release.js';
import { createProject } from './new-project.js';
import { linkProjectMedia } from './media-dir.js';
import { generateBatch } from './generate.js';
import { runQa } from './qa.js';
import { reviewImage } from './review-image.js';
import { patchImage } from './patch.js';
import { formatVerdicts, summarizeVerdicts } from './verdicts.js';
import { formatMediaInfo, makeSheet, mediaInfo } from './image-ops.js';
import { comfyRestart, comfyStatus, formatComfyStatus } from './comfy.js';
import {
  acceptItem,
  addToQueue,
  buildShotItems,
  dropItem,
  formatQueue,
  loadQueue,
  readJsonOrYaml,
  retryItem,
  runQueue,
  runningPid,
  waitForQueue,
  type QueueItemInput,
} from './queue.js';
import { importFootage, importSong, importTakes, normalizeAudio, extractFrame, extractAudioSegment } from './media.js';
import { parseMuteSpans } from './lipsync-audio.js';
import { voiceTrack } from './voice-track.js';
import { episodeTrack } from './episode-track.js';
import { writeSubtitles } from './subtitles.js';
import { runDoctor } from './doctor.js';
import { runInitCommand, validateChoice, type InitCommandOptions } from './init-command.js';
import { printStatus } from './status.js';
import { printSeriesStatus, seriesDirFromArg } from './series.js';
import { createSeries } from './new-series.js';
import { importBenchFixtures, listBench, resolveRunDir, runBench, writeBenchReport } from './bench.js';
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
  .option('--image-provider <provider>', 'mock | fal | higgsfield | topview | comfyui', 'mock')
  .option('--video-provider <provider>', 'mock | fal | higgsfield | topview | comfyui', 'mock')
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
        const visual = ['mock', 'fal', 'higgsfield', 'topview', 'comfyui'] as const;
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
  .command('thumbnail [project]')
  .description('Compose a JPEG thumbnail (1280x720, 1080x1920 for a Short, or the 3000x3000 streaming cover) from a still, the hook text, and the style bible.')
  .requiredOption('--still <path>', 'Source still (png, jpg, webp, svg); relative to the working directory or the project')
  .requiredOption('--text <lines>', 'Hook text; separate lines with "|" (at most 3 lines of 4 words)')
  .requiredOption('--out <file>', 'Output JPEG, e.g. projects/<slug>/renders/thumbnails/thumb-1-hero.jpg')
  .option('--tag <text>', 'Small mono tag in a top corner, e.g. SATIRE')
  .option('--layout <side>', 'Text side: left | right | bottom; the face goes opposite (default left; 9x16 is always vertical)')
  .option('--format <id>', '16x9 (1280x720, main video), 9x16 (1080x1920, Short), 3x4 (1080x1440, TikTok cover of a Short), 4x5 (1080x1350, Instagram feed post), or 1x1 (3000x3000 cover: artist and title only)', '16x9')
  .option('--accent <token>', 'Palette key or role for the slabs after the first line and the tag', 'accent')
  .option('--focus <x,y>', 'Point of the still (fractions 0-1) placed on the face side', '0.5,0.4')
  .option('--zoom <factor>', 'Extra zoom on the still, 1-4', (value) => Number(value), 1)
  .option('--font <key>', 'Typography key of style.yaml for the hook', 'display')
  .option('--scrim <strength>', 'Fade towards the text, 0-1: lower is shorter and fainter (default 1)', (value) => Number(value))
  .option('--text-offset <px>', 'Move the hook up (negative) or down (positive) in pixels (default 0)', (value) => Number(value))
  .action(
    (
      project: string | undefined,
      options: {
        still: string;
        text: string;
        out: string;
        tag?: string;
        layout?: string;
        format: string;
        accent: string;
        focus: string;
        zoom: number;
        font: string;
        scrim?: number;
        textOffset?: number;
      },
    ) =>
      run(async () => {
        await renderThumbnail({ projectDir: projectDirFromArg(project), ...options });
      }),
  );

program
  .command('short [project]')
  .description('Cut a Short (at most 60 s) from renders/9x16.mp4 into renders/shorts/<name>-9x16.mp4, frame-accurate with audio fades.')
  .requiredOption('--from <time>', 'Start: seconds or an anchor, e.g. section:chorus_1, line:l12:end-0.5, beat:64')
  .requiredOption('--to <time>', 'End: seconds or an anchor, e.g. section:chorus_1:end')
  .requiredOption('--name <stem>', 'File stem, e.g. Z1-intro (writes Z1-intro-9x16.mp4)')
  .action((project: string | undefined, options: { from: string; to: string; name: string }) =>
    run(async () => {
      await cutShort({ projectDir: projectDirFromArg(project), ...options });
    }),
  );

program
  .command('review [project]')
  .description('Open a render in the review player and write frame-accurate notes to review/notes/<video>.json.')
  .option('--format <id>', 'Format of the render to review (default: master); the newer of preview and full render wins')
  .option('--video <path>', 'Review this file instead, e.g. a Short')
  .option('--frame <n>', 'Start at this frame', (value) => Number(value))
  .action((project: string | undefined, options: { format?: string; video?: string; frame?: number }) =>
    run(async () => {
      await openReview({ projectDir: projectDirFromArg(project), ...options });
    }),
  );

program
  .command('upload-text [project]')
  .description('Render review/upload.md from review/upload.yaml.')
  .action((project: string | undefined) =>
    run(async () => {
      const path = await writeUploadText(projectDirFromArg(project), (file) => {
        try {
          return probeVideo(file).duration;
        } catch {
          return undefined;
        }
      });
      console.log(`✔ Upload text: ${path}`);
    }),
  );

program
  .command('release [project]')
  .description(
    'Collect and build renders/release/: every format, thumbnails, Shorts, the song as WAV, cover, Spotify canvas, lyrics, ' +
      'platform texts, README, and manifest. Renders only missing or stale formats; rewrites only its own files.',
  )
  .option('--no-render', 'List missing or stale renders as TODOs instead of rendering them')
  .option('--canvas-from <time>', 'Canvas start: seconds or an anchor, e.g. section:chorus_1 (default: a lyric-free window near the first chorus)')
  .option('--canvas-seconds <n>', 'Canvas length, 3-8 s (default 6)', (value) => Number(value))
  .option('--replan', 'Plan the release calendar again instead of keeping its times')
  .action((project: string | undefined, options: { render: boolean; canvasFrom?: string; canvasSeconds?: number; replan?: boolean }) =>
    run(async () => {
      await runRelease({ projectDir: projectDirFromArg(project), render: options.render, canvasFrom: options.canvasFrom, canvasSeconds: options.canvasSeconds, replan: options.replan });
    }),
  );

program
  .command('calendar [project]')
  .description(
    'Plan review/calendar.yaml: when what goes online where, in the next free slots of config/release-schedule.yaml ' +
      '(release day, Shorts slots, posting times), without colliding with other projects. Keeps times already planned.',
  )
  .option('--replan', 'Plan again from scratch instead of keeping the planned times')
  .option('--done-until <date>', 'Mark every event up to this day (YYYY-MM-DD or today) as done, for a song that is already out')
  .action((project: string | undefined, options: { replan?: boolean; doneUntil?: string }) =>
    run(async () => {
      const { runCalendar } = await import('./release-calendar.js');
      await runCalendar({ projectDir: projectDirFromArg(project), root: repoRoot(), replan: options.replan, doneUntil: options.doneUntil });
    }),
  );

program
  .command('release-board')
  .description(
    'Open the release board: a local page with every project\'s release package per platform (files, texts to copy, limits, ' +
      'settings, links), the release calendar of all projects, and checkboxes for what is posted (review/release-status.json).',
  )
  .option('--port <n>', 'Port on 127.0.0.1', (value) => Number(value), 4848)
  .action((options: { port: number }) =>
    run(async () => {
      const { startBoard } = await import('./release-board.js');
      const { url } = await startBoard({ root: repoRoot(), port: options.port });
      console.log(`Release board: ${url}  (Ctrl+C to stop)`);
      await new Promise(() => undefined);
    }),
  );

program
  .command('release-run')
  .description(
    'The release autopilot: post what is due of every release you approved on the release board, by API, at its calendar time. ' +
      'Run by the timer (release-timer install); never by a pipeline stage.',
  )
  .option('--project <slug>', 'Only this project')
  .option('--dry-run', 'Print what is due; post and write nothing')
  .option('--plan', 'Print every approved release event with its state and stop')
  .action((options: { project?: string; dryRun?: boolean; plan?: boolean }) =>
    run(async () => {
      const { autopilotOverview, runAutopilot } = await import('./release-autopilot.js');
      if (options.plan) return autopilotOverview(repoRoot());
      const stamp = new Date().toISOString();
      const result = await runAutopilot({ root: repoRoot(), project: options.project, dryRun: options.dryRun });
      const acted = result.projects.reduce((sum, project) => sum + project.acted.length, 0);
      const attention = result.projects.reduce((sum, project) => sum + project.attention.length, 0);
      console.log(`${stamp} release-run: ${acted} action(s), ${attention} item(s) need you${result.locked ? ' (another run was active)' : ''}`);
    }),
  );

program
  .command('release-approve <project>')
  .description('Approve a release for the autopilot (the board\'s "Approve release" button); a proposed release day becomes release.release_date. A user command.')
  .option('--revoke', 'Withdraw the approval: nothing more goes out by itself')
  .action((project: string, options: { revoke?: boolean }) =>
    run(async () => {
      const { approveRelease, revokeApproval } = await import('./release-autopilot.js');
      const dir = projectDirFromArg(project);
      if (options.revoke) {
        await revokeApproval(dir);
        console.log('Approval withdrawn: the autopilot leaves this release alone.');
        return;
      }
      const status = await approveRelease(dir, { root: repoRoot(), now: new Date() });
      console.log(`Approved: the release of ${status.approval!.release_date} goes out at its calendar times (release-run).`);
    }),
  );

program
  .command('release-timer [action]')
  .description('The timer that runs release-run: show (default) | install | remove | status. WSL: Windows Task Scheduler; Linux: systemd user timer; macOS: launchd.')
  .option('--every <minutes>', 'Minutes between runs', (value) => Number(value), 5)
  .action((action: string | undefined, options: { every: number }) =>
    run(async () => {
      const { releaseTimer } = await import('./release-timer.js');
      await releaseTimer(validateChoice(action ?? 'show', ['show', 'install', 'remove', 'status'] as const, 'action'), { root: repoRoot(), everyMinutes: options.every });
    }),
  );

program
  .command('publish [project]')
  .description(
    'Upload the release package from review/upload.yaml: YouTube as private (or scheduled) videos, TikTok as inbox drafts. ' +
      'A user command, never a pipeline stage; nothing is made public.',
  )
  .option('--platform <platform>', 'youtube | tiktok | all', 'all')
  .option('--only <item>', 'main | shorts | <short name>')
  .option('--schedule <iso-date>', 'YouTube: publish at this time (ISO 8601 with time zone); the video stays private until then')
  .option('--dry-run', 'Validate upload.yaml, files, limits, and quota, and print the plan; no network calls')
  .option('--force', 'Upload again even when review/publish.json has the same file')
  .option('--mock', 'Use the mock adapters (no network); entries are marked as mock')
  .action(
    (
      project: string | undefined,
      options: { platform: string; only?: string; schedule?: string; dryRun?: boolean; force?: boolean; mock?: boolean },
    ) =>
      run(async () => {
        await publishProject({
          projectDir: projectDirFromArg(project),
          platform: validateChoice(options.platform, ['youtube', 'tiktok', 'all'] as const, 'platform') as PlatformChoice,
          only: options.only,
          schedule: options.schedule,
          dryRun: options.dryRun,
          force: options.force,
          mock: options.mock,
          probe: probeVideo,
          onTikTokRefreshToken: (token) => saveEnvValue('TIKTOK_REFRESH_TOKEN', token),
        });
      }),
  );

program
  .command('publish-auth <platform>')
  .description('One-time consent: youtube | tiktok (publish and the autopilot), x | linkedin | instagram (the autopilot). Stores the tokens in .env.')
  .option('--redirect-uri <uri>', 'Loopback redirect URI (TikTok: the one registered in the developer portal)')
  .action((platform: string, options: { redirectUri?: string }) =>
    run(async () => {
      const choice = validateChoice(platform, ['youtube', 'tiktok', 'x', 'linkedin', 'instagram'] as const, 'platform');
      if (choice === 'youtube' || choice === 'tiktok') await publishAuth(choice, { redirectUri: options.redirectUri });
      else await (await import('./social-auth.js')).socialAuth(choice);
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
  .option('--visual <provider>', 'mock | fal | higgsfield | topview', 'mock')
  .option('--image-provider <provider>', 'mock | fal | higgsfield | topview')
  .option('--video-provider <provider>', 'mock | fal | higgsfield | topview | comfyui')
  .option('--budget <usd>', 'First project budget in USD', (value) => Number(value))
  .option('--project <slug>', 'First project slug')
  .option('--title <title>', 'First project title')
  .option('--fal-key <key>', 'fal.ai API key (prefer FAL_KEY in the environment)')
  .option('--higgsfield-key <key>', 'Higgsfield credential (prefer HIGGSFIELD_API_KEY in the environment)')
  .option('--topview-key <key>', 'Topview platform key (prefer TOPVIEW_API_PLATFORM_KEY in the environment)')
  .option('--youtube-client-id <id>', 'YouTube OAuth client ID for publish (prefer YOUTUBE_CLIENT_ID in the environment)')
  .option('--youtube-client-secret <secret>', 'YouTube OAuth client secret (prefer YOUTUBE_CLIENT_SECRET in the environment)')
  .option('--tiktok-client-key <key>', 'TikTok client key for publish (prefer TIKTOK_CLIENT_KEY in the environment)')
  .option('--tiktok-client-secret <secret>', 'TikTok client secret (prefer TIKTOK_CLIENT_SECRET in the environment)')
  .option('--skip-project', 'Create the workspace without a first project')
  .action((dir: string | undefined, options: InitCommandOptions) =>
    run(async () => {
      const visuals = ['mock', 'fal', 'higgsfield', 'topview'] as const;
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
  .option('--visual <provider>', 'mock | fal | higgsfield | topview', 'mock')
  .option('--image-provider <provider>', 'mock | fal | higgsfield | topview')
  .option('--video-provider <provider>', 'mock | fal | higgsfield | topview | comfyui')
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
        const visuals = ['mock', 'fal', 'higgsfield', 'topview'] as const;
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
  .option('--provider <provider>', 'Provider override: fal | higgsfield | topview | comfyui | mock')
  .action((options: { role: string; units: number; project?: string; provider?: string }) =>
    run(async () => {
      const models = await loadModelsConfig();
      const role = models.roles[options.role];
      if (!role) throw new ValidationError(`Unknown model role "${options.role}".`);
      const loaded = options.project ? await loadProject(projectDirFromArg(options.project)) : undefined;
      const provider = options.provider
        ? validateChoice(options.provider, ['fal', 'higgsfield', 'topview', 'comfyui', 'mock'] as const, 'provider')
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
  .option('--provider <provider>', 'Provider override for this batch: fal | higgsfield | topview | comfyui | mock (lip-sync keeps its own provider)')
  .option('--lipsync-provider <provider>', 'Lip-sync provider override for the lipSync items of this batch: fal | higgsfield | topview | comfyui | mock')
  .action((project: string | undefined, options: { batch: string; series?: string; dryRun?: boolean; provider?: string; lipsyncProvider?: string }) =>
    run(async () => {
      await generateBatch({
        projectDir: projectDirFromArg(project),
        seriesDir: options.series ? seriesDirFromArg(options.series) : undefined,
        batchPath: options.batch,
        dryRun: options.dryRun,
        provider: options.provider
          ? validateChoice(options.provider, ['fal', 'higgsfield', 'topview', 'comfyui', 'mock'] as const, 'provider')
          : undefined,
        lipsyncProvider: options.lipsyncProvider
          ? validateChoice(options.lipsyncProvider, ['fal', 'higgsfield', 'topview', 'comfyui', 'mock'] as const, 'lipsync-provider')
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
  .description('Cut a lead-only vocal segment (seconds) for a lip-sync shot into assets/audio-segments/<name>.mp3; backing words are muted.')
  .requiredOption('--start <seconds>', 'Segment start in song seconds')
  .requiredOption('--end <seconds>', 'Segment end in song seconds')
  .requiredOption('--name <name>', 'Output name (lowercase, dashes), e.g. shot-012')
  .option('--source <path>', 'Audio source relative to the project (default: audio/stems/lead.wav if present, else audio/stems/vocals.wav, or the speaker stem of --character for an episode)')
  .option('--character <id>', 'Episode: cut from the speaker stem audio/stems/<id>.wav')
  .option('--mute <spans>', 'Also silence these spans, in song seconds: <start>-<end>[,<start>-<end>...] (e.g. unwritten echoes)')
  .option('--keep-backing', 'Do not mute the backing words (parenthesized lyrics) from the timing')
  .option('--format <format>', 'mp3 | wav (Higgsfield Speak takes WAV only)', 'mp3')
  .action(
    (
      project: string | undefined,
      options: { start: string; end: string; name: string; source?: string; character?: string; mute?: string; keepBacking?: boolean; format: string },
    ) =>
      run(async () => {
        await extractAudioSegment(projectDirFromArg(project), Number(options.start), Number(options.end), options.name, {
          source: options.source,
          character: options.character,
          mute: parseMuteSpans(options.mute),
          keepBacking: options.keepBacking,
          format: validateChoice(options.format, ['mp3', 'wav'] as const, 'format'),
        });
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
  .command('review-image [project]')
  .description('Art-director verdict on one generated image or clip (headless claude) of a project or series canon; appends to verdicts.jsonl and prints the verdict as JSON.')
  .option('--image <paths>', 'Image to judge; comma-separated for several')
  .option('--clip <mp4>', 'Clip to judge: its first, middle, and last frame are extracted and reviewed, and the first frame is measured against the start keyframe')
  .option('--start-frame <png>', 'With --clip: the keyframe the clip starts from (default assets/keyframes/<shot>.png)')
  .option('--shot <id>', 'Storyboard shot the keyframe or clip belongs to')
  .option('--ref <kind:id>', 'Continuity reference instead of a shot, e.g. state:hf7/walkman-shared, plate:house-ruin/yard-wide, prop:scarf')
  .option('--attempt <n>', 'Attempt number of this image', '1')
  .option('--focus <text>', 'Extra checks, e.g. the issues the previous attempt failed on')
  .action(
    (
      project: string | undefined,
      options: { image?: string; clip?: string; startFrame?: string; shot?: string; ref?: string; attempt: string; focus?: string },
    ) =>
      run(async () => {
        const verdict = await reviewImage(projectDirFromArg(project), {
          images: parseCsv(options.image),
          clip: options.clip,
          startFrame: options.startFrame,
          shot: options.shot,
          ref: options.ref,
          attempt: Number(options.attempt),
          focus: options.focus,
        });
        console.log(JSON.stringify(verdict));
        if (verdict.verdict === 'fail') process.exitCode = 2;
      }),
  );

program
  .command('verdicts [project]')
  .description('Last art-director verdict per shot and reference of a project or series canon (from verdicts.jsonl).')
  .option('--failed', 'Only the subjects whose last verdict is a fail')
  .option('--json', 'Print machine-readable JSON')
  .action((project: string | undefined, options: { failed?: boolean; json?: boolean }) =>
    run(async () => {
      const rows = await summarizeVerdicts(projectDirFromArg(project), { failed: options.failed });
      console.log(options.json ? JSON.stringify(rows) : formatVerdicts(rows));
    }),
  );

program
  .command('patch [project]')
  .description('Edit one region of an image and paste it back: crop the box, run it as an image.edit generation (cache, manifest, budget), blend the result in with a soft edge, and file it as the next attempt.')
  .requiredOption('--image <png>', 'Image to repair')
  .requiredOption('--box <x,y,w,h>', 'Region to edit: fractions of the image (0-1) or pixels')
  .requiredOption('--prompt <text>', 'Edit prompt; the crop is image 1, --refs follow as image 2, 3, …')
  .option('--refs <paths>', 'Extra reference images for the edit, comma-separated')
  .option('--shot <id>', 'Shot the image belongs to (names the attempt)')
  .option('--ref <kind:id>', 'Continuity reference the image is, instead of a shot')
  .option('--attempt <n>', 'Attempt number of the patched image; default one after the last reviewed attempt')
  .option('--out <png>', 'Where the patched image goes; default <image dir>/attempts/<name>-a<attempt>.png')
  .option('--replace', 'Also put the patched image in place of --image; the old one is kept as the previous attempt')
  .option('--feather <px>', 'Soft edge in pixels', '24')
  .option('--size <px>', 'Long side the crop is scaled to for the edit', '1024')
  .option('--seed <n>', 'Seed of the edit')
  .option('--workflow <name>', 'Local workflow for the edit, e.g. qwen-edit-quality')
  .option('--provider <name>', 'Override the provider for this edit: mock, fal, higgsfield, topview, or comfyui')
  .option('--series <series>', 'Patch an image of this series canon against the series budget')
  .action(
    (
      project: string | undefined,
      options: {
        image: string; box: string; prompt: string; refs?: string; shot?: string; ref?: string; attempt?: string; out?: string;
        replace?: boolean; feather: string; size: string; seed?: string; workflow?: string; provider?: string; series?: string;
      },
    ) =>
      run(async () => {
        const provider = options.provider
          ? validateChoice(options.provider, ['mock', 'fal', 'higgsfield', 'topview', 'comfyui'] as const, 'provider')
          : undefined;
        const result = await patchImage(projectDirFromArg(project), {
          image: options.image,
          box: options.box,
          prompt: options.prompt,
          references: parseCsv(options.refs),
          subject: options.shot ?? options.ref,
          ...(options.attempt ? { attempt: Number(options.attempt) } : {}),
          out: options.out,
          replace: options.replace,
          feather: Number(options.feather),
          size: Number(options.size),
          ...(options.seed ? { seed: Number(options.seed) } : {}),
          workflow: options.workflow,
          provider,
          ...(options.series ? { seriesDir: seriesDirFromArg(options.series) } : {}),
        });
        console.log(JSON.stringify(result));
      }),
  );

program
  .command('sheet [project]')
  .description('Put images side by side on one sheet to look at them together; --box zooms every image into the same region.')
  .requiredOption('--images <paths>', 'Images, comma-separated (at most 12), left to right')
  .option('--name <stem>', 'File name of the sheet under assets/review/sheets/', 'sheet')
  .option('--out <png>', 'Write the sheet here instead')
  .option('--box <x,y,w,h>', 'Crop every image to this region first: fractions (0-1) or pixels')
  .option('--height <px>', 'Height of one tile', '640')
  .option('--columns <n>', 'Tiles per row; default one row, at most 4')
  .action(
    (
      project: string | undefined,
      options: { images: string; name: string; out?: string; box?: string; height: string; columns?: string },
    ) =>
      run(async () => {
        const dir = projectDirFromArg(project);
        const output = options.out
          ? resolve(options.out)
          : join(existsSync(join(dir, 'series.yaml')) ? dir : (await loadProject(dir)).paths.assets, 'review', 'sheets', `${options.name}.png`);
        const images = parseCsv(options.images);
        await makeSheet(images.map((image) => resolve(image)), output, {
          height: Number(options.height),
          ...(options.columns ? { columns: Number(options.columns) } : {}),
          box: options.box,
        });
        console.log(`Sheet written to ${relative(process.cwd(), output)} (${images.map((image, index) => `${index + 1}: ${basename(image)}`).join(', ')})`);
      }),
  );

program
  .command('probe <files...>')
  .description('Size, length, frame rate, and codecs of images, clips, and audio files.')
  .option('--json', 'Print machine-readable JSON')
  .action((files: string[], options: { json?: boolean }) =>
    run(async () => {
      const infos = files.map((file) => mediaInfo(file));
      console.log(options.json ? JSON.stringify(infos) : infos.map(formatMediaInfo).join('\n'));
    }),
  );

const comfy = program.command('comfy').description('The local ComfyUI server: status and restart.');

comfy
  .command('status')
  .description('Server, queue length, VRAM, and the outcome of the last prompts.')
  .option('--json', 'Print machine-readable JSON')
  .action((options: { json?: boolean }) =>
    run(async () => {
      const status = await comfyStatus();
      console.log(options.json ? JSON.stringify(status) : formatComfyStatus(status));
      if (!status.ok) process.exitCode = 1;
    }),
  );

comfy
  .command('restart')
  .description('Restart ComfyUI with the command in COMFYUI_RESTART_COMMAND (.env).')
  .action(() =>
    run(async () => {
      await comfyRestart();
      console.log(formatComfyStatus(await comfyStatus()));
    }),
  );

const queue = program
  .command('queue')
  .description('The generation queue of a project (assets/queue.json): generate in order, review every result in the background, requeue failed images.');

queue
  .command('add [project]')
  .description('Add items: keyframes or clips built from storyboard.yaml (--kind), or items from a batch file with id and out (--batch).')
  .option('--kind <kind>', 'Build items from the storyboard: keyframe or clip')
  .option('--shots <ids>', 'With --kind: shot ids or ranges, comma-separated (001,004-007); default every shot with the prompt')
  .option('--role <role>', 'With --kind: model role instead of the default')
  .option('--workflow <name>', 'With --kind: local workflow for every item, e.g. qwen-edit-quality or pika-h3-flf2va')
  .option('--overrides <file>', 'With --kind: JSON/YAML object of item changes keyed by shot id, e.g. {"shot-008": {"fl2va": {…}}}')
  .option('--batch <file>', 'JSON/YAML array of batch items, each with "id" and "out" (optional "review", "after", "chainFrom")')
  .option('--replace', 'Reset items that are already queued instead of skipping them')
  .option('--dry-run', 'Print the items without adding them')
  .action(
    (
      project: string | undefined,
      options: { kind?: string; shots?: string; role?: string; workflow?: string; overrides?: string; batch?: string; replace?: boolean; dryRun?: boolean },
    ) =>
      run(async () => {
        if (Boolean(options.kind) === Boolean(options.batch)) throw new ValidationError('Pass either --kind keyframe|clip or --batch <file>.');
        const loaded = await loadProject(projectDirFromArg(project));
        let items: QueueItemInput[];
        if (options.batch) {
          const data = await readJsonOrYaml(options.batch);
          if (!Array.isArray(data)) throw new ValidationError(`${options.batch} must be an array of items.`);
          items = data as QueueItemInput[];
        } else {
          const kind = validateChoice(options.kind!, ['keyframe', 'clip'] as const, 'kind');
          const overrides = options.overrides ? ((await readJsonOrYaml(options.overrides)) as Record<string, Record<string, unknown>>) : undefined;
          const built = buildShotItems(loaded, { kind, shots: parseCsv(options.shots), role: options.role, workflow: options.workflow, overrides });
          for (const skipped of built.skipped) console.log(`  skipped ${skipped.shot}: ${skipped.reason}`);
          items = built.items;
        }
        if (options.dryRun) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }
        if (items.length === 0) throw new ValidationError('Nothing to add.');
        const result = addToQueue(loaded, items, { replace: options.replace });
        console.log(
          `Added ${result.added.length}${result.replaced.length ? `, replaced ${result.replaced.length}` : ''}` +
            `${result.skipped.length ? `, already queued ${result.skipped.length} (${result.skipped.join(', ')})` : ''}.`,
        );
      }),
  );

queue
  .command('run [project]')
  .description('Work the queue until nothing can move. Exit code 2 when items need a fix. Start it in the background and follow it with `queue wait`.')
  .option('--max-attempts <n>', 'Attempts per item before it waits as needs-fix', '3')
  .option('--reviews <n>', 'Reviews that run at once', '2')
  .option('--tries <n>', 'Tries per generation when the backend fails', '2')
  .option('--timeout <s>', 'Seconds after which a generation counts as hung', '1500')
  .action((project: string | undefined, options: { maxAttempts: string; reviews: string; tries: string; timeout: string }) =>
    run(async () => {
      const result = await runQueue(projectDirFromArg(project), {
        maxAttempts: Number(options.maxAttempts),
        reviews: Number(options.reviews),
        tries: Number(options.tries),
        timeoutSeconds: Number(options.timeout),
      });
      console.log(
        `Queue done: ${result.passed.length} passed, ${result.needsFix.length} need a fix, ${result.errors.length} error(s), ${result.blocked.length} waiting.`,
      );
      for (const id of [...result.needsFix, ...result.errors]) console.log(`  ${id}`);
      // A generation that hung past its timeout may still hold a timer; do not wait for it.
      process.exit(result.needsFix.length + result.errors.length > 0 ? 2 : 0);
    }),
  );

queue
  .command('status [project]')
  .description('Every item with its status, attempt, last score, and what it waits for.')
  .option('--json', 'Print machine-readable JSON')
  .action((project: string | undefined, options: { json?: boolean }) =>
    run(async () => {
      const loaded = await loadProject(projectDirFromArg(project));
      const state = loadQueue(loaded.paths.assets);
      if (options.json) return void console.log(JSON.stringify(state));
      console.log(formatQueue(state));
      console.log(runningPid(loaded.paths.assets) ? 'A queue run is active.' : 'No queue run is active.');
    }),
  );

queue
  .command('wait [project]')
  .description('Block until an item needs a fix or failed, the run ended, or the timeout passed; prints what changed.')
  .option('--timeout <s>', 'Seconds to wait at most', '540')
  .action((project: string | undefined, options: { timeout: string }) =>
    run(async () => {
      const loaded = await loadProject(projectDirFromArg(project));
      const result = await waitForQueue(loaded.paths.assets, { timeoutSeconds: Number(options.timeout) });
      for (const change of result.changes) console.log(change);
      console.log(
        result.reason === 'needs-fix'
          ? 'An item needs you: see `queue status`.'
          : result.reason === 'finished'
            ? 'No queue run is active.'
            : 'Still running.',
      );
    }),
  );

queue
  .command('retry <project> <id>')
  .description('Put an item back: the next attempt with a new seed (and --prompt/--item/--provider), or only a new review when the last attempt has none.')
  .option('--prompt <text>', 'New prompt for the next attempt')
  .option('--item <file>', 'JSON/YAML object of item fields to merge in, e.g. a rewritten fl2va or other references')
  .option('--provider <name>', 'Provider for this one attempt (the cloud fallback): fal, higgsfield, topview, comfyui, or mock')
  .option('--seed <n>', 'Seed of the next attempt')
  .action((project: string, id: string, options: { prompt?: string; item?: string; provider?: string; seed?: string }) =>
    run(async () => {
      const loaded = await loadProject(projectDirFromArg(project));
      const provider = options.provider
        ? validateChoice(options.provider, ['mock', 'fal', 'higgsfield', 'topview', 'comfyui'] as const, 'provider')
        : undefined;
      const entry = retryItem(loaded.paths.assets, id, {
        prompt: options.prompt,
        ...(options.item ? { item: (await readJsonOrYaml(options.item)) as Record<string, unknown> } : {}),
        provider,
        ...(options.seed ? { seed: Number(options.seed) } : {}),
      });
      console.log(`${entry.id}: ${entry.status}, attempt ${entry.attempt}.${runningPid(loaded.paths.assets) ? '' : ' Start `queue run`.'}`);
    }),
  );

queue
  .command('accept <project> <id>')
  .description('Approve an item by hand: file the given attempt (default: the best one) at its out path and unlock what derives from it.')
  .option('--attempt <n>', 'Attempt to keep')
  .option('--note <text>', 'Why, e.g. "user approved by eye"')
  .action((project: string, id: string, options: { attempt?: string; note?: string }) =>
    run(async () => {
      const loaded = await loadProject(projectDirFromArg(project));
      const entry = await acceptItem(loaded, id, options.attempt ? Number(options.attempt) : undefined, options.note);
      console.log(`${entry.id}: ${entry.note} -> ${entry.out}`);
    }),
  );

queue
  .command('drop <project> <id>')
  .description('Remove an item from the queue; its files stay.')
  .action((project: string, id: string) =>
    run(async () => {
      const loaded = await loadProject(projectDirFromArg(project));
      console.log(`Dropped ${dropItem(loaded.paths.assets, id).id}.`);
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

const bench = program
  .command('bench')
  .description('Model bench: render fixed cases from past projects on several targets and compare them (bench/).');

bench
  .command('list')
  .description('List bench cases, their fixtures, and the targets.')
  .action(() => run(() => listBench()));

bench
  .command('import')
  .description('Copy the case fixtures (keyframes, references, vocal segments, known good results) into bench/fixtures/.')
  .option('--from <workspace>', 'Workspace (or its projects/ directory) that holds the source projects; default this repository')
  .option('--cases <ids>', 'Comma-separated case ids; default all')
  .option('--force', 'Copy again even when a fixture exists')
  .action((options: { from?: string; cases?: string; force?: boolean }) =>
    run(async () => {
      const summary = await importBenchFixtures({ from: options.from, cases: parseCsv(options.cases), force: options.force });
      if (summary.missing.length > 0) process.exitCode = 1;
    }),
  );

bench
  .command('run')
  .description('Render the selected cases on the targets, with cost estimate, bench budget, and cache; writes bench/runs/<id>/.')
  .requiredOption('--targets <names>', 'Comma-separated target names from bench/targets.yaml')
  .option('--set <set>', 'Bench set, e.g. core or smoke')
  .option('--cases <ids>', 'Comma-separated case ids')
  .option('--seeds <n>', 'Seeds per case (case seed, +101, +202, ...)', '1')
  .option('--repeat', 'Render the first seed twice without cache and compare the bytes')
  .option('--fresh', 'Ignore cached generations (measures time again)')
  .option('--transcribe', 'Transcribe speech outputs with faster-whisper and compute the word error rate')
  .option('--id <id>', 'Run name; an existing run is extended')
  .option('--dry-run', 'Estimate and list the generations without running them')
  .action(
    (options: {
      targets: string;
      set?: string;
      cases?: string;
      seeds: string;
      repeat?: boolean;
      fresh?: boolean;
      transcribe?: boolean;
      id?: string;
      dryRun?: boolean;
    }) =>
      run(async () => {
        const seeds = Number(options.seeds);
        if (!Number.isInteger(seeds) || seeds < 1) throw new ValidationError('--seeds must be a positive integer.');
        await runBench({
          targets: parseCsv(options.targets),
          set: options.set,
          cases: parseCsv(options.cases),
          seeds,
          repeat: options.repeat,
          fresh: options.fresh,
          transcribe: options.transcribe,
          id: options.id,
          dryRun: options.dryRun,
        });
      }),
  );

bench
  .command('report [run]')
  .description('Rebuild bench/runs/<run>/index.html from run.json, scores.json, and ratings.json; default the latest run.')
  .action((runArg: string | undefined) =>
    run(async () => {
      console.log(`Report: ${await writeBenchReport(resolveRunDir(runArg))}`);
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
