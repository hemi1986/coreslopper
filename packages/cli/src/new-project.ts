import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ConfigError,
  ValidationError,
  createInitialState,
  loadDefaults,
  repoRoot,
  writeJsonAtomic,
  writeTextAtomic,
  type ProjectConfig,
} from '@coreslopper/core';
import { stringify } from 'yaml';

export interface NewProjectOptions {
  slug: string;
  title?: string;
  budget?: number;
  brand?: string;
  imageProvider?: 'fal' | 'mock';
  videoProvider?: 'fal' | 'mock';
  songProvider?: 'suno' | 'import' | 'mock';
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

  const projectDir = join(root, 'projects', slug);
  if (existsSync(projectDir)) {
    throw new ValidationError(`Project directory already exists: ${projectDir}`);
  }

  const templateDir = join(root, 'templates', 'project');
  await cp(templateDir, projectDir, { recursive: true, errorOnExist: true });

  const config: ProjectConfig = {
    version: 1,
    slug,
    title: options.title?.trim() || titleFromSlug(slug),
    created: new Date().toISOString(),
    workflow: {
      version: workflowVersion(root),
      ...(workflowCommit(root) ? { commit: workflowCommit(root) } : {}),
    },
    budget_usd: options.budget,
    review_mode: 'auto',
    formats: {
      master: defaults.formats.master,
      derivatives: defaults.formats.derivatives.map((format) => ({
        ...format,
        fps: defaults.formats.master.fps,
      })),
    },
    providers: {
      image: options.imageProvider ?? 'mock',
      video: options.videoProvider ?? 'mock',
      song: options.songProvider ?? 'import',
    },
    song: { variants: 2 },
    brand: options.brand ?? 'example',
    models: {},
  };

  await writeTextAtomic(join(projectDir, 'project.yaml'), stringify(config));
  for (const file of ['brief.md', 'treatment.md', 'README.md', 'lyrics.txt', 'suno-style.txt']) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    const text = await readFile(path, 'utf8');
    await writeFile(path, text.replaceAll('{{TITLE}}', config.title).replaceAll('{{SLUG}}', slug), 'utf8');
  }
  const state = createInitialState(config, config.workflow.version);
  // New projects start with an empty project state; the template carries the
  // creative placeholders that the skills fill in.
  state.stage = 'brief';
  await writeJsonAtomic(join(projectDir, 'state.json'), state);
  await writeJsonAtomic(join(projectDir, 'timing.overrides.json'), {
    version: 1,
    sections: [],
    lines: [],
    words: [],
  });

  for (const directory of ['audio', 'assets', 'renders', 'review', 'brand']) {
    await mkdir(join(projectDir, directory), { recursive: true });
  }
  await writeFile(join(projectDir, 'audio', '.gitkeep'), '');
  await writeFile(join(projectDir, 'assets', '.gitkeep'), '');
  await writeFile(join(projectDir, 'renders', '.gitkeep'), '');
  await writeFile(join(projectDir, 'review', '.gitkeep'), '');
  await writeFile(join(projectDir, 'brand', '.gitkeep'), '');

  // Validate the project shell. Timing and storyboard are intentionally absent
  // at this point; only the project config and state are checked.
  await readFile(join(projectDir, 'project.yaml'), 'utf8');

  console.log(`Created project ${config.title} (${slug}) at ${projectDir}`);
  console.log(`Budget: $${config.budget_usd.toFixed(2)} · providers: image=${config.providers.image}, video=${config.providers.video}, song=${config.providers.song}`);
  console.log('Next: run /video-next ' + slug + ' in Claude Code, or npm run status -- ' + relativeToRoot(projectDir, root));
  return projectDir;
}

function relativeToRoot(path: string, root: string): string {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}
