import { z } from 'zod';
import { ValidationError } from './errors.js';

/**
 * The Flex prompt schema of the Pika H3 Flex reference-to-video workflow
 * (see `comfyui/README.md`). A prompt has six sections in a fixed
 * order; reference images are named `<Picture N>` (1-based, in wiring order:
 * `references[0]` is `<Picture 1>`), and the things the clip shows are named
 * `<Subject N>`.
 */
export const FLEX_SECTIONS = [
  'subject_definitions',
  'summary',
  'retention_analysis',
  'detailed_description',
  'overall_soundscape',
  'non_diegetic_music',
] as const;

export const FLEX_RETENTION_LABELS = ['fully_preserved', 'attribute_transfer', 'weak_reference'] as const;

/**
 * The only allowed non_diegetic_music value. The score comes in post-production:
 * the song in a music video, one bed for a whole episode. Music that plays in the
 * scene itself (a radio, a band) belongs in overall_soundscape.
 */
export const FLEX_NO_MUSIC = 'none - No music, no score, no melody of any kind.';

/**
 * Reference limits of MiniMax H3 reference-to-video. Images default to 4 per
 * clip and can be raised per item (`params.max_references`) up to the hard limit
 * of 9. Video and audio references are not wired yet; audio references are
 * rejected because they break identity.
 */
export const REF2VA_LIMITS = {
  defaultImages: 4,
  images: 9,
  videos: 3,
  audio: 3,
} as const;

const Text = z.string().trim().min(1);

export const FlexSubjectSchema = z
  .object({
    /** What the subject is, e.g. "the pilot" or "the station interior, invented to match <Subject 1>: …". */
    is: Text,
    /** The reference image that shows it (1-based <Picture N>); omit for an invented subject. */
    picture: z.number().int().min(1).optional(),
    /** Reference role, e.g. "identity and gear anchor". */
    role: Text.optional(),
    /** Features the clip must keep exactly. */
    features: Text.optional(),
    /** What must not be carried over from the picture, e.g. "the light grey studio background of <Picture 1>". */
    avoid: Text.optional(),
  })
  .strict();

export const FlexRetentionSchema = z
  .object({
    /** 1-based <Subject N>. */
    subject: z.number().int().min(1),
    /** Where it appears, e.g. "[Shot 1]" or "the end of [Shot 1]". */
    appears: Text.optional(),
    label: z.enum(FLEX_RETENTION_LABELS),
    note: Text,
  })
  .strict();

export const FlexBackgroundSchema = z
  .object({
    /** 1-based <Picture N> whose background is described. */
    picture: z.number().int().min(1),
    label: z.enum(FLEX_RETENTION_LABELS),
    note: Text,
  })
  .strict();

export const FlexPromptSchema = z
  .object({
    subjects: z.array(FlexSubjectSchema).min(1),
    /** One paragraph; "[reference generation]" is prepended when missing. */
    summary: Text,
    retention: z.array(FlexRetentionSchema).min(1),
    /** How reference backgrounds are treated, usually weak_reference. */
    backgrounds: z.array(FlexBackgroundSchema).default([]),
    /** The opening paragraph of detailed_description: look, light, camera rules. */
    style: Text,
    /** One entry per [Shot N]; a shot is one paragraph or several. Give times: "At about 1.5 seconds …". */
    shots: z.array(z.union([Text, z.array(Text).min(1)])).min(1),
    /** Diegetic sound: SFX, dialogue, ambience, and music that plays inside the scene. */
    soundscape: Text,
  })
  .strict();

export type FlexPrompt = z.infer<typeof FlexPromptSchema>;
export type FlexPromptInput = z.input<typeof FlexPromptSchema>;

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function bare(text: string): string {
  return text.trim().replace(/[.!?]+$/, '');
}

/** Render a structured Flex prompt into the six-section text the workflow expects. */
export function renderFlexPrompt(input: FlexPromptInput): string {
  const spec = FlexPromptSchema.parse(input);
  const subjects = spec.subjects.map((subject, index) => {
    let line = `<Subject ${index + 1}> is ${bare(subject.is)}`;
    if (subject.picture !== undefined) line += ` in <Picture ${subject.picture}>`;
    line += '.';
    if (subject.role) line += ` Reference role: ${sentence(subject.role)}`;
    if (subject.features) line += ` Features to follow exactly: ${sentence(subject.features)}`;
    if (subject.avoid) line += ` Do not carry over ${sentence(subject.avoid)}`;
    return line;
  });
  const summary = /^\[reference generation\]/i.test(spec.summary)
    ? spec.summary
    : `[reference generation] ${spec.summary}`;
  const retention = [
    ...spec.retention.map(
      (entry) =>
        `<Subject ${entry.subject}>${entry.appears ? ` (appears in ${bare(entry.appears)})` : ''}: ` +
        `${entry.label} - ${sentence(entry.note)}`,
    ),
    ...spec.backgrounds.map(
      (entry) => `<Picture ${entry.picture}> background: ${entry.label} only - ${sentence(entry.note)}`,
    ),
    'No audio reference is used in this generation.',
  ];
  const shots = spec.shots.map((shot, index) => {
    const paragraphs = typeof shot === 'string' ? [shot] : shot;
    return `[Shot ${index + 1}] ${paragraphs.map((paragraph) => paragraph.trim()).join('\n\n')}`;
  });
  const text = [
    `subject_definitions:\n${subjects.join('\n')}`,
    `summary:\n${summary.trim()}`,
    `retention_analysis:\n${retention.join('\n')}`,
    `detailed_description:\n${spec.style.trim()}\n\n${shots.join('\n\n')}`,
    `overall_soundscape:\n${spec.soundscape.trim()}`,
    `non_diegetic_music:\n${FLEX_NO_MUSIC}`,
  ].join('\n\n');
  checkFlexPrompt(text, Math.max(0, ...spec.subjects.map((subject) => subject.picture ?? 0)));
  return text;
}

