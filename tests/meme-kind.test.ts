import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import {
  MEME_MAX_SECONDS,
  MEME_STAGES,
  MemeTemplateSchema,
  ProjectConfigSchema,
  ProjectKindSchema,
  StateSchema,
  createInitialState,
  projectNextAction,
  readJsonFile,
  readYamlFile,
  setStageDone,
  stageViews,
} from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { printStatus } from '../packages/cli/src/status.ts';
import { episodeTrack } from '../packages/cli/src/episode-track.ts';
import { resolveBinary } from '../packages/cli/src/media.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const MEME_STAGE_IDS = [
  'setup',
  'script',
  'style-character',
  'voice-track',
  'episode-track',
  'storyboard',
  'assets',
  'assembly',
  'qa-export',
];

const memeConfig = ProjectConfigSchema.parse({
  version: 1,
  slug: 'office-prank',
  kind: 'meme',
  title: 'Office Prank',
  created: '2026-11-22T00:00:00Z',
  workflow: { version: '0.1.0' },
  budget_usd: 10,
  formats: { master: { aspect: '9:16', width: 1080, height: 1920, fps: 30 } },
});

/** A workspace with the shipped config and templates, and a meme created by `new --kind meme`. */
async function memeWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-meme-'));
  temporary.push(dir);
  await cp(join(root, 'config'), join(dir, 'config'), { recursive: true });
  await cp(join(root, 'templates'), join(dir, 'templates'), { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const projectDir = await createProject({ root: dir, slug: 'office-prank', budget: 10, kind: 'meme' });
  vi.restoreAllMocks();
  return projectDir;
}

async function statusLines(projectDir: string): Promise<string[]> {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  await printStatus(projectDir);
  vi.restoreAllMocks();
  return lines.flatMap((line) => line.split('\n'));
}

function hasFfmpeg(): boolean {
  try {
    resolveBinary('ffmpeg');
    resolveBinary('ffprobe');
    return true;
  } catch {
    return false;
  }
}

/**
 * A finished script and the meme's own bibles (borrowed from the demo canon),
 * with pause lines only: pauses have no takes, so the track's length is known
 * without generating audio.
 */
async function writeScript(projectDir: string, pauses: number[]): Promise<void> {
  const script = {
    version: 1,
    title: 'Office Prank',
    scenes: [
      {
        id: 's01_office',
        set: 'office',
        description: 'The office before the punchline.',
        lines: pauses.map((duration, index) => ({ id: `p${index + 1}`, kind: 'pause', duration })),
      },
    ],
  };
  await writeFile(join(projectDir, 'script.yaml'), stringify(script), 'utf8');
  for (const file of ['characters.yaml', 'sets.yaml']) {
    await cp(join(root, 'projects/demo-series', file), join(projectDir, file));
  }
}

describe('project kind meme', () => {
  it('is a project kind; a missing kind still means music-video', () => {
    expect(ProjectKindSchema.parse('meme')).toBe('meme');
    expect(memeConfig.kind).toBe('meme');
    const { kind: _kind, ...withoutKind } = memeConfig;
    expect(ProjectConfigSchema.parse(withoutKind).kind).toBe('music-video');
  });

  it('has exactly the nine meme stages in order, setup and script interactive', () => {
    const state = createInitialState(memeConfig, '0.1.0');
    expect(state.kind).toBe('meme');
    expect(Object.keys(state.stages)).toEqual(MEME_STAGE_IDS);
    expect(MEME_STAGES.map((stage) => stage.id)).toEqual(MEME_STAGE_IDS);
    expect(MEME_STAGES.filter((stage) => stage.interactive).map((stage) => stage.id)).toEqual(['setup', 'script']);
    expect(state.stage).toBe('setup');
  });

  it('names /new-meme <slug> in the production view while script is open', () => {
    const state = createInitialState(memeConfig, '0.1.0');
    setStageDone(state, 'setup', ['project.yaml', 'pitch.md']);
    const next = projectNextAction({ slug: 'office-prank', kind: 'meme', stages: stageViews(state), hasRelease: false });
    expect(next).toEqual({ where: 'claude', command: '/new-meme office-prank', reason: 'interactive', stage: 'script' });

    setStageDone(state, 'script', ['script.yaml']);
    expect(projectNextAction({ slug: 'office-prank', kind: 'meme', stages: stageViews(state), hasRelease: false })).toMatchObject({
      command: '/video-next office-prank',
      stage: 'style-character',
    });
  });

  it('names /new-meme <slug> in status while script is open', async () => {
    const projectDir = await memeWorkspace();
    const state = await readJsonFile(join(projectDir, 'state.json'), StateSchema);
    setStageDone(state, 'setup', ['project.yaml', 'pitch.md']);
    await writeFile(join(projectDir, 'state.json'), JSON.stringify(state), 'utf8');

    const lines = await statusLines(projectDir);
    expect(lines).toContain('Kind: meme');
    expect(lines.find((line) => line.startsWith('Next:'))).toBe(
      'Next: script (grilling, new-meme) · interactive · run /new-meme office-prank',
    );
  });
});

describe('the meme template', () => {
  it('holds project.yaml with kind meme and the one 9:16 format, and an empty pitch.md', async () => {
    const template = await readYamlFile(join(root, 'templates/meme/project.yaml'), MemeTemplateSchema);
    expect(template).toEqual({
      version: 1,
      kind: 'meme',
      formats: { master: { aspect: '9:16', width: 1080, height: 1920, fps: 30 }, derivatives: [] },
    });
    expect(await readFile(join(root, 'templates/meme/pitch.md'), 'utf8')).toBe('');
  });

  it('new --kind meme creates a 9:16 meme at setup with an empty pitch', async () => {
    const projectDir = await memeWorkspace();
    const config = await readYamlFile(join(projectDir, 'project.yaml'), ProjectConfigSchema);
    expect(config).toMatchObject({
      kind: 'meme',
      slug: 'office-prank',
      budget_usd: 10,
      formats: { master: { aspect: '9:16', width: 1080, height: 1920 }, derivatives: [] },
    });
    expect(config.series).toBeUndefined();
    expect(await readFile(join(projectDir, 'pitch.md'), 'utf8')).toBe('');
    expect(existsSync(join(projectDir, 'audio', 'lines'))).toBe(true);
    expect(existsSync(join(projectDir, 'lyrics.txt'))).toBe(false);
    const state = await readJsonFile(join(projectDir, 'state.json'), StateSchema);
    expect(Object.keys(state.stages)).toEqual(MEME_STAGE_IDS);
  });
});

describe('episode-track on a meme', () => {
  it(`refuses a track over ${MEME_MAX_SECONDS} seconds as a hard stop`, async () => {
    const projectDir = await memeWorkspace();
    await writeScript(projectDir, [20, 10.5]);
    await expect(episodeTrack(projectDir)).rejects.toThrow(/lasts 30\.500 s; a meme lasts at most 30 s/);
    expect(existsSync(join(projectDir, 'timing.json'))).toBe(false);
    expect(existsSync(join(projectDir, 'audio', 'episode.wav'))).toBe(false);
  });

  it.skipIf(!hasFfmpeg())('builds a track of exactly 30 seconds', async () => {
    const projectDir = await memeWorkspace();
    await writeScript(projectDir, [20, 10]);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const timing = await episodeTrack(projectDir);
    expect(timing.audio).toMatchObject({ path: 'audio/episode.wav', duration: 30 });
    expect(existsSync(join(projectDir, 'audio', 'episode.wav'))).toBe(true);
  });
});
