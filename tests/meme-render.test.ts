import { afterEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { CharacterBibleSchema, ScriptSchema, StyleBibleSchema, type Timing } from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { buildVideoProps } from '../packages/cli/src/render.ts';

// ST-014: a meme's render carries German subtitles in its project's subtitle language.

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const style = StyleBibleSchema.parse({
  name: 'office',
  palette: { background: '#101010', text: '#ffffff' },
  typography: {},
});
const characters = CharacterBibleSchema.parse({ version: 1, characters: [] });

/** The timing of the meme "office-prank": "punchline" at 2-4 s, "reveal-boom" at 5-6.4 s. */
function timing(): Timing {
  return {
    version: 1,
    audio: { path: 'audio/episode.wav', duration: 10, sampleRate: 48_000 },
    beats: [],
    downbeats: [],
    onsets: [],
    energy: { hop: 512, fps: 10, values: [0] },
    sections: [{ id: 'office', label: 'office', start: 0, end: 10, confidence: 1, sources: ['script'] }],
    lines: [
      { id: 'punchline', start: 2, end: 4, section: 'office', text: '', words: [] },
      { id: 'reveal-boom', start: 5, end: 6.4, section: 'office', text: '', words: [] },
    ],
    meta: { generator: 'episode-track' },
  };
}

/**
 * The meme "office-prank" with the dialogue line "punchline" (German and English text) and the sound line
 * "reveal-boom" naming the library sound "vine-boom", whose entry lives in the workspace's library.
 */
async function officePrank(options: { subtitles?: 'de' | 'en' | 'off' } = {}): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'coreslopper-meme-render-'));
  temporary.push(workspace);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(workspace, folder), { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const projectDir = await createProject({ root: workspace, slug: 'office-prank', budget: 10, kind: 'meme' });
  vi.restoreAllMocks();

  await mkdir(join(workspace, 'library', 'sounds', 'vine-boom'), { recursive: true });
  await writeFile(
    join(workspace, 'library', 'sounds', 'vine-boom', 'sound.yaml'),
    stringify({ version: 1, id: 'vine-boom', title: 'Vine boom', use_when: 'a reveal', length: 1.4, loudness: -14, hash: 'a'.repeat(64), added: '2026-11-22T00:00:00Z' }),
  );
  if (options.subtitles) {
    const file = join(projectDir, 'project.yaml');
    const config = parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, stringify({ ...config, subtitles: options.subtitles }));
  }
  await writeFile(
    join(projectDir, 'script.yaml'),
    stringify(
      ScriptSchema.parse({
        version: 1,
        scenes: [
          {
            id: 'office',
            set: 'open-office',
            description: 'The printer refuses to print.',
            lines: [
              { id: 'punchline', kind: 'dialogue', speaker: 'kim', text_de: 'Ich drucke nicht mehr.', text_en: 'I am not printing anymore.' },
              { id: 'reveal-boom', kind: 'sfx', sound: 'vine-boom' },
            ],
          },
        ],
      }),
    ),
  );
  await writeFile(join(projectDir, 'timing.json'), JSON.stringify(timing()));
  await writeFile(join(projectDir, 'style.yaml'), stringify(style));
  await writeFile(join(projectDir, 'characters.yaml'), stringify(characters));
  await writeFile(
    join(projectDir, 'storyboard.yaml'),
    stringify({
      version: 1,
      shots: [
        {
          id: 'shot-001',
          section: 'office',
          start: { type: 'time', seconds: 0 },
          end: { type: 'time', seconds: 10 },
          source: 'motion',
          description: 'The printer jams.',
          motion: { component: 'TitleCard' },
        },
      ],
    }),
  );
  return projectDir;
}

describe('subtitles for a meme', () => {
  it("ST-014: The meme's render carries its spoken lines", async () => {
    const projectDir = await officePrank();
    const { props } = await buildVideoProps({ projectDir });

    expect(props.subtitles).toEqual([{ start: 2, end: 4, text: 'Ich drucke nicht mehr.' }]);
  });

  it('ST-014: A sound line shows no subtitle', async () => {
    const projectDir = await officePrank();
    const { props } = await buildVideoProps({ projectDir });

    expect(props.subtitles).toBeDefined();
    // "reveal-boom" plays from 5 to 6.4 s and names no on-screen text.
    expect((props.subtitles ?? []).filter((cue) => cue.start < 6.4 && cue.end > 5)).toEqual([]);
  });

  it('ST-014: Subtitles can be turned off', async () => {
    const projectDir = await officePrank({ subtitles: 'off' });
    const { props } = await buildVideoProps({ projectDir });

    expect(props.subtitles).toBeUndefined();
  });
});
