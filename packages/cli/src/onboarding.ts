import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  password,
  select,
  spinner,
  text,
} from '@clack/prompts';
import { resolve } from 'node:path';
import { ValidationError } from '@coreslopper/core';
import {
  checkComfyUI,
  comfyUIBaseUrl,
  resolveHiggsfieldCredentials,
  resolveTopviewApiKey,
} from '@coreslopper/providers';
import {
  defaultProjectSlug,
  initWorkspace,
  isDirectoryEmpty,
  type FirstProjectOptions,
  type InitResult,
  type VideoProvider,
  type VisualProvider,
} from './init.js';
import {
  detectTools,
  formatTools,
  installClaudeCode,
  installFfmpeg,
  installPython,
  installUv,
  missingTools,
  validateFalKey,
  validateHiggsfieldKey,
  validateTopviewKey,
} from './tools.js';
import { checkPublishClients, pendingPublishAuth, publishClientEnv, type PublishClientOptions } from './publish-setup.js';

export interface OnboardOptions extends PublishClientOptions {
  dir?: string;
  force?: boolean;
  install?: boolean;
  git?: boolean;
  installTools?: boolean;
  visual?: VisualProvider;
  imageProvider?: VisualProvider;
  videoProvider?: VideoProvider;
  budget?: number;
  projectSlug?: string;
  title?: string;
  falKey?: string;
  higgsfieldKey?: string;
  topviewKey?: string;
  noProject?: boolean;
}

function unwrap<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    cancel('Onboarding cancelled.');
    process.exit(130);
  }
  return value as Exclude<T, symbol>;
}

function validSlug(value: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return 'Use lowercase letters, digits, and dashes; start with a letter or digit.';
  }
  return undefined;
}

async function chooseTarget(options: OnboardOptions): Promise<string> {
  if (options.dir) return resolve(options.dir);

  if (await isDirectoryEmpty(process.cwd())) return process.cwd();

  const answer = unwrap(
    await text({
      message: 'Where should the workspace live?',
      placeholder: 'coreslopper-studio',
      defaultValue: 'coreslopper-studio',
    }),
  );
  return resolve(answer);
}

async function ensureTargetIsUsable(target: string, force = false): Promise<void> {
  if (await isDirectoryEmpty(target)) return;
  if (force) return;
  const proceed = unwrap(
    await confirm({
      message: `${target} is not empty. Merge the workspace into it?`,
      initialValue: false,
    }),
  );
  if (!proceed) {
    cancel('Choose an empty directory, or pass --force.');
    process.exit(130);
  }
}

async function offerTools(target: string, enabled: boolean): Promise<{ ffmpeg: boolean }> {
  const checks = detectTools(target);
  note(formatTools(checks), 'Environment');
  if (!enabled) return { ffmpeg: false };

  const missing = missingTools(checks);
  if (missing.some((tool) => tool.id === 'node' || tool.id === 'npm')) {
    cancel('Node.js 22+ and npm are required. Install them, then run the onboarding again.');
    process.exit(1);
  }

  let uvReady = Boolean(checks.find((tool) => tool.id === 'uv')?.ok);
  if (!uvReady && missing.some((tool) => tool.id === 'uv')) {
    const install = unwrap(
      await confirm({
        message: 'Install uv? It manages the Python audio-analysis environment.',
        initialValue: true,
      }),
    );
    if (install) uvReady = installUv();
    if (!uvReady) log.warn('uv was not installed. Audio analysis will need it later.');
  }

  const pythonReady = Boolean(checks.find((tool) => tool.id === 'python')?.ok);
  if (!pythonReady && uvReady) {
    const install = unwrap(
      await confirm({
        message: 'Install Python 3.12 with uv?',
        initialValue: true,
      }),
    );
    if (install && !installPython()) {
      log.warn('Python 3.12 was not installed. Audio analysis will need it later.');
    }
  }

  let installFfmpegNow = false;
  if (missing.some((tool) => tool.id === 'ffmpeg')) {
    installFfmpegNow = unwrap(
      await confirm({
        message: 'Install ffmpeg? Optional, but needed for footage and loudness normalization.',
        initialValue: false,
      }),
    );
  }

  if (missing.some((tool) => tool.id === 'claude')) {
    const install = unwrap(
      await confirm({
        message: 'Install Claude Code globally? The /video-next pipeline runs there.',
        initialValue: true,
      }),
    );
    if (install && !installClaudeCode()) {
      log.warn('Claude Code was not installed. Install it with "npm install -g @anthropic-ai/claude-code".');
    }
  }

  if (missing.some((tool) => tool.id === 'git')) {
    log.warn('git is not installed. The workspace still works, but you cannot version it.');
  }

  return { ffmpeg: installFfmpegNow };
}

