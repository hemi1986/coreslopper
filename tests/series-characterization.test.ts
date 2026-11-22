import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  CharacterBibleSchema,
  ScriptSchema,
  SetBibleSchema,
  ValidationError,
  ambienceSource,
  hashObject,
  loadProject,
  readYamlFile,
  seriesNextAction,
  takeSource,
  validateScript,
  type Script,
  type ScriptLine,
} from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';

// Characterization tests for the series slice (adopted 2026-11-22, docs/domain/adoption-report.md).
// They pin what the code does today and the confirmed model keeps, not what the gap register wants.

const root = process.cwd();
const seriesDir = join(root, 'projects/demo-series');
const episodeDir = join(root, 'projects/demo-episode');

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function canon() {
  return {
    characters: await readYamlFile(join(seriesDir, 'characters.yaml'), CharacterBibleSchema),
    sets: await readYamlFile(join(seriesDir, 'sets.yaml'), SetBibleSchema),
  };
}

async function demoScript(): Promise<Script> {
  return structuredClone(await readYamlFile(join(episodeDir, 'script.yaml'), ScriptSchema));
}

function lineOf<K extends ScriptLine['kind']>(script: Script, kind: K): Extract<ScriptLine, { kind: K }> {
  const line = script.scenes.flatMap((scene) => scene.lines).find((candidate) => candidate.kind === kind);
  if (!line) throw new Error(`the demo script has no ${kind} line`);
  return line as Extract<ScriptLine, { kind: K }>;
}

describe('take source', () => {
  it('stales a spoken take on its speaker or spoken text, not on its subtitle or pause', async () => {
    const line = lineOf(await demoScript(), 'dialogue');
    const hash = hashObject(takeSource(line));
    expect(hashObject(takeSource({ ...line, text_en: 'Another subtitle', pause_after: 3 }))).toBe(hash);
    expect(hashObject(takeSource({ ...line, text_de: `${line.text_de} Noch etwas.` }))).not.toBe(hash);
    expect(hashObject(takeSource({ ...line, speaker: 'someone-else' }))).not.toBe(hash);
  });

  it('stales an effect on its prompt or length, an ambience only on its prompt, and gives silent lines no take', async () => {
    const script = await demoScript();
    const effect = lineOf(script, 'sfx');
    const hash = hashObject(takeSource(effect));
    expect(hashObject(takeSource({ ...effect, duration: effect.duration + 1 }))).not.toBe(hash);
    expect(hashObject(takeSource({ ...effect, prompt: `${effect.prompt}, louder` }))).not.toBe(hash);
    expect(ambienceSource('office hum')).toEqual({ kind: 'ambience', prompt: 'office hum' });
    expect(() => takeSource(lineOf(script, 'pause'))).toThrow(/has no take/);
    expect(() => takeSource(lineOf(script, 'chat'))).toThrow(/has no take/);
  });
});

describe('script rules', () => {
  it('exempts a leading voice description from the TTS rule, but not the spoken text after it', async () => {
    const bible = await canon();
    const script = await demoScript();
    const spoken = lineOf(script, 'dialogue');
    const text = spoken.text_de;
    spoken.text_de = `(leise, nach 2 Sekunden) ${text}`;
    expect(() => validateScript(script, bible)).not.toThrow();
    spoken.text_de = `(leise) ${text} Um 23 Uhr.`;
    let details: string[] = [];
    try {
      validateScript(script, bible);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      details = (error as ValidationError).details;
    }
    expect(details.join('\n')).toMatch(/Speech text contains 23\b/);
    expect(details.join('\n')).not.toMatch(/contains 2\b/);
  });
});

describe('series next action', () => {
  it('finishes the canon first, then creates the planned episodes, then is done', () => {
    expect(seriesNextAction({ slug: 'night', canonReady: false, unplanned: [2] })).toEqual({
      where: 'claude',
      command: '/new-series night',
      reason: 'canon',
    });
    expect(seriesNextAction({ slug: 'night', canonReady: true, unplanned: [2] })).toEqual({
      where: 'claude',
      command: '/new-episode',
      reason: 'episode',
    });
    expect(seriesNextAction({ slug: 'night', canonReady: true, unplanned: [] })).toEqual({ where: 'none', reason: 'series-done' });
  });
});

describe('episode settings', () => {
  it('are copied from the series once and not inherited when the series changes later', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-series-char-'));
    temporary.push(dir);
    for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(dir, folder), { recursive: true });
    await cp(seriesDir, join(dir, 'projects/demo-series'), { recursive: true });
    const projectDir = await createProject({ root: dir, slug: 'night-desk-02', budget: 10, kind: 'episode', series: 'demo-series', episode: 2 });

    const seriesPath = join(dir, 'projects/demo-series/series.yaml');
    const series = parse(await readFile(seriesPath, 'utf8'));
    series.providers = { image: 'fal', video: 'fal', audio: 'comfyui' };
    series.brand = 'another-brand';
    await writeFile(seriesPath, stringify(series));

    const { config } = await loadProject(projectDir);
    expect(config.providers).toMatchObject({ image: 'mock', video: 'mock', audio: 'mock' });
    expect(config.brand).toBe('example');
    expect(config.formats.master).toMatchObject({ aspect: '9:16', width: 1080, height: 1920 });
  });
});
