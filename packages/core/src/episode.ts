/**
 * Pure rules for episode projects (no I/O). The script is the authoritative
 * text of an episode; these checks run before any take is generated.
 */
import { ValidationError } from './errors.js';
import type { CharacterBible, Line, Script, ScriptLine, Section, SetBible, Timing } from './schema.js';

/** Script line kinds that are spoken and therefore follow the TTS text rule. */
export const SPOKEN_LINE_KINDS = ['dialogue', 'voiceover', 'announcement'] as const;
/** Script line kinds that go into the subtitles and need `text_en`. */
export const SUBTITLED_LINE_KINDS = [...SPOKEN_LINE_KINDS, 'chat'] as const;

type SpokenLine = Extract<ScriptLine, { kind: (typeof SPOKEN_LINE_KINDS)[number] }>;
type SubtitledLine = Extract<ScriptLine, { kind: (typeof SUBTITLED_LINE_KINDS)[number] }>;

export function isSpokenLine(line: ScriptLine): line is SpokenLine {
  return (SPOKEN_LINE_KINDS as readonly string[]).includes(line.kind);
}

export function isSubtitledLine(line: ScriptLine): line is SubtitledLine {
  return (SUBTITLED_LINE_KINDS as readonly string[]).includes(line.kind);
}

/**
 * TTS reads digits, abbreviations, and symbols unreliably, so speech text must
 * spell them out ("2077" -> "zweitausendsiebenundsiebzig"). A leading voice
 * description in brackets is not spoken and is not checked.
 */
