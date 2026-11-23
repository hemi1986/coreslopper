/**
 * ST-012: a shot lands on a sound's cue. A line anchor of a meme's storyboard may name the cue of a sound line
 * (`edge: cue`), resolved to the line's start plus the library sound's cue; any other line is refused. A meme has
 * exactly one format, 9:16.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  CharacterBibleSchema,
  ScriptSchema,
  StoryboardSchema,
  StyleBibleSchema,
  ValidationError,
  lineCues,
  resolveStoryboard,
  type Script,
  type StyleBible,
  type CharacterBible,
  type Timing,
} from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { validateProject } from '../packages/cli/src/validate.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const style: StyleBible = StyleBibleSchema.parse({
  name: 'office',
  palette: { background: '#101010', text: '#ffffff' },
  typography: {},
});
const characters: CharacterBible = CharacterBibleSchema.parse({ version: 1, characters: [] });

/** The timing of a meme whose script lines start at the given seconds. */
function timingOf(lines: Array<{ id: string; start: number; end: number }>, duration = 10): Timing {
  return {
    version: 1,
    audio: { path: 'audio/episode.wav', duration, sampleRate: 48_000 },
    beats: [],
    downbeats: [],
    onsets: [],
    energy: { hop: 512, fps: 10, values: [0] },
    sections: [{ id: 'office', label: 'office', start: 0, end: duration, confidence: 1, sources: ['script'] }],
    lines: lines.map((line) => ({ ...line, section: 'office', text: '', words: [] })),
    meta: { generator: 'episode-track' },
  };
}

function scriptOf(lines: Record<string, unknown>[]): Script {
  return ScriptSchema.parse({
    version: 1,
    scenes: [{ id: 'office', set: 'open-office', description: 'The sign on the coffee machine.', lines }],
  });
}

function shot(id: string, start: Record<string, unknown>, end: Record<string, unknown>): Record<string, unknown> {
  return { id, section: 'office', start, end, source: 'motion', description: `shot ${id}`, motion: { component: 'TitleCard' } };
}

const time = (seconds: number) => ({ type: 'time', seconds });
const cue = (id: string) => ({ type: 'line', id, edge: 'cue' });

function resolve(shots: Record<string, unknown>[], timing: Timing, cues: ReturnType<typeof lineCues>) {
  return resolveStoryboard(StoryboardSchema.parse({ version: 1, shots }), timing, style, characters, 30, 1, undefined, undefined, cues);
}

function issueOf(error: unknown): string {
  expect(error).toBeInstanceOf(ValidationError);
  const validation = error as ValidationError;
  return [validation.message, ...validation.details].join('\n');
}

describe('a shot lands on a sound cue', () => {
  it('ST-012: A cue anchor resolves to the hit', () => {
    const timing = timingOf([{ id: 'reveal-boom', start: 6, end: 7.4 }]);
    const script = scriptOf([{ id: 'reveal-boom', kind: 'sfx', sound: 'vine-boom' }]);
    const cues = lineCues(script, { 'vine-boom': { cue: 0.12 } });

    const resolved = resolve(
      [
        shot('shot-001', time(0), cue('reveal-boom')),
        shot('shot-002', cue('reveal-boom'), time(10)),
      ],
      timing,
      cues,
    );

    expect(resolved.shots[0]!.endSeconds).toBeCloseTo(6.12, 6);
    expect(resolved.shots[1]!.startSeconds).toBeCloseTo(6.12, 6);
    expect(resolved.shots[1]!.startFrame).toBe(Math.round(6.12 * 30));
  });

  it('ST-012: A cue anchor on a spoken line is refused', () => {
    const timing = timingOf([{ id: 'punchline', start: 6, end: 8 }]);
    const script = scriptOf([{ id: 'punchline', kind: 'dialogue', speaker: 'kim', text_de: 'Und jetzt?', text_en: 'And now?' }]);
    const cues = lineCues(script, {});

    expect(() =>
      resolve(
        [shot('shot-001', time(0), cue('punchline')), shot('shot-002', time(8), time(10))],
        timing,
        cues,
      ),
    ).toThrow(/"punchline" has no sound cue/);
  });

  it('ST-012: A sound without a cue is refused', () => {
    const timing = timingOf([{ id: 'reveal-boom', start: 6, end: 7.4 }]);
    const script = scriptOf([{ id: 'reveal-boom', kind: 'sfx', sound: 'vine-boom' }]);
    const cues = lineCues(script, { 'vine-boom': {} });

    expect(() =>
      resolve(
        [shot('shot-001', time(0), cue('reveal-boom')), shot('shot-002', time(7.4), time(10))],
        timing,
        cues,
      ),
    ).toThrow(/"vine-boom" has no cue/);
  });
});

describe('a meme has one format', () => {
  it('ST-012: A meme with a second format is refused', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'coreslopper-meme-cue-'));
    temporary.push(workspace);
    await cp(join(root, 'config'), join(workspace, 'config'), { recursive: true });
    await cp(join(root, 'templates'), join(workspace, 'templates'), { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const projectDir = await createProject({ root: workspace, slug: 'office-prank', budget: 10, kind: 'meme' });
    vi.restoreAllMocks();

    const configFile = join(projectDir, 'project.yaml');
    const config = parse(await readFile(configFile, 'utf8')) as Record<string, any>;
    config.formats.derivatives.push({ aspect: '16:9', width: 1920, height: 1080, fps: 30 });
    await writeFile(configFile, stringify(config), 'utf8');

    let failure: unknown;
    try {
      await validateProject(projectDir);
    } catch (error) {
      failure = error;
    }
    expect(issueOf(failure)).toContain('a meme has only the format 9:16');
  });
});
