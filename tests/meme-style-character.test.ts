import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { ValidationError, loadProject, setStageDone, setStageRunning } from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { addLibraryCharacter, addLibraryFile, entryDir, loadLibraryCharacter, useCharacter } from '../packages/cli/src/character-library.ts';

const entryFile = (ws: string, id: string) => join(entryDir(ws, id), 'character.yaml');
import { validateProject } from '../packages/cli/src/validate.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';

// ST-013: a meme's style-character stage writes its own bibles; finishing it takes new characters into the library.

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A workspace with the meme "office-prank", whose script has Kim (from the library) and Bo (invented) talking. */
async function meme(): Promise<{ ws: string; dir: string }> {
  const ws = await mkdtemp(join(tmpdir(), 'coreslopper-meme-style-'));
  temporary.push(ws);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const dir = await createProject({ root: ws, slug: 'office-prank', budget: 10, kind: 'meme' });
  vi.restoreAllMocks();
  await writeFile(
    join(dir, 'script.yaml'),
    stringify({
      version: 1,
      scenes: [
        {
          id: 'office',
          set: 'open-office',
          description: 'Kim tapes a sign to the coffee machine.',
          lines: [
            { id: 'setup', kind: 'dialogue', speaker: 'kim', text_de: 'Pass mal auf.', text_en: 'Watch this.' },
            { id: 'reply', kind: 'dialogue', speaker: 'bo', text_de: 'Oh nein.', text_en: 'Oh no.' },
          ],
        },
      ],
    }),
  );
  return { ws, dir };
}

async function put(dir: string, path: string, content: string): Promise<void> {
  await mkdir(join(dir, path, '..'), { recursive: true });
  await writeFile(join(dir, path), content);
}

/** Kim from the library (`character use`), then Bo invented with a sheet and a reference voice, and one set. */
async function writeBibles(ws: string, dir: string): Promise<void> {
  const sheet = join(ws, 'kim-sheet.png');
  await writeFile(sheet, 'kim-sheet');
  await addLibraryCharacter(ws, { id: 'kim', name: 'Kim', description: 'Office prankster, red cardigan.' });
  await addLibraryFile(ws, 'kim', sheet, 'sheet');
  await useCharacter(ws, dir, 'kim');
  await put(dir, 'characters/bo/sheet.png', 'bo-sheet');
  await put(dir, 'characters/bo/voice.wav', 'bo-voice');
  const bible = parse(await readFile(join(dir, 'characters.yaml'), 'utf8')) as { characters: Record<string, unknown>[] };
  bible.characters.push({
    id: 'bo',
    name: 'Bo',
    description: 'Tired colleague, grey hoodie.',
    sheet: 'characters/bo/sheet.png',
    refs: ['characters/bo/sheet.png'],
    voice: { ref: 'characters/bo/voice.wav', transcript: 'Oh nein.' },
  });
  await writeFile(join(dir, 'characters.yaml'), stringify(bible));
  await writeFile(
    join(dir, 'sets.yaml'),
    stringify({ version: 1, sets: [{ id: 'open-office', name: 'Open office', description: 'Grey desks, one coffee machine.', prompt: 'open-plan office, grey desks, one coffee machine' }] }),
  );
}

function cli(cwd: string, ...args: string[]) {
  return spawnSync(join(root, 'node_modules', '.bin', 'tsx'), [join(root, 'packages', 'cli', 'src', 'index.ts'), ...args], { cwd, encoding: 'utf8' });
}

async function markDone(dir: string, ...stages: string[]): Promise<void> {
  const project = await loadProject(dir);
  await writeFile(project.paths.state, JSON.stringify(stages.reduce((state, stage) => setStageDone(state, stage, []), project.state), null, 2));
}

async function issuesOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return [(error as Error).message, ...((error as ValidationError).details ?? [])].join('\n');
  }
  throw new Error('the validation passed');
}

describe('the style-character stage of a meme', () => {
  it('stage-done imports the invented characters and leaves the library character it came from as it is', async () => {
    const { ws, dir } = await meme();
    await writeBibles(ws, dir);
    const kimBefore = await readFile(entryFile(ws, 'kim'), 'utf8');

    const result = cli(ws, 'stage-done', dir, 'style-character');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/bo → new entry bo/);
    expect(result.stdout).toMatch(/kim → kim: nothing new/);
    const bo = await loadLibraryCharacter(ws, 'bo');
    expect(bo.origin).toBe('projects/office-prank');
    expect(bo.sheet).toBeDefined();
    expect(bo.voice?.transcript).toBe('Oh nein.');
    expect(await readFile(entryFile(ws, 'kim'), 'utf8')).toBe(kimBefore);
    expect(existsSync(entryFile(ws, 'kim-office-prank'))).toBe(false);
  });

  it('takes an invented speaker while only the library character from setup is in the bible, until style-character starts', async () => {
    const { ws, dir } = await meme();
    const sheet = join(ws, 'kim-sheet.png');
    await writeFile(sheet, 'kim-sheet');
    await addLibraryCharacter(ws, { id: 'kim', name: 'Kim', description: 'Office prankster, red cardigan.' });
    await addLibraryFile(ws, 'kim', sheet, 'sheet');
    await useCharacter(ws, dir, 'kim');

    await expect(validateChangedFile(join(dir, 'script.yaml'))).resolves.toBe('script');

    const project = await loadProject(dir);
    await writeFile(project.paths.state, JSON.stringify(setStageRunning(setStageDone(project.state, 'script', []), 'style-character'), null, 2));
    await expect(validateChangedFile(join(dir, 'script.yaml'))).rejects.toThrow(ValidationError);
  });

  it('validate checks every speaker against the character bible once the stage is done', async () => {
    const { ws, dir } = await meme();
    await writeBibles(ws, dir);
    await markDone(dir, 'setup', 'script', 'style-character');
    const bible = parse(await readFile(join(dir, 'characters.yaml'), 'utf8')) as { characters: { id: string }[] };
    bible.characters = bible.characters.filter((character) => character.id !== 'bo');
    await writeFile(join(dir, 'characters.yaml'), stringify(bible));

    expect(await issuesOf(() => validateProject(dir, { write: false }))).toMatch(/line "reply" \(scene "office"\) has unknown speaker "bo"/);
  });

  it('validate refuses a meme whose style-character stage is done without a character or set bible', async () => {
    const { dir } = await meme();
    await markDone(dir, 'setup', 'script', 'style-character');

    const issues = await issuesOf(() => validateProject(dir, { write: false }));

    expect(issues).toMatch(/characters\.yaml is missing/);
    expect(issues).not.toMatch(/timing\.json is missing/);
  });
});
