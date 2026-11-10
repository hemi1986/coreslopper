import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  CharacterBibleSchema,
  EPISODE_STAGES,
  MUSIC_VIDEO_STAGES,
  ProjectConfigSchema,
  ScriptSchema,
  SeriesSchema,
  SetBibleSchema,
  StateSchema,
  TakesSchema,
  TimingSchema,
  ValidationError,
  createInitialState,
  formatId,
  loadProject,
  migrateState,
  nextStage,
  projectAudioPath,
  readJsonFile,
  readYamlFile,
  resolveStoryboard,
  stagesFor,
  validateScript,
  type Script,
} from '@coreslopper/core';
import { validateProject } from '../packages/cli/src/validate.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';
import { createProject } from '../packages/cli/src/new-project.ts';

const root = process.cwd();
const episodeDir = join(root, 'projects/demo-episode');
const seriesDir = join(root, 'series/demo-series');

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A throwaway workspace with copies of the demo series and the demo episode. */
async function workspace(): Promise<{ dir: string; episode: string; series: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-episode-'));
  temporary.push(dir);
  await cp(seriesDir, join(dir, 'series/demo-series'), { recursive: true });
  await cp(episodeDir, join(dir, 'projects/demo-episode'), { recursive: true });
  return { dir, episode: join(dir, 'projects/demo-episode'), series: join(dir, 'series/demo-series') };
}

async function editYaml(path: string, edit: (value: any) => void): Promise<void> {
  const value = parse(await readFile(path, 'utf8'));
  edit(value);
  await writeFile(path, stringify(value), 'utf8');
}

async function loadCanon() {
  return {
    characters: await readYamlFile(join(seriesDir, 'characters.yaml'), CharacterBibleSchema),
    sets: await readYamlFile(join(seriesDir, 'sets.yaml'), SetBibleSchema),
  };
}

async function loadScript(): Promise<Script> {
  return readYamlFile(join(episodeDir, 'script.yaml'), ScriptSchema);
}

const baseConfig = {
  version: 1,
  slug: 'kind-test',
  title: 'Kind test',
  created: '2026-11-10T00:00:00Z',
  workflow: { version: '0.1.0' },
  budget_usd: 20,
  formats: { master: { aspect: '9:16', width: 1080, height: 1920, fps: 30 } },
};