export function checkSpokenText(prompt: string): void {
  const spoken = prompt.replace(/^\s*\([^)]*\)/, '');
  const digits = spoken.match(/\d+/g);
  const symbols = spoken.match(/[%§&€$£@#+=*\/<>~^|_]/g);
  const abbreviations = spoken.match(/\b(?:z\.\s?B|d\.\s?h|u\.\s?a|bzw|usw|ca|evtl|ggf|Nr|Dr|St|etc)\./gi);
  const found = [...(digits ?? []), ...(symbols ?? []), ...(abbreviations ?? [])];
  if (found.length > 0) {
    throw new ValidationError(
      `Speech text contains ${[...new Set(found)].join(', ')}. Spell out numbers, years, times, abbreviations, ` +
        'and symbols in words before TTS, e.g. "2077" -> "zweitausendsiebenundsiebzig", "z. B." -> "zum Beispiel".',
    );
  }
}

/** Every script line in playing order, with the ID of its scene. */
export function scriptLines(script: Script): Array<{ scene: string; line: ScriptLine }> {
  return script.scenes.flatMap((scene) => scene.lines.map((line) => ({ scene: scene.id, line })));
}

export interface ScriptCanon {
  characters: CharacterBible;
  sets: SetBible;
}

/**
 * Check a script against the series canon: unique scene and line IDs, known
 * speakers and sets, an English subtitle on every subtitled line, the TTS rule
 * on spoken German text, a chat speed when there are chat lines, and no
 * overlapping lines yet. Throws one ValidationError that lists every issue.
 */
export function validateScript(script: Script, canon: ScriptCanon): void {
  const issues: string[] = [];
  const characterIds = new Set(canon.characters.characters.map((character) => character.id));
  const setIds = new Set(canon.sets.sets.map((set) => set.id));

  const sceneIds = new Set<string>();
  for (const scene of script.scenes) {
    if (sceneIds.has(scene.id)) issues.push(`duplicate scene id "${scene.id}"`);
    sceneIds.add(scene.id);
    if (!setIds.has(scene.set)) {
      issues.push(`scene "${scene.id}" plays in unknown set "${scene.set}"; known sets: ${[...setIds].join(', ') || 'none'}`);
    }
  }

  const lineIds = new Set<string>();
  let hasChat = false;
  for (const { scene, line } of scriptLines(script)) {
    const label = `line "${line.id}" (scene "${scene}")`;
    if (lineIds.has(line.id)) issues.push(`duplicate line id "${line.id}"`);
    lineIds.add(line.id);

    if (line.with !== undefined) {
      issues.push(`${label} sets "with: ${line.with}"; overlapping lines are not supported yet, so lines play one after another`);
    }
    if (line.kind === 'chat') hasChat = true;

    if (isSubtitledLine(line)) {
      if (!characterIds.has(line.speaker)) issues.push(`${label} has unknown speaker "${line.speaker}"`);
      if (!line.text_en?.trim()) issues.push(`${label} needs text_en for the English subtitles`);
    }
    if (isSpokenLine(line)) {
      try {
        checkSpokenText(line.text_de);
      } catch (error) {
        issues.push(`${label}: ${(error as Error).message}`);
      }
    }
  }

  if (hasChat && !script.chat) {
    issues.push('the script has chat lines but no "chat: { cps, hold }" typing speed');
  }

  if (issues.length > 0) throw new ValidationError('Invalid script', issues);
}

/**
 * Check that a timing file was built from this script: one section per scene
 * and one line per script line, in playing order and in the right scene.
 */
export function assertTimingMatchesScript(script: Script, timing: Timing): void {
  const issues: string[] = [];
  const sceneIds = script.scenes.map((scene) => scene.id);
  const sectionIds = [...timing.sections].sort((a, b) => a.start - b.start).map((section) => section.id);
  if (sceneIds.join('\n') !== sectionIds.join('\n')) {
    issues.push(`timing sections [${sectionIds.join(', ')}] do not match the script scenes [${sceneIds.join(', ')}]`);
  }

  const expected = scriptLines(script);
  const actual = [...timing.lines].sort((a, b) => a.start - b.start);
  if (expected.map(({ line }) => line.id).join('\n') !== actual.map((line) => line.id).join('\n')) {
    issues.push(
      `timing lines [${actual.map((line) => line.id).join(', ')}] do not match the script lines [${expected.map(({ line }) => line.id).join(', ')}]`,
    );
  } else {
    for (const [index, { scene, line }] of expected.entries()) {
      const timed = actual[index]!;
      if (timed.section !== scene) issues.push(`timing line "${line.id}" is in section "${timed.section}", not in scene "${scene}"`);
    }
  }

  if (issues.length > 0) {
    throw new ValidationError('timing.json does not match script.yaml; re-run episode-track', issues);
  }
}

/** Script line kinds that have a take: speech and sound effects. Chat and pause lines are silent. */
export function isAudibleLine(line: ScriptLine): boolean {
  return isSpokenLine(line) || line.kind === 'sfx';
}

/**
 * What a take is made from. Its canonical hash is the take's text hash: a
 * different text, speaker, prompt, or effect length makes the take stale.
 */
export function takeSource(line: ScriptLine): Record<string, unknown> {
  if (isSpokenLine(line)) return { kind: line.kind, speaker: line.speaker, text: line.text_de };
  if (line.kind === 'sfx') return { kind: 'sfx', prompt: line.prompt, duration: line.duration };
  throw new ValidationError(`Script line "${line.id}" (${line.kind}) has no take.`);
}

/** What a scene's ambience is made from; it is looped or trimmed to the scene, so its length is not part of it. */
export function ambienceSource(prompt: string): Record<string, unknown> {
  return { kind: 'ambience', prompt };
}

/** How long a chat line stays on screen: its characters at the typing speed, plus the hold. */
export function chatSeconds(text: string, chat: NonNullable<Script['chat']>): number {
  return [...text].length / chat.cps + chat.hold;
}

export interface Placement {
  duration: number;
  sections: Section[];
  lines: Line[];
}

/**
 * Place the script lines strictly one after another. A spoken line lasts as
 * long as its take, an effect or pause as long as its `duration`, a chat line
 * as long as `chatSeconds`; `pause_after` is silence before the next line.
 * Scenes become sections that start at 0 and cover the episode without gaps;
 * the last one ends after the last line's pause. Times are rounded to
 * milliseconds without drift.
 */
export function placeLines(script: Script, takeDurations: Record<string, number>): Placement {
  const ms = (seconds: number) => Math.round(seconds * 1000);
  const sections: Section[] = [];
  const lines: Line[] = [];
  let cursor = 0;

  for (const scene of script.scenes) {
    const sceneStart = cursor;
    for (const line of scene.lines) {
      let length: number;
      if (isSpokenLine(line)) {
        const take = takeDurations[line.id];
        if (take === undefined) throw new ValidationError(`Script line "${line.id}" has no take duration.`);
        length = ms(take);
      } else if (line.kind === 'chat') {
        if (!script.chat) throw new ValidationError('The script has chat lines but no "chat: { cps, hold }" typing speed.');
        length = ms(chatSeconds(line.text_de, script.chat));
      } else {
        length = ms(line.duration);
      }
      const text = isSubtitledLine(line) ? line.text_de : '';
      lines.push({ id: line.id, section: scene.id, start: cursor / 1000, end: (cursor + length) / 1000, text, words: [] });
      cursor += length + (line.kind === 'pause' ? 0 : ms(line.pause_after));
    }
    sections.push({ id: scene.id, label: scene.id, start: sceneStart / 1000, end: cursor / 1000, confidence: 1, sources: ['script'] });
  }

  return { duration: cursor / 1000, sections, lines };
}

/**
 * RMS envelope of mono PCM samples (-1..1), peak-normalized to 0..1, with
 * centered frames like the music-video audio analysis.
 */
export function rmsEnvelope(samples: Float32Array, hop = 512, frame = 2048): number[] {
  const count = Math.floor(samples.length / hop) + 1;
  const half = Math.floor(frame / 2);
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const center = index * hop;
    let sum = 0;
    for (let offset = -half; offset < frame - half; offset += 1) {
      const sample = samples[center + offset] ?? 0;
      sum += sample * sample;
    }
    values.push(Math.sqrt(sum / frame));
  }
  const peak = Math.max(0, ...values);
  return values.map((value) => (peak > 0 ? Math.round((value / peak) * 100_000) / 100_000 : 0));
}
