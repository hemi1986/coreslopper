import { z } from 'zod';
import { ValidationError } from './errors.js';
import { FLEX_NO_MUSIC, FLEX_SECTIONS, pikaEndMark } from './flex.js';

/**
 * The prompt schema of the Pika H3 Flex FL2VA workflow (first/last frame to
 * video, see `comfyui/README.md`). It is not the Ref2VA Flex schema: an
 * alignment line that ties the keyframes to second marks, then three
 * sections, each header followed by its text on the same line. Keyframes are
 * named `Picture 1` (the first frame) and `Picture 2` (the last frame), without
 * angle brackets.
 */
export const FL2VA_SECTIONS = ['integrated_multimodal_description', 'overall_soundscape', 'non_diegetic_music'] as const;

const ALIGNMENT_PREFIX = 'How the reference pictures align with the target video';

export interface Fl2vaTiming {
  /** The clip length the item asks for; the end mark follows the 17n+5 frames the graph renders. */
  seconds: number;
  /** True with an end frame (firstLastFrameToVideo); without it the line names Picture 1 only. */
  lastFrame: boolean;
  /** The [Shot N] that ends on Picture 2; default 1. */
  lastShot?: number;
}

/** The alignment line: Picture 1 at 0.00 s, Picture 2 (only with an end frame) at frames / 24. */
export function fl2vaAlignmentLine(timing: Fl2vaTiming): string {
  const first = 'Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video';
  if (!timing.lastFrame) return `${ALIGNMENT_PREFIX} — ${first}.`;
  const mark = pikaEndMark(timing.seconds);
  return `${ALIGNMENT_PREFIX} — ${first}; Picture 2 (from Shot ${timing.lastShot ?? 1}) aligns with the ${mark}-second mark of the target video.`;
}

const Text = z.string().trim().min(1);

export const Fl2vaPromptSchema = z
  .object({
    /** Look, light, and camera rules; opens [Shot 1]. */
    style: Text.optional(),
    /**
     * One entry per [Shot N]; a shot is one paragraph or several. Give times
     * ("At about 1.5 seconds …"); [Shot 1] begins exactly on Picture 1, and with
     * an end frame the last shot settles into Picture 2.
     */
    shots: z.array(z.union([Text, z.array(Text).min(1)])).min(1),
    /** Diegetic sound: SFX, dialogue, ambience, and music that plays inside the scene. */
    soundscape: Text,
  })
  .strict();

export type Fl2vaPrompt = z.infer<typeof Fl2vaPromptSchema>;
export type Fl2vaPromptInput = z.input<typeof Fl2vaPromptSchema>;

/** Render a structured FL2VA prompt, alignment line included. */
export function renderFl2vaPrompt(input: Fl2vaPromptInput, timing: Omit<Fl2vaTiming, 'lastShot'>): string {
  const spec = Fl2vaPromptSchema.parse(input);
  const shots = spec.shots.map((shot, index) => {
    const paragraphs = (typeof shot === 'string' ? [shot] : shot).map((paragraph) => paragraph.trim());
    if (index === 0 && spec.style) paragraphs[0] = `${spec.style.trim()} ${paragraphs[0]}`;
    return `[Shot ${index + 1}] ${paragraphs.join('\n\n')}`;
  });
  const text = [
    fl2vaAlignmentLine({ ...timing, lastShot: shots.length }),
    `integrated_multimodal_description: ${shots.join('\n\n')}`,
    `overall_soundscape: ${spec.soundscape.trim()}`,
    `non_diegetic_music: ${FLEX_NO_MUSIC}`,
  ].join('\n\n');
  checkFl2vaPrompt(text, timing);
  return text;
}

function lastShot(text: string): number {
  return Math.max(1, ...[...text.matchAll(/\[Shot (\d+)\]/g)].map((match) => Number(match[1])));
}

/**
 * A raw FL2VA prompt with its alignment line: the line is prepended when the
 * prompt starts with the first section; a prompt that already has one keeps it
 * (and checkFl2vaPrompt then checks the mark).
 */
export function withFl2vaAlignment(text: string, timing: Omit<Fl2vaTiming, 'lastShot'>): string {
  const trimmed = text.trim();
  if (trimmed.startsWith(ALIGNMENT_PREFIX)) return trimmed;
  return `${fl2vaAlignmentLine({ ...timing, lastShot: lastShot(trimmed) })}\n\n${trimmed}`;
}

