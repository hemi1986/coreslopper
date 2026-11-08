import { resolve } from 'node:path';
import { ValidationError } from '@coreslopper/core';
import { resolveHiggsfieldCredentials } from '@coreslopper/providers';
import {
  defaultProjectSlug,
  initWorkspace,
  type FirstProjectOptions,
  type InitResult,
  type SongProvider,
  type VisualProvider,
} from './init.js';
import { onboard } from './onboarding.js';
import { validateFalKey, validateHiggsfieldKey } from './tools.js';

export interface InitCommandOptions {
  yes?: boolean;
  force?: boolean;
  install?: boolean;
  git?: boolean;
  installTools?: boolean;
  toolInstall?: boolean;
  song?: SongProvider;
  visual?: VisualProvider;
  imageProvider?: VisualProvider;
  videoProvider?: VisualProvider;
  budget?: number;
  project?: string;
  title?: string;
  falKey?: string;
  higgsfieldKey?: string;
  suno?: boolean;
  skipProject?: boolean;
  runtime?: string;
}

export function validateChoice<T extends string>(value: string, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) {
    throw new ValidationError(`Invalid ${label}: ${value}. Use one of: ${choices.join(', ')}.`);
  }
  return value as T;
}

export function printInitSummary(result: InitResult): void {
  console.log(`✔ Workspace created: ${result.targetDir}`);
  console.log(`  runtime: ${result.runtimeVersion}`);
  if (result.projectSlug) console.log(`  project: ${result.projectSlug}`);
  console.log(`  dependencies: ${result.installed ? 'installed' : 'not installed'}`);
  console.log(`  audio analysis: ${result.uvSynced ? 'ready' : 'not synced'}`);
  console.log(`  git: ${result.gitInitialized ? 'initialized' : 'not initialized'}`);
  for (const warning of result.warnings) console.warn(`  ! ${warning}`);
  console.log('');
  console.log('Next:');
  console.log(`  cd ${result.targetDir}`);
  if (!result.installed) console.log('  npm install');
  if (!result.uvSynced) console.log('  npm run python:sync');
  console.log('  npm run cli -- doctor');
  console.log('  npm run demo:preview');
  if (result.projectSlug) console.log(`  claude   # then /video-next ${result.projectSlug}`);
  else console.log('  claude');
}

export async function runInitCommand(targetArg: string | undefined, options: InitCommandOptions): Promise<void> {
  const nonInteractive = Boolean(options.yes) || !process.stdin.isTTY;

  if (!nonInteractive) {
    await onboard({
      dir: targetArg,
      force: options.force,
      install: options.install,
      git: options.git,
      installTools: options.toolInstall === false ? false : options.installTools,
      song: options.song,
      visual: options.visual,
      imageProvider: options.imageProvider,
      videoProvider: options.videoProvider,
      budget: options.budget,
      projectSlug: options.project,
      title: options.title,
      falKey: options.falKey,
      higgsfieldKey: options.higgsfieldKey,
      suno: options.suno,
      noProject: options.skipProject,
    });
    return;
  }

  const target = resolve(targetArg ?? '.');
  const visual = options.visual ?? 'mock';
  const image = options.imageProvider ?? visual;
  const video = options.videoProvider ?? visual;
  const falKey = options.falKey ?? process.env.FAL_KEY;
  const higgsfieldKey = options.higgsfieldKey ?? resolveHiggsfieldCredentials();
  for (const provider of new Set([image, video])) {
    if (provider === 'fal') {
      if (!falKey) {
        console.warn('! No FAL_KEY was provided. Add it to .env before generating paid assets.');
      } else {
        const check = await validateFalKey(falKey);
        if (check.status !== 'valid') console.warn(`! Could not verify the fal.ai key (${check.message}).`);
      }
    }
    if (provider === 'higgsfield') {
      if (!higgsfieldKey) {
        console.warn(
          '! No Higgsfield credential was provided. Add HIGGSFIELD_API_KEY to .env before generating paid assets.',
        );
      } else {
        const check = await validateHiggsfieldKey(higgsfieldKey);
        if (check.status !== 'valid') {
          console.warn(`! Could not verify the Higgsfield credential (${check.message}).`);
        }
      }
    }
  }

  const projectSlug = options.project ?? defaultProjectSlug(target);
  const project: FirstProjectOptions | null = options.skipProject
    ? null
    : {
        slug: projectSlug,
        title: options.title,
        budget: options.budget ?? 50,
        song: options.song ?? 'import',
        image,
        video,
      };

  const result = await initWorkspace({
    targetDir: target,
    runtimeDir: options.runtime,
    force: options.force,
    install: options.install,
    git: options.git,
    tools: options.toolInstall === false ? false : options.installTools,
    project,
    falKey,
    higgsfieldKey,
    suno: options.suno !== false,
  });
  printInitSummary(result);
  if (!result.installed && options.install !== false) process.exitCode = 1;
}