async function chooseFalKey(options: OnboardOptions, needed: boolean): Promise<string | undefined> {
  let key = options.falKey ?? process.env.FAL_KEY;
  if (!needed) return key;

  if (!key) {
    key = unwrap(
      await password({
        message: 'fal.ai API key (leave empty to add it later)',
        mask: '•',
      }),
    );
  }

  if (!key) {
    log.warn('No FAL_KEY yet. Add it to .env before generating paid assets.');
    return undefined;
  }

  const check = spinner();
  check.start('Checking the fal.ai key...');
  const result = await validateFalKey(key);
  if (result.status === 'valid') {
    check.stop('fal.ai key is valid.');
    return key;
  }

  check.stop(`Could not verify the fal.ai key (${result.message}).`);
  if (result.status === 'invalid') {
    const keep = unwrap(
      await confirm({
        message: 'The key was rejected. Keep it in .env anyway?',
        initialValue: false,
      }),
    );
    if (!keep) return undefined;
  }
  return key;
}

async function chooseHiggsfieldKey(
  options: OnboardOptions,
  needed: boolean,
): Promise<string | undefined> {
  let key = options.higgsfieldKey ?? resolveHiggsfieldCredentials();
  if (!needed) return key;

  if (!key) {
    key = unwrap(
      await password({
        message: 'Higgsfield API credential key_id:key_secret (leave empty to add it later)',
        mask: '•',
      }),
    );
  }

  if (!key) {
    log.warn('No Higgsfield credential yet. Add HIGGSFIELD_API_KEY to .env before generating paid assets.');
    return undefined;
  }

  const check = spinner();
  check.start('Checking the Higgsfield credential...');
  const result = await validateHiggsfieldKey(key);
  if (result.status === 'valid') {
    check.stop('Higgsfield credential is valid.');
    return key;
  }

  check.stop(`Could not verify the Higgsfield credential (${result.message}).`);
  if (result.status === 'invalid') {
    const keep = unwrap(
      await confirm({
        message: 'The credential was rejected. Keep it in .env anyway?',
        initialValue: false,
      }),
    );
    if (!keep) return undefined;
  }
  return key;
}

async function chooseTopviewKey(options: OnboardOptions, needed: boolean): Promise<string | undefined> {
  let key = options.topviewKey ?? resolveTopviewApiKey();
  if (!needed) return key;

  if (!key) {
    key = unwrap(
      await password({
        message: 'Topview platform API key from platform.topview.ai/api-keys (leave empty to add it later)',
        mask: '•',
      }),
    );
  }

  if (!key) {
    log.warn('No Topview key yet. Add TOPVIEW_API_PLATFORM_KEY to .env before generating paid assets.');
    return undefined;
  }

  const check = spinner();
  check.start('Checking the Topview key...');
  const result = await validateTopviewKey(key);
  if (result.status === 'valid') {
    check.stop('Topview key is valid.');
    return key;
  }

  check.stop(`Could not verify the Topview key (${result.message}).`);
  if (result.status === 'invalid') {
    const keep = unwrap(
      await confirm({
        message: 'The key was rejected. Keep it in .env anyway?',
        initialValue: false,
      }),
    );
    if (!keep) return undefined;
  }
  return key;
}

/**
 * Optional OAuth clients for `publish`. Flags or environment values are
 * checked and kept; otherwise the user may add them now or later.
 */