function headers(text: string, names: readonly string[]): { name: string; index: number; length: number }[] {
  const pattern = new RegExp(`^(${names.join('|')}):`, 'gm');
  return [...text.matchAll(pattern)].map((match) => ({ name: match[1]!, index: match.index!, length: match[0].length }));
}

/**
 * Check an FL2VA prompt: alignment line with the right marks, the three
 * sections in order, [Shot N] blocks with time marks, only Picture 1 (and
 * Picture 2 with an end frame), the fixed music line, and nothing of the Ref2VA
 * schema. Throws a ValidationError that lists every problem.
 */
export function checkFl2vaPrompt(text: string, timing: Omit<Fl2vaTiming, 'lastShot'>): void {
  const problems: string[] = [];
  const ref2va = headers(text, FLEX_SECTIONS.filter((name) => !(FL2VA_SECTIONS as readonly string[]).includes(name)));
  if (ref2va.length > 0 || /<(Picture|Subject) \d+>/.test(text)) {
    problems.push(
      `Ref2VA schema in an FL2VA prompt (${[...new Set(ref2va.map((header) => `${header.name}:`))]
        .concat(/<(Picture|Subject) \d+>/.test(text) ? ['<Picture N>/<Subject N> tags'] : [])
        .join(', ')}); FL2VA takes the alignment line, ${FL2VA_SECTIONS.join(' / ')}, and names keyframes "Picture 1"/"Picture 2"`,
    );
  }

  const sections = headers(text, FL2VA_SECTIONS);
  const names = sections.map((section) => section.name);
  const missing = FL2VA_SECTIONS.filter((name) => !names.includes(name));
  if (missing.length > 0) problems.push(`missing section(s): ${missing.join(', ')}`);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) problems.push(`section(s) given twice: ${[...new Set(duplicates)].join(', ')}`);
  if (missing.length === 0 && duplicates.length === 0 && names.join() !== FL2VA_SECTIONS.join()) {
    problems.push(`sections out of order: ${names.join(' / ')}; expected ${FL2VA_SECTIONS.join(' / ')}`);
  }
  const body = (name: string) => {
    const at = sections.findIndex((section) => section.name === name);
    if (at < 0) return '';
    const start = sections[at]!.index + sections[at]!.length;
    const end = at + 1 < sections.length ? sections[at + 1]!.index : text.length;
    return text.slice(start, end).trim();
  };

  const description = body('integrated_multimodal_description');
  const expected = fl2vaAlignmentLine({ ...timing, lastShot: lastShot(description) });
  const head = (sections[0] ? text.slice(0, sections[0].index) : text).trim();
  if (head !== expected) {
    problems.push(
      head.startsWith(ALIGNMENT_PREFIX)
        ? `alignment line does not match ${timing.seconds} s${timing.lastFrame ? ' with an end frame' : ' without an end frame'}; expected: "${expected}"`
        : `the prompt must start with the alignment line "${expected}"`,
    );
  }

  if (description) {
    const shots = [...new Set([...description.matchAll(/\[Shot (\d+)\]/g)].map((match) => Number(match[1])))];
    if (shots.length === 0) problems.push('integrated_multimodal_description has no [Shot N] block');
    else if (shots.some((n, index) => n !== index + 1)) {
      problems.push(`[Shot N] blocks must count 1, 2, 3 …; found ${shots.join(', ')}`);
    }
    // No time-mark rule here: a held shot (only dust and glow move) has no event to time.
  }

  const allowed = timing.lastFrame ? 2 : 1;
  const pictures = [...new Set([...text.matchAll(/\bPicture (\d+)\b/g)].map((match) => Number(match[1])))];
  const extra = pictures.filter((n) => n < 1 || n > allowed).sort((a, b) => a - b);
  if (extra.length > 0) {
    problems.push(
      `${extra.map((n) => `Picture ${n}`).join(', ')} has no keyframe: ` +
        (timing.lastFrame ? 'Picture 1 is the first frame, Picture 2 the last' : 'without an end frame there is only Picture 1'),
    );
  }

  if (names.includes('non_diegetic_music') && body('non_diegetic_music') !== FLEX_NO_MUSIC) {
    problems.push(
      `non_diegetic_music must be exactly "${FLEX_NO_MUSIC}". The score comes in post-production; ` +
        'music that plays inside the scene belongs in overall_soundscape.',
    );
  }

  if (problems.length > 0) {
    throw new ValidationError(`FL2VA prompt does not follow the Pika H3 FL2VA schema:\n- ${problems.join('\n- ')}`);
  }
}