describe('episode schemas', () => {
  it('parses the demo canon and episode', async () => {
    const series = await readYamlFile(join(seriesDir, 'series.yaml'), SeriesSchema);
    expect(series.slug).toBe('demo-series');
    expect(series.limits.episode_seconds).toEqual({ min: 15, max: 30 });
    const { characters, sets } = await loadCanon();
    expect(characters.characters.find((c) => c.id === 'contact')?.face).toBe('screen-only');
    expect(characters.characters.find((c) => c.id === 'mara')?.voice?.ref).toBe('characters/mara/voice.wav');
    expect(sets.sets.map((set) => set.id)).toEqual(['office', 'elevator']);
    const script = await loadScript();
    expect(script.scenes.map((scene) => scene.id)).toEqual(['s01_office', 's02_elevator']);
    const timing = await readJsonFile(join(episodeDir, 'timing.json'), TimingSchema);
    expect(timing.bpm).toBeUndefined();
    expect(timing.beats).toEqual([]);
  });

  it('defaults a missing kind to music-video and requires series and episode for an episode', () => {
    expect(ProjectConfigSchema.parse(baseConfig).kind).toBe('music-video');
    const episode = ProjectConfigSchema.safeParse({ ...baseConfig, kind: 'episode' });
    expect(episode.success).toBe(false);
    expect(episode.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(['episode', 'series']);
    expect(ProjectConfigSchema.parse({ ...baseConfig, kind: 'episode', series: 'demo-series', episode: 2 }).episode).toBe(2);
  });

  it('defaults the display rule, shot sets, and takes', () => {
    expect(CharacterBibleSchema.parse({ characters: [{ id: 'a', name: 'A', description: 'a' }] }).characters[0]!.face).toBe(
      'full',
    );
    expect(TakesSchema.parse({}).takes).toEqual({});
    expect(() => TakesSchema.parse({ takes: { l01: { source: 'tts', duration: 1, text_hash: 'x' } } })).toThrow();
  });

  it('checks script lines by kind', () => {
    const scene = { id: 's1', set: 'office', description: 'd' };
    const parse = (line: Record<string, unknown>) => ScriptSchema.safeParse({ version: 1, scenes: [{ ...scene, lines: [line] }] });
    expect(parse({ id: 'l1', kind: 'pause', duration: 1 }).success).toBe(true);
    expect(parse({ id: 'l1', kind: 'sfx', prompt: 'door' }).success).toBe(false);
    expect(parse({ id: 'l1', kind: 'dialogue', text_de: 'Hallo.' }).success).toBe(false);
    expect(parse({ id: 'L 1', kind: 'pause', duration: 1 }).success).toBe(false);
    expect(parse({ id: 'l1', kind: 'monologue', speaker: 'a', text_de: 'x' }).success).toBe(false);
  });
});

describe('stages by kind', () => {
  it('picks the stage list from the kind', () => {
    expect(stagesFor(undefined)).toBe(MUSIC_VIDEO_STAGES);
    expect(stagesFor('music-video')).toBe(MUSIC_VIDEO_STAGES);
    expect(stagesFor('episode').map((stage) => stage.id)).toEqual([
      'setup',
      'script',
      'voice-track',
      'episode-track',
      'storyboard',
      'assets',
      'assembly',
      'qa-export',
    ]);
    expect(EPISODE_STAGES.filter((stage) => stage.interactive).map((stage) => stage.id)).toEqual(['setup', 'script']);
  });

  it('creates an episode state that walks the episode stages', () => {
    const config = ProjectConfigSchema.parse({ ...baseConfig, kind: 'episode', series: 'demo-series', episode: 1 });
    const state = createInitialState(config, '0.1.0');
    expect(state.kind).toBe('episode');
    expect(Object.keys(state.stages)).toEqual(EPISODE_STAGES.map((stage) => stage.id));
    state.stages.setup!.status = 'done';
    state.stages.script!.status = 'done';
    expect(nextStage(state)?.id).toBe('voice-track');
  });

  it('migrates the kind from project.yaml but never overwrites a recorded kind', () => {
    const musicVideo = ProjectConfigSchema.parse(baseConfig);
    const episode = ProjectConfigSchema.parse({ ...baseConfig, kind: 'episode', series: 'demo-series', episode: 1 });

    const legacy = createInitialState(musicVideo, '0.1.0');
    delete legacy.kind;
    expect(migrateState(legacy, musicVideo).kind).toBe('music-video');

    const unmarked = createInitialState(episode, '0.1.0');
    delete unmarked.kind;
    delete unmarked.stages['episode-track'];
    const migrated = migrateState(unmarked, episode);
    expect(migrated.kind).toBe('episode');
    expect(migrated.stages['episode-track']?.status).toBe('pending');

    const recorded = createInitialState(musicVideo, '0.1.0');
    expect(migrateState(recorded, episode).kind).toBe('music-video');
  });
});

describe('episode project', () => {
  it('loads the canon from the series folder', async () => {
    const project = await loadProject(episodeDir);
    expect(project.config.kind).toBe('episode');
    expect(project.paths.style).toBe(join(seriesDir, 'style.yaml'));
    expect(project.style?.name).toBe('Night Desk');
    expect(project.characters?.characters).toHaveLength(3);
    expect(project.sets?.sets).toHaveLength(2);
    expect(project.series?.title).toBe('Night Desk');
    expect(project.script?.scenes).toHaveLength(2);
    expect(projectAudioPath(project.config)).toBe('audio/episode.wav');
    expect(formatId(project.config.formats.master.aspect)).toBe('9x16');
  });

  it('ignores style and characters files in the episode folder', async () => {
    const { episode } = await workspace();
    await writeFile(join(episode, 'style.yaml'), 'not: [valid', 'utf8');
    await writeFile(join(episode, 'characters.yaml'), 'version: 1\ncharacters: []\n', 'utf8');
    const project = await loadProject(episode);
    expect(project.characters?.characters).toHaveLength(3);
  });

  it('validates the demo episode', async () => {
    const { resolved } = await validateProject(episodeDir, { write: false });
    expect(resolved.shots).toHaveLength(4);
    expect(resolved.shots[0]!.startFrame).toBe(0);
    expect(resolved.shots.at(-1)!.endFrame).toBe(resolved.durationInFrames);
  });

  it('fails when state.json and project.yaml disagree on the kind', async () => {
    const { episode } = await workspace();
    const statePath = join(episode, 'state.json');
    const state = StateSchema.parse(JSON.parse(await readFile(statePath, 'utf8')));
    await writeFile(statePath, JSON.stringify({ ...state, kind: 'music-video' }), 'utf8');
    await expect(validateProject(episode, { write: false })).rejects.toThrow(/music-video project.*kind "episode"/);
    await expect(validateChangedFile(statePath)).rejects.toThrow(/kind "episode"/);
  });

  it('fails when the series does not exist', async () => {
    const { episode } = await workspace();
    await editYaml(join(episode, 'project.yaml'), (config) => {
      config.series = 'missing-series';
    });
    await expect(loadProject(episode)).rejects.toThrow(/series "missing-series"/);
    await expect(validateChangedFile(join(episode, 'project.yaml'))).rejects.toThrow(/missing-series/);
  });

  it('fails when timing does not match the script', async () => {
    const { episode } = await workspace();
    await editYaml(join(episode, 'script.yaml'), (script) => {
      script.scenes[1].lines.pop();
    });
    await expect(validateProject(episode, { write: false })).rejects.toThrow(/does not match script.yaml/);
  });
});

describe('script validation', () => {
  it('accepts the demo script', async () => {
    const [script, canon] = [await loadScript(), await loadCanon()];
    expect(() => validateScript(script, canon)).not.toThrow();
  });

  function issues(script: Script, canon: Awaited<ReturnType<typeof loadCanon>>): string[] {
    try {
      validateScript(script, canon);
      return [];
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      return (error as ValidationError).details;
    }
  }

  it('lists every broken rule', async () => {
    const canon = await loadCanon();
    const script = structuredClone(await loadScript());
    const [office, elevator] = script.scenes as [Script['scenes'][number], Script['scenes'][number]];
    office.set = 'rooftop';
    elevator.id = office.id;
    const [l01, l02] = office.lines as any[];
    l01.speaker = 'stranger';
    l01.text_de = 'Es ist 23:15 Uhr, z. B. jetzt.';
    delete l01.text_en;
    l02.with = 'l01';
    l02.text_de = 'Raum 204?'; // chat text is not spoken; digits are fine
    (elevator.lines[1] as any).id = 'l05';
    delete script.chat;

    const found = issues(script, canon).join('\n');
    expect(found).toMatch(/duplicate scene id "s01_office"/);
    expect(found).toMatch(/unknown set "rooftop"/);
    expect(found).toMatch(/line "l01".*unknown speaker "stranger"/);
    expect(found).toMatch(/line "l01".*needs text_en/);
    expect(found).toMatch(/line "l01".*23, 15.*z\. B\./);
    expect(found).toMatch(/line "l02".*with: l01.*not supported/);
    expect(found).toMatch(/duplicate line id "l05"/);
    expect(found).toMatch(/chat lines but no "chat/);
    expect(found).not.toMatch(/204/);
  });
});

describe('set rule', () => {
  async function resolveWith(edit: (shots: any[]) => void) {
    const project = await loadProject(episodeDir);
    const storyboard = structuredClone(project.storyboard!);
    edit(storyboard.shots);
    return () =>
      resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, project.characters!, 30, 1, {
        script: project.script!,
        sets: project.sets!,
      });
  }

  it('rejects a set that does not exist', async () => {
    const resolve = await resolveWith((shots) => {
      shots[0].refs.sets = ['rooftop'];
    });
    expect(resolve).toThrow(/missing set "rooftop"/);
  });

  it("rejects a set that is not the set of the shot's scene", async () => {
    const resolve = await resolveWith((shots) => {
      shots[0].refs.sets = ['elevator'];
    });
    expect(resolve).toThrow(/scene "s01_office" plays in set "office"/);
  });

  it('rejects sets outside an episode', async () => {
    const project = await loadProject(episodeDir);
    const storyboard = structuredClone(project.storyboard!);
    expect(() =>
      resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, project.characters!, 30),
    ).toThrow(/only in episode projects/);
  });
});

