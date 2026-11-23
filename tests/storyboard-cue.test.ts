/**
 * ST-012: a shot lands on a sound's cue. A line anchor of a meme's storyboard may name the cue of a sound line
 * (`edge: cue`), resolved to the line's start plus the library sound's cue; any other line is refused. A meme has
 * exactly one format, 9:16.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  CharacterBibleSchema,
  ScriptSchema,
  StoryboardSchema,
  StyleBibleSchema,
  ValidationError,
  resolveStoryboard,
  soundCuesByLine,
  type CharacterBible,
  type Script,
  type SoundCues,
  type StyleBible,
  type Timing,
} from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { buildShotItems } from '../packages/cli/src/queue.ts';
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
const cue = (id: string, offset = 0) => ({ type: 'line', id, edge: 'cue', offset });

function resolve(shots: Record<string, unknown>[], timing: Timing, cues: SoundCues) {
  return resolveStoryboard(StoryboardSchema.parse({ version: 1, shots }), timing, style, characters, 30, 1, { cues });
}

function issueOf(error: unknown): string {
  expect(error).toBeInstanceOf(ValidationError);
  const validation = error as ValidationError;
  return [validation.message, ...validation.details].join('\n');
}

/** The meme "office-prank": the sound line "reveal-boom" names "vine-boom" (cue 0.12), the library holds it. */
async function officePrank(sound: Record<string, unknown> = {}): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'coreslopper-meme-cue-'));
  temporary.push(workspace);
  await cp(join(root, 'config'), join(workspace, 'config'), { recursive: true });
  await cp(join(root, 'templates'), join(workspace, 'templates'), { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const projectDir = await createProject({ root: workspace, slug: 'office-prank', budget: 10, kind: 'meme' });
  vi.restoreAllMocks();

  const library = { version: 1, id: 'vine-boom', title: 'Vine boom', use_when: 'a reveal', length: 1.4, loudness: -14, cue: 0.12, hash: 'a'.repeat(64), added: '2026-11-22T00:00:00Z', ...sound };
  await mkdir(join(workspace, 'library', 'sounds', 'vine-boom'), { recursive: true });
  await writeFile(join(workspace, 'library', 'sounds', 'vine-boom', 'sound.yaml'), stringify(library), 'utf8');
  await writeFile(
    join(projectDir, 'script.yaml'),
    stringify(scriptOf([{ id: 'reveal-boom', kind: 'sfx', sound: 'vine-boom' }])),
    'utf8',
  );
  await writeFile(join(projectDir, 'timing.json'), JSON.stringify(timingOf([{ id: 'reveal-boom', start: 6, end: 7.4 }])), 'utf8');
  await writeFile(join(projectDir, 'style.yaml'), stringify(style), 'utf8');
  await writeFile(join(projectDir, 'characters.yaml'), stringify(characters), 'utf8');
  return projectDir;
}

describe('a shot lands on a sound cue', () => {
  it('ST-012: A cue anchor resolves to the hit', async () => {
    const projectDir = await officePrank();
    await writeFile(
      join(projectDir, 'storyboard.yaml'),
      stringify({
        version: 1,
        shots: [
          shot('shot-001', time(0), cue('reveal-boom')),
          {
            ...shot('shot-002', cue('reveal-boom'), time(10)),
            source: 'ai-clip',
            prompts: { keyframe: 'The sign on the coffee machine.', video: 'The sign falls.' },
          },
        ],
      }),
      'utf8',
    );

    const { project, resolved } = await validateProject(projectDir, { write: false });

    expect(resolved.shots[0]!.endSeconds).toBeCloseTo(6.12, 6);
    expect(resolved.shots[1]!.startSeconds).toBeCloseTo(6.12, 6);
    expect(resolved.shots[1]!.startFrame).toBe(184);
    // The queue resolves the raw anchors too, so a cue-anchored clip still gets its length (the blocker of review #1).
    const { items } = await buildShotItems(project, { kind: 'clip', shots: ['002'] });
    expect(items[0]!.durationSeconds).toBe(4);
    // The offset still applies on a cue anchor.
    const offsetTiming = timingOf([{ id: 'reveal-boom', start: 6, end: 7.4 }]);
    const offsetCues = soundCuesByLine(scriptOf([{ id: 'reveal-boom', kind: 'sfx', sound: 'vine-boom' }]), { 'vine-boom': { cue: 0.12 } });
    expect(resolve([shot('shot-001', time(0), cue('reveal-boom', 0.25)), shot('shot-002', cue('reveal-boom', 0.25), time(10))], offsetTiming, offsetCues).shots[1]!.startSeconds).toBeCloseTo(6.37, 6);
  });

  it('ST-012: A cue anchor on a spoken line is refused', () => {
    const timing = timingOf([{ id: 'punchline', start: 6, end: 8 }]);
    const script = scriptOf([{ id: 'punchline', kind: 'dialogue', speaker: 'kim', text_de: 'Und jetzt?', text_en: 'And now?' }]);
    const cues = soundCuesByLine(script, {});

    let failure: unknown;
    try {
      resolve([shot('shot-001', time(0), cue('punchline')), shot('shot-002', time(8), time(10))], timing, cues);
    } catch (error) {
      failure = error;
    }
    expect(issueOf(failure)).toContain('"punchline" has no sound cue');
  });

  it('ST-012: A sound without a cue is refused', () => {
    const timing = timingOf([{ id: 'reveal-boom', start: 6, end: 7.4 }]);
    const script = scriptOf([{ id: 'reveal-boom', kind: 'sfx', sound: 'vine-boom' }]);
    const cues = soundCuesByLine(script, { 'vine-boom': {} });

    let failure: unknown;
    try {
      resolve([shot('shot-001', time(0), cue('reveal-boom')), shot('shot-002', time(7.4), time(10))], timing, cues);
    } catch (error) {
      failure = error;
    }
    expect(issueOf(failure)).toContain('"vine-boom" has no sound cue');
  });

  it('refuses a cue anchor on a sound the library no longer holds', () => {
    const timing = timingOf([{ id: 'reveal-boom', start: 6, end: 7.4 }]);
    const script = scriptOf([{ id: 'reveal-boom', kind: 'sfx', sound: 'vine-boom' }]);
    // The entry is gone; the meme keeps the take (HS-260), but its cue went with the entry.
    const cues = soundCuesByLine(script, {});

    let failure: unknown;
    try {
      resolve([shot('shot-001', time(0), cue('reveal-boom')), shot('shot-002', time(7.4), time(10))], timing, cues);
    } catch (error) {
      failure = error;
    }
    expect(issueOf(failure)).toContain('"vine-boom" is no longer in the sound library');
  });
});

describe('a meme has one format', () => {
  it('ST-012: A meme with a second format is refused', async () => {
    const projectDir = await officePrank();

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