async function choosePublishClients(options: OnboardOptions): Promise<Record<string, string>> {
  const given = publishClientEnv(options);
  const result: Record<string, string> = { ...given };
  const wants = Object.keys(given).length
    ? false
    : unwrap(
        await confirm({
          message: 'Set up publishing to YouTube or TikTok now? Optional: `publish` uploads private videos and TikTok drafts.',
          initialValue: false,
        }),
      );
  if (wants) {
    if (unwrap(await confirm({ message: 'Add a YouTube OAuth client (Google Cloud, Desktop app)?', initialValue: true }))) {
      const id = unwrap(await text({ message: 'YOUTUBE_CLIENT_ID (…apps.googleusercontent.com)', placeholder: 'leave empty to add it later' }));
      const secret = id ? unwrap(await password({ message: 'YOUTUBE_CLIENT_SECRET', mask: '•' })) : '';
      if (id && secret) Object.assign(result, { YOUTUBE_CLIENT_ID: id.trim(), YOUTUBE_CLIENT_SECRET: secret.trim() });
    }
    if (unwrap(await confirm({ message: 'Add a TikTok client (developer portal, Content Posting API)?', initialValue: true }))) {
      const key = unwrap(await text({ message: 'TIKTOK_CLIENT_KEY', placeholder: 'leave empty to add it later' }));
      const secret = key ? unwrap(await password({ message: 'TIKTOK_CLIENT_SECRET', mask: '•' })) : '';
      if (key && secret) Object.assign(result, { TIKTOK_CLIENT_KEY: key.trim(), TIKTOK_CLIENT_SECRET: secret.trim() });
    }
  }
  if (Object.keys(result).length === 0) return result;
  const check = spinner();
  check.start('Checking the publishing clients...');
  const problems = await checkPublishClients(result);
  check.stop(problems.length ? 'Some publishing clients could not be verified.' : 'Publishing clients are valid.');
  for (const problem of problems) log.warn(`${problem} They stay in .env; fix them there (docs/publishing.md).`);
  return result;
}

const CLOUD_LABELS: Record<string, string> = { fal: 'fal.ai', higgsfield: 'Higgsfield', topview: 'Topview' };

function printNextSteps(target: string, result: InitResult, options: OnboardOptions, publishAuth: string[] = []): void {
  const project = result.projectSlug;
  const lines = [
    `Workspace: ${target}`,
    ...(project ? [`Project:   ${project}`] : []),
    '',
    'Next:',
    `  cd ${target}`,
    ...(result.installed ? [] : ['  npm install']),
    ...(result.uvSynced ? [] : ['  npm run python:sync']),
    '  npm run cli -- doctor',
    '  npm run demo:preview',
    ...(project ? [] : ['  npm run cli -- new <slug> --budget 50']),
    '  claude',
    '',
    'In Claude Code:',
    ...(project ? [`  /new-video ${project}    lyrics, song import, brief`] : ['  /new-video']),
    '  /new-series    a series canon; then /new-episode',
    '',
    'The board (production, review, release): npm run cli -- board',
    ...(publishAuth.length ? ['', 'Publishing (once, opens the browser):', ...publishAuth.map((command) => `  ${command}`)] : []),
  ];
  outro(lines.join('\n'));
}

