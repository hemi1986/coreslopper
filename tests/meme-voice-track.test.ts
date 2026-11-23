import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { StateSchema, TakesSchema, readJsonFile } from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { resolveBinary } from '../packages/cli/src/media.ts';
import { addLibrarySound, removeLibrarySound, soundDir, updateLibrarySound } from '../packages/cli/src/sound-library.ts';
import { episodeTrack } from '../packages/cli/src/episode-track.ts';
import { voiceTrack } from '../packages/cli/src/voice-track.ts';

// ST-011: the voice track copies a sound line's library sound into the meme as a take (POL-TakeChosenLibrarySounds).

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function hasFfmpeg(): boolean {
  try {
    resolveBinary('ffmpeg');
    resolveBinary('ffprobe');
    return true;
  } catch {
    return false;
  }
}

/** A workspace with the meme "office-prank" whose script has the sound line "reveal-boom" naming "vine-boom". */
async function officePrank(lines: Record<string, unknown>[] = [{ id: 'reveal-boom', kind: 'sfx', sound: 'vine-boom' }]): Promise<{ workspace: string; projectDir: string }> {
  const workspace = await mkdtemp(join(tmpdir(), 'coreslopper-meme-voice-'));
  temporary.push(workspace);
  await cp(join(root, 'config'), join(workspace, 'config'), { recursive: true });
  await cp(join(root, 'templates'), join(workspace, 'templates'), { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const projectDir = await createProject({ root: workspace, slug: 'office-prank', budget: 10, kind: 'meme' });
  for (const file of ['characters.yaml', 'sets.yaml']) await cp(join(root, 'projects/demo-series', file), join(projectDir, file));
  const script = {
    version: 1,
    title: 'Office Prank',
    scenes: [{ id: 's01_office', set: 'office', description: 'The sign on the coffee machine.', lines }],
  };
  await writeFile(join(projectDir, 'script.yaml'), stringify(script), 'utf8');
  return { workspace, projectDir };
}

/** "vine-boom" in the library: a 2-second tone with the trim 0.0-1.0. */
async function addVineBoom(workspace: string): Promise<void> {
  const file = join(workspace, 'boom.wav');
  execFileSync(resolveBinary('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=80:duration=2', file]);
  await addLibrarySound(workspace, { file, id: 'vine-boom', title: 'Vine boom', useWhen: 'a reveal', trim: '0.0-1.0' });
}

const takesOf = (projectDir: string) => readJsonFile(join(projectDir, 'takes.json'), TakesSchema);

describe.skipIf(!hasFfmpeg())('the voice track takes library sounds into a meme', () => {
  it('ST-011: A library sound becomes a take without cost', async () => {
    const { workspace, projectDir } = await officePrank();
    await addVineBoom(workspace);

    await voiceTrack(projectDir);

    const take = (await takesOf(projectDir)).takes['reveal-boom'];
    expect(take).toMatchObject({ source: 'library:vine-boom' });
    expect(take!.duration).toBeCloseTo(1.0, 2);
    // Nothing went through the generation path: no manifest entry, no spend.
    expect(existsSync(join(projectDir, 'assets', 'manifest.jsonl'))).toBe(false);
    const state = await readJsonFile(join(projectDir, 'state.json'), StateSchema);
    expect(state.budget.spentUsd).toBe(0);
    // The take is current for the track, too.
    await expect(episodeTrack(projectDir)).resolves.toBeDefined();
  });

  it('ST-011: A changed trim takes the sound again', async () => {
    const { workspace, projectDir } = await officePrank();
    await addVineBoom(workspace);
    await voiceTrack(projectDir);
    const before = (await takesOf(projectDir)).takes['reveal-boom']!;

    await updateLibrarySound(workspace, 'vine-boom', { trim: '0.0-0.8' });
    await voiceTrack(projectDir);

    const after = (await takesOf(projectDir)).takes['reveal-boom']!;
    expect(after.duration).toBeCloseTo(0.8, 2);
    expect(after.text_hash).not.toBe(before.text_hash);
    expect(after.file_hash).not.toBe(before.file_hash);
  });

  it('ST-011: A removed library sound keeps the take and warns', async () => {
    const { workspace, projectDir } = await officePrank();
    await addVineBoom(workspace);
    await voiceTrack(projectDir);
    const before = await readFile(join(projectDir, 'takes.json'), 'utf8');

    await rm(soundDir(workspace, 'vine-boom'), { recursive: true });
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => void warnings.push(String(line)));
    await voiceTrack(projectDir);

    expect(await readFile(join(projectDir, 'takes.json'), 'utf8')).toBe(before);
    expect(warnings).toEqual([expect.stringMatching(/"vine-boom" is no longer in the library/)]);
    await expect(episodeTrack(projectDir)).resolves.toBeDefined();
  });

  it('ST-003: A meme keeps the take of a removed sound', async () => {
    const { workspace, projectDir } = await officePrank();
    await addVineBoom(workspace);
    await voiceTrack(projectDir);
    const take = (await takesOf(projectDir)).takes['reveal-boom']!;
    const file = join(projectDir, 'audio', 'lines', 'reveal-boom.wav');
    const audio = await readFile(file);

    await removeLibrarySound(workspace, 'vine-boom');

    expect((await takesOf(projectDir)).takes['reveal-boom']).toEqual(take);
    expect(existsSync(file)).toBe(true);
    expect(await readFile(file)).toEqual(audio);
    // Still current: the next voice track copies nothing for the line and only warns.
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => void warnings.push(String(line)));
    const registered = await readFile(join(projectDir, 'takes.json'), 'utf8');
    await voiceTrack(projectDir);
    expect(await readFile(join(projectDir, 'takes.json'), 'utf8')).toBe(registered);
    expect(warnings).toEqual([expect.stringMatching(/"vine-boom" is no longer in the library/)]);
  });

  it('ST-011: A line naming a sound that never was taken and is gone stops the voice track', async () => {
    const { projectDir } = await officePrank();

    await expect(voiceTrack(projectDir)).rejects.toMatchObject({
      details: [expect.stringMatching(/"reveal-boom".*no library sound "vine-boom"/)],
    });
    expect((await takesOf(projectDir).catch(() => TakesSchema.parse({}))).takes['reveal-boom']).toBeUndefined();
  });

  it('stops on a second line naming a removed sound that has no take of its own', async () => {
    const { workspace, projectDir } = await officePrank();
    await addVineBoom(workspace);
    await voiceTrack(projectDir);
    await rm(soundDir(workspace, 'vine-boom'), { recursive: true });
    const scriptPath = join(projectDir, 'script.yaml');
    const script = parse(await readFile(scriptPath, 'utf8'));
    script.scenes[0].lines.push({ id: 'second-boom', kind: 'sfx', sound: 'vine-boom' });
    await writeFile(scriptPath, stringify(script), 'utf8');

    for (const run of [voiceTrack, episodeTrack]) {
      await expect(run(projectDir)).rejects.toMatchObject({ details: expect.arrayContaining([expect.stringMatching(/no library sound "vine-boom"/)]) });
    }
  });

  it('copies a sound line whose imported take was deleted with the hash of the sound', async () => {
    const { workspace, projectDir } = await officePrank();
    await addVineBoom(workspace);
    await voiceTrack(projectDir);
    const takes = await takesOf(projectDir);
    takes.takes['reveal-boom'] = { ...takes.takes['reveal-boom']!, source: 'imported' };
    await writeFile(join(projectDir, 'takes.json'), JSON.stringify(takes), 'utf8');
    await rm(join(projectDir, 'audio', 'lines', 'reveal-boom.wav'));

    await voiceTrack(projectDir);
    const copied = await readFile(join(projectDir, 'takes.json'), 'utf8');
    expect(JSON.parse(copied).takes['reveal-boom'].source).toBe('library:vine-boom');
    await voiceTrack(projectDir);
    expect(await readFile(join(projectDir, 'takes.json'), 'utf8')).toBe(copied);
  });
});
