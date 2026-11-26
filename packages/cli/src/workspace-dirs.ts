import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// The folders a workspace keeps its productions in: `projects/<slug>/` with a
// project.yaml or a series.yaml. Small on purpose, so the libraries can find
// their targets without importing the board's production read model.

export const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Project folders of a workspace: every `projects/<slug>/` with a project.yaml. */
export async function projectDirs(root: string): Promise<string[]> {
  const dir = join(root, 'projects');
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && SLUG.test(entry.name) && existsSync(join(dir, entry.name, 'project.yaml')))
    .map((entry) => join(dir, entry.name))
    .sort();
}

/** Series folders of a workspace: every `projects/<slug>/` with a series.yaml. */
export async function seriesDirs(root: string): Promise<string[]> {
  const dir = join(root, 'projects');
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && SLUG.test(entry.name) && existsSync(join(dir, entry.name, 'series.yaml')))
    .map((entry) => join(dir, entry.name))
    .sort();
}