export async function onboard(options: OnboardOptions = {}): Promise<InitResult> {
  intro('coreslopper — music videos and series episodes, from brief to render');

  const target = await chooseTarget(options);
  await ensureTargetIsUsable(target, options.force);

  const checks = detectTools(target);
  if (!checks.find((tool) => tool.id === 'node')?.ok) {
    cancel('Node.js 22 or newer is required.');
    process.exit(1);
  }
  if (!checks.find((tool) => tool.id === 'npm')?.ok) {
    cancel('npm is required to install the workspace dependencies.');
    process.exit(1);
  }

  const { ffmpeg: installFfmpegNow } = await offerTools(target, options.installTools !== false);

  let falKey: string | undefined = options.falKey ?? process.env.FAL_KEY;
  let higgsfieldKey: string | undefined =
    options.higgsfieldKey ?? resolveHiggsfieldCredentials();
  let topviewKey: string | undefined = options.topviewKey ?? resolveTopviewApiKey();
  let project: FirstProjectOptions | null = null;

  if (!options.noProject) {
    const visual =
      options.visual ??
      (options.imageProvider && options.videoProvider
        ? options.imageProvider
        : (unwrap(
            await select({
              message: 'How should visuals be generated?',
              options: [
                { value: 'mock', label: 'Mock provider', hint: 'motion graphics and dry runs, no API key' },
                { value: 'fal', label: 'fal.ai', hint: 'AI keyframes and image-to-video, needs FAL_KEY' },
                {
                  value: 'higgsfield',
                  label: 'Higgsfield',
                  hint: 'AI keyframes and image-to-video, needs HIGGSFIELD_API_KEY',
                },
                {
                  value: 'topview',
                  label: 'Topview',
                  hint: 'AI keyframes and image-to-video, needs TOPVIEW_API_PLATFORM_KEY',
                },
              ],
              initialValue: 'mock',
            }),
          ) as VisualProvider));
    const image = options.imageProvider ?? visual;
    const video: VideoProvider =
      options.videoProvider ??
      (visual === 'mock'
        ? visual
        : (unwrap(
            await select({
              message: 'Where should video clips be rendered?',
              options: [
                { value: visual, label: `${CLOUD_LABELS[visual] ?? visual} (cloud)`, hint: 'same as images' },
                {
                  value: 'comfyui',
                  label: 'ComfyUI (local)',
                  hint: 'workflows from comfyui/workflows/, free; set providers.lipsync: comfyui to lip-sync locally too',
                },
              ],
              initialValue: visual,
            }),
          ) as VideoProvider));
    if (video === 'comfyui') {
      const server = await checkComfyUI();
      if (server.ok) log.success(`${server.message} at ${server.url}`);
      else {
        log.warn(
          `ComfyUI is not reachable at ${comfyUIBaseUrl()} (${server.message}). Start it before generating clips, ` +
            'or set COMFYUI_URL in .env.',
        );
      }
    }

    falKey = await chooseFalKey(options, image === 'fal' || video === 'fal');
    higgsfieldKey = await chooseHiggsfieldKey(
      options,
      image === 'higgsfield' || video === 'higgsfield',
    );
    topviewKey = await chooseTopviewKey(options, image === 'topview' || video === 'topview');

    const budget =
      options.budget ??
      Number(
        unwrap(
          await text({
            message: 'First project budget (USD)',
            defaultValue: '50',
            validate: (value) => {
              const number = Number(value);
              return Number.isFinite(number) && number >= 5 ? undefined : 'Enter a budget of at least $5.';
            },
          }),
        ),
      );
    if (!Number.isFinite(budget) || budget < 5) throw new ValidationError('Budget must be at least $5.');

    const projectSlug =
      options.projectSlug ??
      unwrap(
        await text({
          message: 'First project slug',
          defaultValue: defaultProjectSlug(target),
          validate: (value) => validSlug(value ?? ''),
        }),
      );
    const slugError = validSlug(projectSlug);
    if (slugError) throw new ValidationError(slugError);

    project = { slug: projectSlug, title: options.title, budget, image, video };
  }

  const publishEnv = await choosePublishClients(options);

  const install =
    options.install ??
    (unwrap(
      await confirm({
        message: 'Install Node and Python dependencies now? (takes a few minutes)',
        initialValue: true,
      }),
    ) as boolean);
  const git =
    options.git ??
    (unwrap(
      await confirm({
        message: 'Initialize a git repository in the workspace?',
        initialValue: true,
      }),
    ) as boolean);

  const summary = [
    `Target:   ${target}`,
    `Project:  ${project ? project.slug : 'none'}`,
    `Visuals:  ${project ? (project.image === project.video ? project.image : `image=${project.image}, video=${project.video}`) : '-'}`,
    `Budget:   ${project ? `$${project.budget.toFixed(2)}` : '-'}`,
    `Install:  ${install ? 'yes' : 'no'}`,
    `Git:      ${git ? 'yes' : 'no'}`,
  ].join('\n');
  note(summary, 'Ready to create');

  const proceed = unwrap(
    await confirm({
      message: 'Create the workspace now?',
      initialValue: true,
    }),
  );
  if (!proceed) {
    cancel('No files were written.');
    process.exit(130);
  }

  const result = await initWorkspace({
    targetDir: target,
    force: true,
    install,
    git,
    project,
    falKey,
    higgsfieldKey,
    topviewKey,
    publishEnv,
    onProgress: (message) => log.step(message),
  });

  if (installFfmpegNow) {
    log.step('Installing ffmpeg...');
    if (!installFfmpeg(target)) log.warn('ffmpeg was not installed. Install it later for footage and loudness.');
  }

  for (const warning of result.warnings) log.warn(warning);
  if (!result.installed && install) {
    log.error('Dependency installation did not finish. Run npm install in the workspace.');
    process.exitCode = 1;
  }

  printNextSteps(target, result, options, pendingPublishAuth(publishEnv));
  return result;
}