/** Split a Flex prompt into its sections; headers stand alone at the start of a line. */
export function flexSections(text: string): { name: string; body: string }[] {
  const pattern = new RegExp(`^(${FLEX_SECTIONS.join('|')}):[ \\t]*$`, 'gm');
  const matches = [...text.matchAll(pattern)];
  return matches.map((match, index) => {
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1]!.index! : text.length;
    return { name: match[1]!, body: text.slice(start, end).trim() };
  });
}

function numbers(text: string, tag: 'Picture' | 'Subject'): number[] {
  return [...text.matchAll(new RegExp(`<${tag} (\\d+)>`, 'g'))].map((match) => Number(match[1]));
}

/**
 * Check a Flex prompt against the workflow rules and the reference count.
 * Throws a ValidationError that lists every problem.
 */
export function checkFlexPrompt(text: string, referenceCount: number): void {
  const problems: string[] = [];
  const sections = flexSections(text);
  const names = sections.map((section) => section.name);
  const missing = FLEX_SECTIONS.filter((name) => !names.includes(name));
  if (missing.length > 0) problems.push(`missing section(s): ${missing.join(', ')}`);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) problems.push(`section(s) given twice: ${[...new Set(duplicates)].join(', ')}`);
  if (missing.length === 0 && duplicates.length === 0 && names.join() !== FLEX_SECTIONS.join()) {
    problems.push(`sections out of order: ${names.join(' / ')}; expected ${FLEX_SECTIONS.join(' / ')}`);
  }
  if (sections.length > 0 && text.slice(0, text.indexOf(`${sections[0]!.name}:`)).trim() !== '') {
    problems.push('text before subject_definitions');
  }
  const body = (name: string) => sections.find((section) => section.name === name)?.body ?? '';

  const definitions = body('subject_definitions');
  const defined = new Set(
    [...definitions.matchAll(/^<Subject (\d+)> is\b/gm)].map((match) => Number(match[1])),
  );
  if (definitions && defined.size === 0) problems.push('subject_definitions defines no "<Subject N> is …" line');
  const usedSubjects = new Set(numbers(text, 'Subject'));
  const undefinedSubjects = [...usedSubjects].filter((n) => !defined.has(n)).sort((a, b) => a - b);
  if (undefinedSubjects.length > 0) {
    problems.push(`${undefinedSubjects.map((n) => `<Subject ${n}>`).join(', ')} used but not defined`);
  }

  const pictures = new Set(numbers(text, 'Picture'));
  const outOfRange = [...pictures].filter((n) => n < 1 || n > referenceCount).sort((a, b) => a - b);
  if (outOfRange.length > 0) {
    problems.push(
      `${outOfRange.map((n) => `<Picture ${n}>`).join(', ')} has no reference image (the item has ${referenceCount}; ` +
        'references[0] is <Picture 1>)',
    );
  }
  const definedPictures = new Set(numbers(definitions, 'Picture'));
  for (let n = 1; n <= referenceCount; n += 1) {
    if (!definedPictures.has(n)) problems.push(`reference ${n} is never named as <Picture ${n}> in subject_definitions`);
  }

  const retention = body('retention_analysis');
  if (retention) {
    const labelled = retention
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^<(Subject|Picture) \d+>/.test(line));
    if (labelled.length === 0) problems.push('retention_analysis has no <Subject N> line');
    for (const line of labelled) {
      if (!FLEX_RETENTION_LABELS.some((label) => line.includes(label))) {
        problems.push(`retention_analysis line without a label (${FLEX_RETENTION_LABELS.join(', ')}): "${line.slice(0, 60)}"`);
      }
    }
    for (const n of defined) {
      if (!new RegExp(`^\\s*<Subject ${n}>`, 'm').test(retention)) problems.push(`retention_analysis misses <Subject ${n}>`);
    }
  }

  const description = body('detailed_description');
  if (description) {
    const shots = [...description.matchAll(/\[Shot (\d+)\]/g)].map((match) => Number(match[1]));
    const firstUse = [...new Set(shots)];
    if (firstUse.length === 0) problems.push('detailed_description has no [Shot N] block');
    else if (firstUse.some((n, index) => n !== index + 1)) {
      problems.push(`[Shot N] blocks must count 1, 2, 3 …; found ${firstUse.join(', ')}`);
    }
    if (!/\bat about\b[^.\n]*?\bseconds?\b/i.test(description)) {
      problems.push('detailed_description needs time marks, e.g. "At about 1.5 seconds …"');
    }
  }

  const music = body('non_diegetic_music');
  if (sections.some((section) => section.name === 'non_diegetic_music') && music !== FLEX_NO_MUSIC) {
    problems.push(
      `non_diegetic_music must be exactly "${FLEX_NO_MUSIC}". The score comes in post-production; ` +
        'music that plays inside the scene belongs in overall_soundscape.',
    );
  }

  if (problems.length > 0) {
    throw new ValidationError(`Flex prompt does not follow the Pika H3 schema:\n- ${problems.join('\n- ')}`);
  }
}
