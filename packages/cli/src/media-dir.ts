import { cp, lstat, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { ValidationError } from '@coreslopper/core';

/**
 * Project folders that hold large media (images, clips, renders). With
 * CORESLOPPER_MEDIA_DIR set, each becomes a symlink into the external media
 * directory, so every project-relative path (`assets/...`, `renders/...`)
 * keeps working unchanged.
 */
export const MEDIA_SUBDIRS = ['assets', 'renders'] as const;

/**
 * External media directory for a project, from CORESLOPPER_MEDIA_DIR.
 * `{slug}` is replaced by the project slug; without the placeholder the slug
 * is appended (`/mnt/d/coreslopper` → `/mnt/d/coreslopper/<slug>`).
 * Returns undefined when the variable is unset (media stays in the project).
 */
export function mediaDirFor(slug: string, value = process.env.CORESLOPPER_MEDIA_DIR): string | undefined {
  const template = value?.trim();
  if (!template) return undefined;
  return resolve(template.includes('{slug}') ? template.replaceAll('{slug}', slug) : join(template, slug));
}

export interface LinkResult {
  dir: string;
  target: string;
  action: 'linked' | 'moved' | 'already-linked';
}

async function isEmptyExceptGitkeep(dir: string): Promise<boolean> {
  const entries = await readdir(dir);
  return entries.every((entry) => entry === '.gitkeep');
}

/**
 * Point the project's media folders at the external media directory.
 * Existing content is only moved when `move` is set; otherwise a non-empty
 * folder is an error, so nothing is moved by surprise.
 */
export async function linkProjectMedia(
  projectDir: string,
  options: { move?: boolean; /** Template like CORESLOPPER_MEDIA_DIR; overrides the variable. */ mediaDir?: string } = {},
): Promise<LinkResult[]> {
  const root = resolve(projectDir);
  const mediaDir = mediaDirFor(basename(root), options.mediaDir ?? process.env.CORESLOPPER_MEDIA_DIR);
  if (!mediaDir) {
    throw new ValidationError('CORESLOPPER_MEDIA_DIR is not set. Add it to .env, for example CORESLOPPER_MEDIA_DIR=/mnt/d/{slug}.');
  }
  const results: LinkResult[] = [];
  for (const sub of MEDIA_SUBDIRS) {
    const dir = join(root, sub);
    const target = join(mediaDir, sub);
    await mkdir(target, { recursive: true });
    const stat = await lstat(dir).catch(() => undefined);
    if (stat?.isSymbolicLink()) {
      const current = resolve(root, await readlink(dir));
      if (current !== target) {
        throw new ValidationError(`${dir} already links to ${current}, not ${target}. Remove the link to relink.`);
      }
      results.push({ dir, target, action: 'already-linked' });
      continue;
    }
    let action: LinkResult['action'] = 'linked';
    if (stat?.isDirectory()) {
      if (!(await isEmptyExceptGitkeep(dir))) {
        if (!options.move) {
          throw new ValidationError(`${dir} is not empty. Re-run with --move to move its content to ${target}.`);
        }
        // Copy (cross-filesystem), then remove the source only after the copy succeeded.
        for (const entry of await readdir(dir)) {
          if (entry === '.gitkeep') continue;
          await cp(join(dir, entry), join(target, entry), { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
        }
        action = 'moved';
      }
      await rm(dir, { recursive: true, force: true });
    } else if (stat) {
      throw new ValidationError(`${dir} exists and is neither a folder nor a symlink.`);
    }
    await symlink(target, dir, 'dir');
    results.push({ dir, target, action });
  }
  await ignoreLinks(root);
  return results;
}

/** A project-local .gitignore keeps the symlinks out of git (only for linked projects). */
async function ignoreLinks(root: string): Promise<void> {
  const path = join(root, '.gitignore');
  const current = await readFile(path, 'utf8').catch(() => '');
  const lines = current.split(/\r?\n/);
  const missing = MEDIA_SUBDIRS.map((sub) => `/${sub}`).filter((line) => !lines.includes(line));
  if (missing.length === 0) return;
  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  await writeFile(path, `${current}${prefix}${missing.join('\n')}\n`);
}
