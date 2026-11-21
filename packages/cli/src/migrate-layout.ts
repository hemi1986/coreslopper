import { existsSync, readdirSync } from 'node:fs';
import { cp, lstat, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { ValidationError } from '@coreslopper/core';

// The move from the old workspace layout, with series canons in series/<slug>/
// beside projects/, to one folder for every production: projects/<slug>/,
// where series.yaml marks a series (ADR 0035). Cache keys hash file contents,
// not paths, so nothing has to be generated again.

/** Series canons still in the old place: slugs of series/<slug>/ with a series.yaml. */
export function legacySeries(root: string): string[] {
  const dir = join(root, 'series');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'series.yaml')))
    .map((entry) => entry.name)
    .sort();
}

export const LEGACY_LAYOUT_HINT = 'Series canons still live in series/ beside projects/. Move them with `npm run cli -- migrate-layout --dry-run`, then without --dry-run.';

export interface LayoutMigration {
  root: string;
  dryRun: boolean;
  /** Series folders, relative to the workspace: series/<slug> → projects/<slug>. */
  moves: { from: string; to: string }[];
  /** Text files whose paths into series/ were rewritten, relative to the workspace, with the number of replacements. */
  rewrites: { file: string; count: number }[];
  /** Folders in series/ without a series.yaml; they stay where they are. */
  skipped: string[];
}

const TEXT = new Set(['.yaml', '.yml', '.json', '.jsonl', '.md', '.txt']);
/** Media folders never hold path references worth rewriting. */
const SKIP_DIRS = new Set(['renders', 'audio', 'node_modules', '.cache', 'frames', 'image', 'video', 'audio-out']);
const MAX_TEXT_BYTES = 32 * 1024 * 1024;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The rewrites for one file: `../../series/<s>/` (a project or canon pointing
 * into a canon) becomes `../<s>/`; an absolute `<root>/series/<s>` becomes
 * `<root>/projects/<s>`; in the character library `origin` and `from` labels
 * `series/<s>` become `projects/<s>`.
 */
export function rewritePaths(text: string, root: string, slugs: string[], library = false): { text: string; count: number } {
  if (!slugs.length) return { text, count: 0 };
  const names = slugs.map(escape).join('|');
  let count = 0;
  const count1 = (pattern: RegExp, replace: (match: string, ...groups: string[]) => string) => {
    text = text.replace(pattern, (match: string, ...groups: string[]) => {
      count += 1;
      return replace(match, ...groups);
    });
  };
  count1(new RegExp(`\\.\\./\\.\\./series/(${names})(?=/|["'\\s,\\]}]|$)`, 'gm'), (_match, slug) => `../${slug}`);
  const absolute = resolve(root).split(sep).join('/');
  count1(new RegExp(`${escape(absolute)}/series/(${names})(?=/|["'\\s,\\]}]|$)`, 'gm'), (_match, slug) => `${absolute}/projects/${slug}`);
  if (library) count1(new RegExp(`^(\\s*-?\\s*(?:origin|from):\\s*["']?)series/(${names})(?=["']?\\s*$)`, 'gm'), (_match, head, slug) => `${head}projects/${slug}`);
  return { text, count };
}

async function textFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (current: string) => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const path = join(current, entry.name);
      // media-link turns assets/ and renders/ into links to a media drive; follow assets/ for its queue and batches.
      const info = entry.isSymbolicLink() ? await stat(path).catch(() => undefined) : undefined;
      const isDir = entry.isDirectory() || Boolean(info?.isDirectory());
      if (isDir) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) await walk(path);
      } else if (TEXT.has(extname(entry.name).toLowerCase())) {
        files.push(path);
      }
    }
  };
  await walk(dir);
  return files;
}

async function move(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await cp(from, to, { recursive: true, verbatimSymlinks: true, errorOnExist: true });
    await rm(from, { recursive: true, force: true });
  }
}

/**
 * Move every series canon from series/<slug>/ to projects/<slug>/ and
 * rewrite the paths that pointed there. Stops before touching anything when a
 * slug is taken in projects/. A dry run reports the same plan and writes nothing.
 */
