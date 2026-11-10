import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ConfigError,
  SeriesSchema,
  ValidationError,
  createInitialState,
  loadDefaults,
  readYamlFile,
  repoRoot,
  seriesDir,
  writeJsonAtomic,
  writeTextAtomic,
  type ProjectConfig,
  type ProjectKind,
  type Series,
  type ImageProviderKind,
  type VideoProviderKind,
} from '@coreslopper/core';
import { stringify } from 'yaml';
import { linkProjectMedia, mediaDirFor } from './media-dir.js';

export interface NewProjectOptions {
  slug: string;
  title?: string;
  budget?: number;
  brand?: string;
  imageProvider?: ImageProviderKind;
  videoProvider?: VideoProviderKind;
  /** Defaults to `music-video`. An episode takes formats, providers, and brand from its series. */
  kind?: ProjectKind;
  /** Episode only: the series slug (`series/<slug>/series.yaml` must exist). */
  series?: string;
  /** Episode only: the episode number. */
  episode?: number;
  /** Workspace root. Defaults to the repository root discovered from cwd. */
  root?: string;
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function workflowVersion(root: string): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return packageJson.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function workflowCommit(root: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2_000,
    }).trim();
  } catch {
    return undefined;
  }
}

export async function createProject(options: NewProjectOptions): Promise<string> {
  const slug = options.slug.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new ValidationError('Project slug must be lowercase letters, digits, and dashes.');
  }
  if (options.budget === undefined || !Number.isFinite(options.budget)) {
    throw new ConfigError('A project budget is required. Pass --budget <USD>.');
  }

  const root = options.root ?? repoRoot();
  const defaults = await loadDefaults(root);
  if (options.budget < defaults.budget.minimum_usd) {
    throw new ConfigError(
      `Budget must be at least $${defaults.budget.minimum_usd.toFixed(2)} (got $${options.budget.toFixed(2)}).`,
    );
  }

  const kind = options.kind ?? 'music-video';
  const projectDir = join(root, 'projects', slug);
  if (existsSync(projectDir)) {
    throw new ValidationError(`Project directory already exists: ${projectDir}`);
  }
  const series = kind === 'episode' ? await loadEpisodeSeries(projectDir, options) : undefined;

  const templateDir = join(root, 'templates', kind === 'episode' ? 'episode' : 'project');
  await cp(templateDir, projectDir, { recursive: true, errorOnExist: true });

  const planned = series?.episodes.find((entry) => entry.episode === options.episode);
  const config: ProjectConfig = {
    version: 1,
    slug,
    kind,
    ...(series ? { series: series.slug, episode: options.episode } : {}),
    title:
      options.title?.trim() ||
      (series ? planned?.title ?? `${series.title} – Episode ${options.episode}` : titleFromSlug(slug)),
    created: new Date().toISOString(),
    workflow: {
      version: workflowVersion(root),
      ...(workflowCommit(root) ? { commit: workflowCommit(root) } : {}),
    },
    budget_usd: options.budget,
    review_mode: 'auto',
    // An episode gets copies of the series defaults; later series edits do not
    // change an existing episode's cache keys or costs.
    formats: series
      ? structuredClone(series.formats)
      : {
          master: defaults.formats.master,
          derivatives: defaults.formats.derivatives.map((format) => ({
            ...format,
            fps: defaults.formats.master.fps,
          })),
        },
    providers: series
      ? structuredClone(series.providers)
      : {
          image: options.imageProvider ?? 'mock',
          video: options.videoProvider ?? 'mock',
        },
    brand: series ? series.brand : options.brand ?? 'example',
    models: {},
  };

  await writeTextAtomic(join(projectDir, 'project.yaml'), stringify(config));
  for (const file of ['brief.md', 'treatment.md', 'README.md', 'lyrics.txt']) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    const text = await readFile(path, 'utf8');
    await writeFile(
      path,
      text
        .replaceAll('{{TITLE}}', config.title)
        .replaceAll('{{SLUG}}', slug)
        .replaceAll('{{SERIES}}', config.series ?? '')
        .replaceAll('{{EPISODE}}', String(config.episode ?? '')),
      'utf8',
    );
  }
  // New projects start at the interactive `setup` stage; the template carries
  // the creative placeholders that the skills fill in.
  const state = createInitialState(config, config.workflow.version);
  await writeJsonAtomic(join(projectDir, 'state.json'), state);
  await writeJsonAtomic(join(projectDir, 'timing.overrides.json'), {
    version: 1,
    sections: [],
    lines: [],
    words: [],
  });

  // An episode has no characters/ or brand/ of its own: its canon lives in the series.
  const directories =
    kind === 'episode'
      ? ['audio', 'assets', 'renders', 'review']
      : ['audio', 'assets', 'characters', 'renders', 'review', 'brand'];
  for (const directory of directories) {
    await mkdir(join(projectDir, directory), { recursive: true });
    await writeFile(join(projectDir, directory, '.gitkeep'), '');
  }
  await mkdir(join(projectDir, 'audio', 'stems'), { recursive: true });
  if (kind === 'episode') await mkdir(join(projectDir, 'audio', 'lines'), { recursive: true });

  // Validate the project shell. Timing and storyboard are intentionally absent
  // at this point; only the project config and state are checked.
  await readFile(join(projectDir, 'project.yaml'), 'utf8');

  // Large media (assets/, renders/) lives outside the repository when
  // CORESLOPPER_MEDIA_DIR is set; the project folders become symlinks.
  if (mediaDirFor(slug)) {
    for (const link of await linkProjectMedia(projectDir)) {
      console.log(`Media: ${relativeToRoot(link.dir, root)} → ${link.target}`);
    }
  }

  console.log(`Created project ${config.title} (${slug}) at ${projectDir}`);
  console.log(`Budget: $${config.budget_usd.toFixed(2)} · providers: image=${config.providers.image}, video=${config.providers.video}`);
  if (series) {
    console.log(`Series: ${series.title} (${series.slug}), episode ${config.episode}; formats, providers, and brand copied from series.yaml.`);
    console.log(`Next: write script.yaml (scenes and script lines) for episode ${config.episode}.`);
    return projectDir;
  }
  const audio = relativeToRoot(join(projectDir, 'audio'), root);
  console.log(`Song: put the finished mix at ${audio}/song.wav and the vocal stem at ${audio}/stems/vocals.wav.`);
  console.log('Next: run /new-video ' + slug + ' in Claude Code to finish setup, lyrics, song import, and the brief.');
  return projectDir;
}

async function loadEpisodeSeries(projectDir: string, options: NewProjectOptions): Promise<Series> {
  if (!options.series) throw new ConfigError('An episode needs its series. Pass --series <slug>.');
  if (options.episode === undefined || !Number.isInteger(options.episode) || options.episode < 1) {
    throw new ConfigError('An episode needs a positive episode number. Pass --episode <n>.');
  }
  const path = join(seriesDir(projectDir, options.series), 'series.yaml');
  if (!existsSync(path)) throw new ConfigError(`Series "${options.series}" not found: ${path} does not exist.`);
  return readYamlFile(path, SeriesSchema);
}

function relativeToRoot(path: string, root: string): string {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}