describe('validate-file for episodes and series', () => {
  it('accepts the canon files and the script', async () => {
    for (const file of ['series.yaml', 'sets.yaml', 'style.yaml', 'characters.yaml']) {
      await expect(validateChangedFile(join(seriesDir, file))).resolves.toBeDefined();
    }
    await expect(validateChangedFile(join(episodeDir, 'script.yaml'))).resolves.toBe('script');
  });

  it('rejects a broken script, series, and sets file', async () => {
    const { episode, series } = await workspace();
    await editYaml(join(episode, 'script.yaml'), (script) => {
      script.scenes[0].lines[0].speaker = 'stranger';
    });
    await expect(validateChangedFile(join(episode, 'script.yaml'))).rejects.toThrow(/Invalid script/);

    await editYaml(join(series, 'series.yaml'), (value) => {
      value.slug = 'other-series';
    });
    await expect(validateChangedFile(join(series, 'series.yaml'))).rejects.toThrow(/does not match the series folder/);

    await editYaml(join(series, 'sets.yaml'), (value) => {
      delete value.sets[0].prompt;
    });
    await expect(validateChangedFile(join(series, 'sets.yaml'))).rejects.toThrow(/sets\.yaml/);
  });
});

describe('new --kind episode', () => {
  it('copies formats, providers, and brand from the series', async () => {
    const { dir } = await workspace();
    await cp(join(root, 'config'), join(dir, 'config'), { recursive: true });
    await cp(join(root, 'templates'), join(dir, 'templates'), { recursive: true });
    const projectDir = await createProject({
      root: dir,
      slug: 'night-desk-02',
      budget: 10,
      kind: 'episode',
      series: 'demo-series',
      episode: 2,
    });
    const config = await readYamlFile(join(projectDir, 'project.yaml'), ProjectConfigSchema);
    expect(config).toMatchObject({
      kind: 'episode',
      series: 'demo-series',
      episode: 2,
      title: 'Second Floor',
      providers: { image: 'mock', video: 'mock', audio: 'mock' },
      formats: { master: { aspect: '9:16', width: 1080, height: 1920 }, derivatives: [] },
    });
    expect(existsSync(join(projectDir, 'characters'))).toBe(false);
    const state = await readJsonFile(join(projectDir, 'state.json'), StateSchema);
    expect(state.kind).toBe('episode');
    expect(Object.keys(state.stages)).toContain('voice-track');

    await expect(
      createProject({ root: dir, slug: 'orphan', budget: 10, kind: 'episode', series: 'nope', episode: 1 }),
    ).rejects.toThrow(/Series "nope" not found/);
  });
});