export async function migrateLayout(root: string, options: { dryRun?: boolean } = {}): Promise<LayoutMigration> {
  const dryRun = Boolean(options.dryRun);
  const slugs = legacySeries(root);
  const seriesRoot = join(root, 'series');
  const skipped = existsSync(seriesRoot)
    ? (await readdir(seriesRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !slugs.includes(entry.name)).map((entry) => `series/${entry.name}`)
    : [];
  const taken = slugs.filter((slug) => existsSync(join(root, 'projects', slug)));
  if (taken.length) {
    throw new ValidationError(
      `projects/ already has ${taken.map((slug) => `"${slug}"`).join(', ')}; series and projects share their slugs now. Rename one of them first (folder and slug), then run migrate-layout again. Nothing was moved.`,
    );
  }
  const moves = slugs.map((slug) => ({ from: `series/${slug}`, to: `projects/${slug}` }));

  // Rewrite in place before the move in a dry run's eyes: projects as they are, canons where they will be.
  const rewrites: LayoutMigration['rewrites'] = [];
  const targets: { dir: string; label: (file: string) => string; library: boolean }[] = [];
  const projectsRoot = join(root, 'projects');
  for (const entry of existsSync(projectsRoot) ? await readdir(projectsRoot, { withFileTypes: true }) : []) {
    if (entry.isDirectory()) targets.push({ dir: join(projectsRoot, entry.name), label: (file) => relative(root, file), library: false });
  }
  for (const slug of slugs) {
    targets.push({ dir: join(seriesRoot, slug), label: (file) => join('projects', slug, relative(join(seriesRoot, slug), file)), library: false });
  }
  const libraryRoot = join(root, 'library', 'characters');
  if (existsSync(libraryRoot)) targets.push({ dir: libraryRoot, label: (file) => relative(root, file), library: true });

  const pending: { file: string; text: string }[] = [];
  for (const target of targets) {
    for (const file of await textFiles(target.dir)) {
      if ((await lstat(file)).size > MAX_TEXT_BYTES) continue;
      const before = await readFile(file, 'utf8');
      const { text, count } = rewritePaths(before, root, slugs, target.library && file.endsWith('character.yaml'));
      if (!count) continue;
      rewrites.push({ file: target.label(file).split(sep).join('/'), count });
      pending.push({ file, text });
    }
  }

  if (!dryRun) {
    for (const { file, text } of pending) await writeFile(file, text, 'utf8');
    for (const slug of slugs) await move(join(seriesRoot, slug), join(root, 'projects', slug));
    if (existsSync(seriesRoot)) {
      const left = (await readdir(seriesRoot)).filter((name) => name !== '.gitkeep' && name !== '.DS_Store');
      if (!left.length) {
        await rm(join(seriesRoot, '.gitkeep'), { force: true });
        await rm(join(seriesRoot, '.DS_Store'), { force: true });
        await rmdir(seriesRoot);
      }
    }
  }
  return { root, dryRun, moves, rewrites, skipped };
}

export function printLayoutMigration(result: LayoutMigration): void {
  if (!result.moves.length) {
    console.log('✔ The workspace already uses the projects/ layout; nothing to move.');
  }
  for (const move of result.moves) console.log(`${result.dryRun ? '→ would move' : '✔ moved'} ${move.from} → ${move.to}`);
  for (const rewrite of result.rewrites) console.log(`  ${result.dryRun ? 'would rewrite' : 'rewrote'} ${rewrite.file} (${rewrite.count} path${rewrite.count === 1 ? '' : 's'})`);
  for (const folder of result.skipped) console.log(`  left ${folder}: no series.yaml`);
  if (result.dryRun && result.moves.length) console.log('\nDry run: nothing was written. Run again without --dry-run to move.');
  else if (result.moves.length) console.log('\nNext: npm run cli -- board, or series-status <slug>, to check the series. Commit the move in one commit.');
}
