import { afterEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { ScriptSchema, ValidationError, knownLineSeconds, validateScript, type Script } from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';
import { scriptSounds } from '../packages/cli/src/script-canon.ts';

// ST-009: a meme's script names library sounds and its own characters; there is no series canon.

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** The meme "office-prank": a line, a sound line with the given fields, a pause. */
function officePrank(sound: Record<string, unknown>, extra: Record<string, unknown>[] = []): Script {
  return ScriptSchema.parse({
    version: 1,
    scenes: [
      {
        id: 'office',
        set: 'open-office',
        description: 'Kim tapes a sign to the coffee machine.',
        lines: [
          { id: 'setup', kind: 'dialogue', speaker: 'kim', text_de: 'Pass mal auf.', text_en: 'Watch this.' },
          { id: 'reveal-boom', kind: 'sfx', ...sound },
          ...extra,
        ],
      },
    ],
  });
}

function issuesOf(run: () => void): string[] {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).details;
  }
  throw new Error('the validation passed');
}

const library = { 'vine-boom': 1.4 };

/** The meme "office-prank" in a workspace whose library holds "vine-boom", a 2-second sound trimmed to 1.4 seconds. */
async function meme(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-meme-script-'));
  temporary.push(dir);
  await cp(join(root, 'config'), join(dir, 'config'), { recursive: true });
  await cp(join(root, 'templates'), join(dir, 'templates'), { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const projectDir = await createProject({ root: dir, slug: 'office-prank', budget: 10, kind: 'meme' });
  vi.restoreAllMocks();
  await mkdir(join(dir, 'library', 'sounds', 'vine-boom'), { recursive: true });
  await writeFile(
    join(dir, 'library', 'sounds', 'vine-boom', 'sound.yaml'),
    stringify({
      version: 1,
      id: 'vine-boom',
      title: 'Vine boom',
      use_when: 'a reveal',
      length: 2,
      loudness: -14,
      trim: { start: 0.3, end: 1.7 },
      hash: 'a'.repeat(64),
      added: '2026-11-22T00:00:00Z',
    }),
  );
  return projectDir;
}

describe('a meme script', () => {
  it('ST-009: A script with a library sound passes', async () => {
    // The library holds "vine-boom" of 1.4 seconds: a 2-second file trimmed to 0.3-1.7.
    const projectDir = await meme();
    const script = officePrank({ sound: 'vine-boom' });
    const sounds = await scriptSounds(projectDir, script);
    expect(() => validateScript(script, { kind: 'meme', sounds })).not.toThrow();
    const line = script.scenes[0]!.lines.find((candidate) => candidate.id === 'reveal-boom')!;
    expect(knownLineSeconds(line, sounds)).toBeCloseTo(1.4, 9);
  });

  it('ST-009: A sound line with both a sound and a prompt is refused', () => {
    const script = officePrank({ sound: 'vine-boom', prompt: 'a deep boom' });
    const issues = issuesOf(() => validateScript(script, { kind: 'meme', sounds: library }));
    expect(issues).toEqual([expect.stringMatching(/"reveal-boom".*names a library sound or a prompt, not both/)]);
  });

  it('ST-009: An unknown library sound is refused', () => {
    const script = officePrank({ sound: 'air-horn' });
    const issues = issuesOf(() => validateScript(script, { kind: 'meme', sounds: library }));
    expect(issues).toEqual([expect.stringMatching(/there is no library sound "air-horn"/)]);
  });

  it('ST-009: Known lengths over 30 seconds are refused', () => {
    // 1.4 (sound) + 0.6 (its pause after) + 30 (a pause) + 2 (a generated effect) = 34 seconds.
    const script = officePrank({ sound: 'vine-boom', pause_after: 0.6 }, [
      { id: 'silence', kind: 'pause', duration: 30 },
      { id: 'sting', kind: 'sfx', prompt: 'a short sting', duration: 2 },
    ]);
    const issues = issuesOf(() => validateScript(script, { kind: 'meme', sounds: library }));
    expect(issues).toEqual([expect.stringMatching(/a meme lasts at most 30 seconds.*34 s/)]);
  });

  it('refuses a library sound line with a duration, and a generated effect without one', () => {
    const script = officePrank({ sound: 'vine-boom', duration: 2 });
    const issues = issuesOf(() => validateScript(script, { kind: 'meme', sounds: library }));
    expect(issues).toEqual([expect.stringMatching(/"reveal-boom".*has no duration; its length comes from the sound/)]);
    expect(() => officePrank({ prompt: 'a short sting' })).toThrow(/a generated effect needs a duration/);
  });

  it('checks speakers and sets only as ids without bibles, and against the bibles once they exist (HS-262)', () => {
    const script = officePrank({ sound: 'vine-boom' });
    expect(() => validateScript(script, { kind: 'meme', sounds: library })).not.toThrow();
    const issues = issuesOf(() =>
      validateScript(script, {
        kind: 'meme',
        sounds: library,
        characters: { version: 1, characters: [] } as never,
        sets: { version: 1, sets: [] } as never,
      }),
    );
    expect(issues).toEqual([expect.stringMatching(/unknown set "open-office"/), expect.stringMatching(/unknown speaker "kim"/)]);
    const badIds = ScriptSchema.parse({
      ...script,
      scenes: [{ ...script.scenes[0]!, set: 'Open Office', lines: [{ ...script.scenes[0]!.lines[0]!, speaker: 'Kim Doe' }] }],
    });
    expect(issuesOf(() => validateScript(badIds, { kind: 'meme', sounds: library }))).toEqual([
      expect.stringMatching(/set "Open Office" is not a valid id/),
      expect.stringMatching(/speaker "Kim Doe" is not a valid id/),
    ]);
  });

  it('keeps library sounds out of an episode', () => {
    const script = officePrank({ sound: 'vine-boom' });
    const canon = {
      characters: { version: 1, characters: [{ id: 'kim' }] } as never,
      sets: { version: 1, sets: [{ id: 'open-office' }] } as never,
    };
    expect(issuesOf(() => validateScript(script, canon))).toEqual([expect.stringMatching(/library sounds belong to memes/)]);
  });
});

describe('the workspace hook on a meme script', () => {

  it('passes a script with a known library sound and refuses one with an unknown sound', async () => {
    const projectDir = await meme();
    const file = join(projectDir, 'script.yaml');
    await writeFile(file, stringify(officePrank({ sound: 'vine-boom' })));
    await expect(validateChangedFile(file)).resolves.toBe('script');
    await writeFile(file, stringify(officePrank({ sound: 'air-horn' })));
    await expect(validateChangedFile(file)).rejects.toThrow(ValidationError);
    await expect(validateChangedFile(file)).rejects.toMatchObject({ details: [expect.stringMatching(/no library sound "air-horn"/)] });
  });
});
