import { z } from 'zod';

export const FormatSchema = z.object({
  aspect: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive().default(30),
});

/** Every generation provider. `comfyui` is a local backend that runs tagged workflow exports. */
export const ProviderKindSchema = z.enum(['fal', 'higgsfield', 'topview', 'comfyui', 'mock']);
/** Providers that can generate and edit stills. */
export const ImageProviderKindSchema = z.enum(['fal', 'higgsfield', 'topview', 'comfyui', 'mock']);
/** Providers that can generate video clips. */
export const VideoProviderKindSchema = z.enum(['fal', 'higgsfield', 'topview', 'comfyui', 'mock']);
/** Providers that can lip-sync a face to a vocal segment. */
export const LipSyncProviderKindSchema = z.enum(['fal', 'higgsfield', 'topview', 'comfyui', 'mock']);
/** Providers that can generate music, stingers, and sound effects (`audio.*` roles). */
export const AudioProviderKindSchema = z.enum(['comfyui', 'mock']);

const SlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase letters, digits, and dashes');

/** IDs that become file names (`audio/lines/<line-id>.wav`) and anchor targets. */
const ScriptIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'id must be lowercase letters, digits, dashes, and underscores');

/** Whether a value is a valid script id (also a character, set, or library sound id). */
export function isScriptId(value: string): boolean {
  return ScriptIdSchema.safeParse(value).success;
}

/** What a project produces. A missing kind means `music-video`. */
export const ProjectKindSchema = z.enum(['music-video', 'episode', 'meme']);

/** The language of a project's subtitles: English (translated), German (as spoken), or none. */
export const SubtitleLanguageSchema = z.enum(['en', 'de', 'off']);

/** Whether a project is released on the platforms (`public`) or only shared privately (`internal`). */
export const DistributionSchema = z.enum(['public', 'internal']);

export const ProvidersSchema = z
  .object({
    image: ImageProviderKindSchema.default('mock'),
    video: VideoProviderKindSchema.default('mock'),
    /**
     * Lip-sync can use a different provider from the rest of the video.
     * Defaults to `video`, or to `fal` when `video` is `topview` (Topview lip-sync
     * needs its separate OpenAPI credentials, so it is opt-in). `new`, `new-series`,
     * and the board wizard write it explicitly.
     */
    lipsync: LipSyncProviderKindSchema.optional(),
    /** `audio.*` roles (stingers, SFX, voices, extra music; never the song itself). Defaults to `comfyui`. */
    audio: AudioProviderKindSchema.optional(),
  })
  .default({ image: 'mock', video: 'mock' });

/** How much of a song part an AI tool made, as distributors ask for it. */
export const AiShareSchema = z.enum(['none', 'partial', 'full']);

/**
 * `release:` in project.yaml: the facts a distributor form asks for. Optional;
 * every field the user has not given is reported as a TODO, never invented.
 */
export const ReleaseMetadataSchema = z.object({
  /** Where the song goes to streaming services; `manual` (or unset) for any distributor without a form layout here. */
  distributor: z.enum(['distrokid', 'manual']).optional(),
  artist: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  featured_artists: z.array(z.string().min(1)).default([]),
  primary_genre: z.string().min(1).optional(),
  secondary_genre: z.string().min(1).optional(),
  /** BCP-47 language of the lyrics; `instrumental` for none. */
  language: z.string().min(2).optional(),
  explicit: z.boolean().optional(),
  /** ISO date (YYYY-MM-DD). A fixed date and an editorial pitch need at least three weeks' lead time. */
  release_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
    .optional(),
  /** Legal names of the songwriters, as the user gives them. */
  songwriters: z.array(z.string().min(1)).default([]),
  producer: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  /** Reuse the ISRC of an earlier release of the same recording. */
  isrc: z
    .string()
    .regex(/^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/, 'an ISRC looks like DE-ABC-26-00001')
    .optional(),
  /** What an AI tool made: lyrics, music (composition), vocals, instrumental. */
  ai_credits: z
    .object({
      lyrics: AiShareSchema.optional(),
      music: AiShareSchema.optional(),
      vocals: AiShareSchema.optional(),
      instrumental: AiShareSchema.optional(),
    })
    .optional(),
  /** The tool that made the AI parts, e.g. Suno. */
  ai_tool: z.string().min(1).optional(),
  /** The licence basis, e.g. the paid plan the song was made with. */
  license_note: z.string().min(1).optional(),
});

/** A meme has exactly one format, 9:16, and no derivatives (ADR 0051). Shared by the project and its template. */
export function memeFormatProblems(formats: { master: Format; derivatives: Format[] }): string[] {
  return formats.master.aspect === '9:16' && formats.derivatives.length === 0 ? [] : ['a meme has only the format 9:16'];
}

export const ProjectConfigSchema = z
  .object({
    version: z.literal(1),
    slug: SlugSchema,
    kind: ProjectKindSchema.default('music-video'),
    /** Episode only: the series whose canon this episode uses (`projects/<slug>/` with series.yaml). */
    series: SlugSchema.optional(),
    /** Episode only: the episode number within the series. */
    episode: z.number().int().positive().optional(),
    title: z.string().min(1),
    created: z.string().min(1),
    workflow: z.object({
      version: z.string().min(1),
      commit: z.string().optional(),
    }),
    budget_usd: z.number().positive(),
    batch_cap_usd: z.number().positive().optional(),
    review_mode: z.enum(['auto', 'final']).default('auto'),
    formats: z.object({
      master: FormatSchema,
      derivatives: z.array(FormatSchema).default([]),
    }),
    providers: ProvidersSchema,
    brand: z.string().min(1).default('example'),
    models: z.record(z.string(), z.unknown()).default({}),
    /** Distributor facts for the release package; music videos only. */
    release: ReleaseMetadataSchema.optional(),
    /** `internal`: never released publicly (a teaser sent by mail or chat), so no release package and no calendar. Unset is `public`. */
    distribution: DistributionSchema.optional(),
    /** The subtitle language; unset means `de` for a meme and `en` for an episode (HS-263). */
    subtitles: SubtitleLanguageSchema.optional(),
  })
  .superRefine((config, ctx) => {
    if (config.kind === 'meme') {
      for (const message of memeFormatProblems(config.formats)) ctx.addIssue({ code: 'custom', path: ['formats'], message });
      if (config.subtitles === 'en') {
        ctx.addIssue({ code: 'custom', path: ['subtitles'], message: "a meme's subtitles are German (de) or off; an English version is not supported yet" });
      }
    }
    if (config.kind !== 'episode') return;
    for (const key of ['series', 'episode'] as const) {
      if (config[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: `an episode project must set "${key}"` });
      }
    }
  });

/**
 * The language of a project's subtitles: its `subtitles` setting, else `de` for a meme (German speech, burned in)
 * and `en` for an episode; a music video has none (HS-263).
 */
export function subtitleLanguage(config: Pick<ProjectConfig, 'kind' | 'subtitles'>): 'en' | 'de' | 'off' {
  if (config.subtitles) return config.subtitles;
  if (config.kind === 'meme') return 'de';
  return config.kind === 'episode' ? 'en' : 'off';
}

/** `templates/meme/project.yaml`: what every meme starts with – its kind and its one 9:16 format. */
export const MemeTemplateSchema = z.object({
  version: z.literal(1),
  kind: z.literal('meme'),
  formats: z
    .object({
      master: FormatSchema,
      derivatives: z.array(FormatSchema).default([]),
    })
    .superRefine((formats, ctx) => {
      for (const message of memeFormatProblems(formats)) ctx.addIssue({ code: 'custom', path: [], message });
    }),
});

export const StageStatusSchema = z.enum(['pending', 'running', 'done', 'failed', 'skipped']);

export const StageStateSchema = z.object({
  status: StageStatusSchema,
  inputHash: z.string().optional(),
  outputs: z.array(z.string()).default([]),
  attempts: z.number().int().nonnegative().default(0),
  lastError: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});

export const BudgetSchema = z.object({
  totalUsd: z.number().nonnegative(),
  spentUsd: z.number().nonnegative(),
  reservedUsd: z.number().nonnegative(),
});

export const StateSchema = z.object({
  version: z.literal(1),
  project: z.string().min(1),
  /**
   * Copied from project.yaml; picks the stage list. Optional so that state
   * files written before project kinds existed can be migrated.
   */
  kind: ProjectKindSchema.optional(),
  workflowVersion: z.string().min(1),
  stage: z.string().min(1),
  status: StageStatusSchema,
  stages: z.record(z.string(), StageStateSchema),
  budget: BudgetSchema,
  artifacts: z.record(z.string(), z.string()).default({}),
  errors: z.array(z.string()).default([]),
  updatedAt: z.string().min(1),
});

export const WordSchema = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});

export const LineSchema = z.object({
  id: z.string().min(1),
  section: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
  words: z.array(WordSchema).default([]),
});

export const SectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).default(0.5),
  sources: z.array(z.string()).default([]),
});

export const EnergySchema = z.object({
  hop: z.number().int().positive(),
  fps: z.number().positive(),
  values: z.array(z.number()),
});

export const TimingSchema = z.object({
  version: z.literal(1),
  audio: z.object({
    path: z.string().min(1),
    duration: z.number().positive(),
    sampleRate: z.number().int().positive(),
  }),
  /** Tempo of a song. An episode track has no tempo and leaves it out. */
  bpm: z.number().positive().optional(),
  beats: z.array(z.number().nonnegative()).default([]),
  downbeats: z.array(z.number().nonnegative()).default([]),
  onsets: z.array(z.number().nonnegative()).default([]),
  energy: EnergySchema,
  sections: z.array(SectionSchema).min(1),
  lines: z.array(LineSchema).default([]),
  meta: z.record(z.string(), z.unknown()).default({}),
});

export const TimingOverridesSchema = z.object({
  version: z.literal(1).default(1),
  bpm: z.number().positive().optional(),
  beats: z.array(z.number().nonnegative()).optional(),
  downbeats: z.array(z.number().nonnegative()).optional(),
  sections: z
    .array(z.object({ id: z.string().min(1), start: z.number().nonnegative(), end: z.number().nonnegative() }))
    .default([]),
  lines: z
    .array(z.object({ id: z.string().min(1), start: z.number().nonnegative(), end: z.number().nonnegative() }))
    .default([]),
  words: z
    .array(
      z.object({
        line: z.string().min(1),
        index: z.number().int().nonnegative(),
        start: z.number().nonnegative(),
        end: z.number().nonnegative(),
      }),
    )
    .default([]),
});

export const AnchorSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('section'),
    id: z.string().min(1),
    edge: z.enum(['start', 'end']).default('start'),
    offset: z.number().default(0),
  }),
  z.object({
    type: z.literal('line'),
    id: z.string().min(1),
    /** `cue` is the moment a sound line's library sound lands, counted from the line's start. */
    edge: z.enum(['start', 'end', 'cue']).default('start'),
    offset: z.number().default(0),
  }),
  z.object({
    type: z.literal('word'),
    line: z.string().min(1),
    index: z.number().int().nonnegative(),
    edge: z.enum(['start', 'end']).default('start'),
    offset: z.number().default(0),
  }),
  z.object({
    type: z.literal('beat'),
    index: z.number().int().nonnegative(),
    offset: z.number().default(0),
  }),
  z.object({
    type: z.literal('downbeat'),
    index: z.number().int().nonnegative(),
    offset: z.number().default(0),
  }),
  z.object({
    type: z.literal('time'),
    seconds: z.number().nonnegative(),
  }),
]);

export const TransitionSchema = z.object({
  type: z.enum(['cut', 'fade', 'dissolve', 'wipe', 'glitch']).default('cut'),
  duration: z.number().nonnegative().default(0),
});

export const ShotSourceSchema = z.enum(['motion', 'ai-clip', 'footage', 'mixed']);

export const LayerSchema = z.object({
  type: z.enum(['motion', 'ai-clip', 'footage']),
  asset: z.string().optional(),
  component: z.string().optional(),
  blend: z.string().optional(),
  zIndex: z.number().int().default(0),
});

export const ShotSchema = z.object({
  id: z.string().regex(/^shot-[0-9]{3}$/, 'shot id must look like shot-001'),
  section: z.string().min(1),
  start: AnchorSchema,
  end: AnchorSchema,
  source: ShotSourceSchema,
  description: z.string().min(1),
  camera: z.string().default('static'),
  text: z.string().optional(),
  highlights: z.array(z.string()).default([]),
  transition: TransitionSchema.default({ type: 'cut', duration: 0 }),
  refs: z
    .object({
      style: z.array(z.string()).default([]),
      characters: z.array(z.string()).default([]),
      /** Sets of sets.yaml (series canon or project); in an episode each must be the set of the shot's scene. */
      sets: z.array(z.string()).default([]),
      /**
       * Plate the keyframe starts from, as `<set>/<plate>`: an empty frame of the set
       * from a fixed camera angle (sets.yaml). The keyframe is an edit of it.
       */
      plate: z.string().regex(/^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*$/, 'plate must look like <set>/<plate>').optional(),
      /** Prop references (sets.yaml `props`) visible in the shot. */
      props: z.array(z.string()).default([]),
      /** Character state per character id (characters.yaml `states`): how the character looks in this shot. */
      states: z.record(z.string(), z.string()).default({}),
    })
    .default({ style: [], characters: [], sets: [], props: [], states: {} }),
  motion: z
    .object({
      component: z.string().optional(),
      props: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
  prompts: z
    .object({
      keyframe: z.string().optional(),
      video: z.string().optional(),
    })
    .optional(),
  asset: z.string().optional(),
  /**
   * Lip-sync shot: a frontal face keyframe (prompts.keyframe) is animated by the
   * vocal segment between the shot's start and end (operation lipSync).
   * `source` defaults to `audio/stems/vocals.wav` for a music video and to the
   * speaker stem `audio/stems/<character>.wav` for an episode (see lipSyncSource).
   */
  lipSync: z
    .object({
      character: z.string().min(1),
      source: z.string().min(1).optional(),
    })
    .optional(),
  layers: z.array(LayerSchema).optional(),
  /**
   * Focus point of the shot's media as fractions of its width and height
   * (0 = left/top, 1 = right/bottom). When a format crops the media (9:16 or
   * 1:1 from 16:9 sources), the crop keeps this point in view. Default: centre.
   */
  focus: z
    .object({
      x: z.number().min(0).max(1).default(0.5),
      y: z.number().min(0).max(1).default(0.5),
    })
    .optional(),
  chaining: z
    .object({
      enabled: z.boolean().default(false),
      from: z.string().optional(),
    })
    .optional(),
});

export const StoryboardSchema = z.object({
  version: z.literal(1),
  timing: z.string().default('timing.effective.json'),
  style: z.string().default('style.yaml'),
  characters: z.string().default('characters.yaml'),
  shots: z.array(ShotSchema).min(1),
});

export const TypographyStyleSchema = z.object({
  family: z.string().min(1),
  weight: z.number().int().min(100).max(900).optional(),
  size: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number().positive().optional(),
});

export const PALETTE_ROLES = ['background', 'surface', 'primary', 'secondary', 'accent', 'text', 'muted'] as const;

export const StyleBibleSchema = z
  .object({
  version: z.literal(1).default(1),
  name: z.string().min(1),
  palette: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
  /**
   * Optional renderer roles (background, surface, primary, secondary, accent,
   * text, muted, or any custom role) mapped to a palette key or a #rrggbb colour.
   * Palettes that already use the role names need no mapping.
   */
  roles: z.record(z.string(), z.string().min(1)).optional(),
  typography: z.record(z.string(), TypographyStyleSchema),
  look: z
    .object({
      keywords: z.array(z.string()).default([]),
      negative: z.array(z.string()).default([]),
      references: z.array(z.string()).default([]),
    })
    .default({ keywords: [], negative: [], references: [] }),
  motion: z
    .object({
      easing: z.string().default('easeOut'),
      grain: z.number().min(0).max(1).default(0.08),
    })
    .default({ easing: 'easeOut', grain: 0.08 }),
  })
  .superRefine((style, ctx) => {
    for (const [role, target] of Object.entries(style.roles ?? {})) {
      if (!/^#[0-9a-fA-F]{6}$/.test(target) && !(target in style.palette)) {
        ctx.addIssue({
          code: 'custom',
          path: ['roles', role],
          message: `role "${role}" maps to "${target}", which is neither a palette key nor a #rrggbb colour`,
        });
      }
    }
  });

/** Report duplicate ids in a list of objects with an `id`. */
function duplicateIds(items: { id: string }[], ctx: z.RefinementCtx, path: (string | number)[], what: string): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, index, 'id'], message: `duplicate ${what} id "${item.id}"` });
    }
    seen.add(item.id);
  }
}

/**
 * A continuity state of a character: a named look the story puts the character
 * in from some shot on, with the reference image every such keyframe derives from.
 */
export const CharacterStateSchema = z.object({
  id: ScriptIdSchema,
  /** What differs from the character sheet, concretely (what is open, attached, worn, and where it leads). */
  description: z.string().min(1),
  /** Prompt sentence that keyframes of this state include. */
  prompt: z.string().optional(),
  /** Reference image, relative to the canon or project; an edit of the sheet or of another state's ref. */
  ref: z.string().optional(),
  /** The state this one derives from; the sheet when absent. */
  from: z.string().optional(),
});

/** How a character may appear on screen. */
export const DisplayRuleSchema = z.enum(['full', 'silhouette', 'screen-only', 'voice-only']);

export const CharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  sheet: z.string().optional(),
  refs: z.array(z.string()).default([]),
  prompt: z.string().optional(),
  /** Reference voice: a WAV (relative to the canon or project) and its exact transcript. */
  voice: z
    .object({
      ref: z.string().min(1),
      transcript: z.string().min(1),
    })
    .optional(),
  face: DisplayRuleSchema.default('full'),
  /**
   * Continuity states: how the character looks after the story changed it
   * (an open hatch, a cable attached, headphones on). Shots name a state in
   * `refs.states`; its `ref` is the reference every such keyframe derives from.
   */
  states: z.array(CharacterStateSchema).default([]),
  /**
   * The character library entry this character was taken from
   * (`library/characters/<id>/`). Its sheet and references are copies of the
   * library's; the character bible keeps them and adds states and outfits.
   */
  library: ScriptIdSchema.optional(),
});

export const CharacterBibleSchema = z
  .object({
    version: z.literal(1).default(1),
    characters: z.array(CharacterSchema).default([]),
  })
  .superRefine((bible, ctx) => {
    for (const [index, character] of bible.characters.entries()) {
      duplicateIds(character.states, ctx, ['characters', index, 'states'], `state of "${character.id}"`);
    }
  });

/**
 * A plate: an empty frame of a set from one fixed camera angle, in the set's
 * light. Keyframes in that framing are edits of the plate with the characters
 * and props inserted, so geometry and light stay the same from shot to shot.
 */
export const PlateSchema = z.object({
  id: ScriptIdSchema,
  /** Camera position and framing, e.g. "shelf, frontal, waist height, medium". */
  angle: z.string().min(1),
  /** Prompt for the plate; the set's prompt plus the angle when absent. */
  prompt: z.string().optional(),
  /** The plate image, relative to the canon or project (`sets/<set>/plates/<id>.png`). */
  ref: z.string().optional(),
});

/** A recurring location of a series or a music video. */
export const SetSchema = z.object({
  id: ScriptIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  /** Prompt anchor that every keyframe in this set starts from. */
  prompt: z.string().min(1),
  /** Reference start frames, relative to the series folder (`sets/<id>/...`). */
  refs: z.array(z.string()).default([]),
  /** Plates: empty frames of this set from fixed camera angles. */
  plates: z.array(PlateSchema).default([]),
  /**
   * The set library entry this set was taken from (`library/sets/<id>/`). Its
   * references and plates are copies of the library's.
   */
  library: ScriptIdSchema.optional(),
});

/** A recurring object with one look: the reference every shot showing it uses. */
export const PropSchema = z.object({
  id: ScriptIdSchema,
  name: z.string().min(1),
  /** Look, material, colour, size, and what is attached to it. */
  description: z.string().min(1),
  prompt: z.string().optional(),
  /** Reference images, relative to the canon or project (`props/<id>/...`). */
  refs: z.array(z.string()).default([]),
});

export const SetBibleSchema = z
  .object({
    version: z.literal(1).default(1),
    sets: z.array(SetSchema).default([]),
    /** Prop references shared by every shot (and episode) that shows the prop. */
    props: z.array(PropSchema).default([]),
  })
  .superRefine((bible, ctx) => {
    duplicateIds(bible.sets, ctx, ['sets'], 'set');
    duplicateIds(bible.props, ctx, ['props'], 'prop');
    for (const [index, set] of bible.sets.entries()) duplicateIds(set.plates, ctx, ['sets', index, 'plates'], `plate of "${set.id}"`);
  });

export const SeriesSchema = z.object({
  version: z.literal(1),
  slug: SlugSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  /** Copied into each new episode's project.yaml; never inherited at run time. */
  formats: z.object({
    master: FormatSchema,
    derivatives: z.array(FormatSchema).default([]),
  }),
  providers: ProvidersSchema,
  brand: z.string().min(1).default('example'),
  /**
   * Series budget: canon generations plus every episode budget must fit in it.
   * Without it, episodes are unchecked and the canon cannot be generated.
   */
  budget_usd: z.number().positive().optional(),
  /** Batch cap for canon generations; defaults to 30 % of the remaining series budget. */
  batch_cap_usd: z.number().positive().optional(),
  /** The planned episodes. */
  episodes: z
    .array(
      z.object({
        episode: z.number().int().positive(),
        title: z.string().min(1),
        logline: z.string().optional(),
      }),
    )
    .default([]),
  /** Optional creative limits. Without an entry nothing is checked. */
  limits: z
    .object({
      episode_seconds: z
        .object({ min: z.number().positive(), max: z.number().positive() })
        .refine((range) => range.min <= range.max, { message: 'min must not exceed max' })
        .optional(),
      lipsync_seconds_max: z.number().positive().optional(),
    })
    .default({}),
});

const ScriptLineBase = {
  id: ScriptIdSchema,
  /** Reserved for overlapping lines; validation rejects it until overlap is implemented. */
  with: ScriptIdSchema.optional(),
};

/** Silence after a line before the next one starts, in seconds. */
const PauseAfterSchema = z.number().nonnegative().default(0);

const SpokenLineFields = {
  ...ScriptLineBase,
  speaker: z.string().min(1),
  /** The German text that is spoken; follows the TTS text rule. */
  text_de: z.string().min(1),
  /** The English subtitle. */
  text_en: z.string().optional(),
  /** Acting direction for the take. */
  direction: z.string().optional(),
  pause_after: PauseAfterSchema,
};

export const ScriptLineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dialogue'), ...SpokenLineFields }),
  z.object({ kind: z.literal('voiceover'), ...SpokenLineFields }),
  z.object({ kind: z.literal('announcement'), ...SpokenLineFields }),
  z.object({
    kind: z.literal('chat'),
    ...ScriptLineBase,
    /** The character who sends the message. */
    speaker: z.string().min(1),
    /** The message as shown on screen; not spoken. */
    text_de: z.string().min(1),
    text_en: z.string().optional(),
    pause_after: PauseAfterSchema,
  }),
  z.object({
    kind: z.literal('sfx'),
    ...ScriptLineBase,
    /**
     * A sound line names a library sound (`sound`, memes only) or a prompt to
     * generate one – exactly one of the two, checked by validateScript.
     */
    sound: ScriptIdSchema.optional(),
    prompt: z.string().min(1).optional(),
    /** Seconds of a generated effect; a library sound's length comes from its trim, so its line has none. */
    duration: z.number().positive().optional(),
    /** Optional English subtitle for on-screen text seen during this sound (a label, a sign); not spoken. */
    text_en: z.string().optional(),
    pause_after: PauseAfterSchema,
  }),
  z.object({
    kind: z.literal('pause'),
    ...ScriptLineBase,
    duration: z.number().positive(),
    /** Optional English subtitle for on-screen text seen during this pause (a message, a document); not spoken. */
    text_en: z.string().optional(),
  }),
]).superRefine((line, ctx) => {
  // A generated effect needs its length; the sound or prompt rule needs the project kind and stays in validateScript.
  if (line.kind === 'sfx' && line.sound === undefined && line.prompt !== undefined && line.duration === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration'], message: 'a generated effect needs a duration' });
  }
});

export const SceneSchema = z.object({
  id: ScriptIdSchema,
  /** The set this scene plays in. */
  set: z.string().min(1),
  description: z.string().min(1),
  /** Ambience prompt for `audio.sfx`, looped or trimmed under the scene. */
  atmo: z.string().optional(),
  lines: z.array(ScriptLineSchema).min(1),
});

export const ScriptSchema = z.object({
  version: z.literal(1),
  title: z.string().optional(),
  /** Typing speed of chat lines: characters per second plus a hold. Required when the script has chat lines. */
  chat: z
    .object({
      cps: z.number().positive(),
      hold: z.number().nonnegative(),
    })
    .optional(),
  scenes: z.array(SceneSchema).min(1),
});

/** `projects/<slug>/state.json` of a series: the spend of canon generations against the series budget. */
export const SeriesStateSchema = z.object({
  version: z.literal(1),
  series: SlugSchema,
  budget: BudgetSchema,
  updatedAt: z.string().min(1),
});

/** The source of a take copied from the sound library: `library:<sound id>` (POL-TakeChosenLibrarySounds). */
export function librarySoundTakeSource(id: string): `library:${string}` {
  return `library:${id}`;
}

/** The library sound id of a take's source, or undefined for a generated or imported take. */
export function libraryTakeSoundId(source: string): string | undefined {
  return /^library:(.+)$/.exec(source)?.[1];
}

export const TakeSchema = z.object({
  /** Generated, imported by the user, or copied from a library sound (`library:<id>`). */
  source: z.union([z.enum(['generated', 'imported']), z.string().regex(/^library:[a-z0-9][a-z0-9_-]*$/) as z.ZodType<`library:${string}`>]),
  duration: z.number().positive(),
  /** Hash of the text or prompt the take was made from; a different hash makes the take stale. */
  text_hash: z.string().min(1),
  /** SHA-256 of the WAV as registered; a different file means someone replaced it. */
  file_hash: z.string().min(1).optional(),
});

/**
 * `takes.json`: one take per audible script line (`audio/lines/<line-id>.wav`),
 * keyed by line ID, and one ambience per scene with an `atmo` prompt
 * (`audio/ambience/<scene-id>.wav`), keyed by scene ID.
 */
export const TakesSchema = z.object({
  version: z.literal(1).default(1),
  takes: z.record(ScriptIdSchema, TakeSchema).default({}),
  ambience: z.record(ScriptIdSchema, TakeSchema).default({}),
});

export const BrandKitSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  logo: z.string().min(1),
  tokens: z.string().min(1),
  palette: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
  typography: z.record(z.string(), TypographyStyleSchema),
  motion: z.object({
    easing: z.string().default('easeOut'),
    grain: z.number().min(0).max(1).default(0.08),
  }),
  fonts: z
    .array(
      z.object({
        family: z.string().min(1),
        file: z.string().min(1),
        license: z.string().min(1),
        /** CSS weight or range (`700`, `"200 700"`); defaults to the full range for a family's only file. */
        weight: z.union([z.number().int().min(1).max(1000), z.string().min(1)]).optional(),
        style: z.enum(['normal', 'italic']).optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
});

export const ModelPricingSchema = z.object({
  unit: z.enum(['image', 'second', 'request']),
  usd: z.number().nonnegative(),
});

export const ModelRoleVariantSchema = z.object({
  model: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
  pricing: ModelPricingSchema.optional(),
  maxDuration: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const ModelRoleSchema = z.object({
  /** Provider whose model slug and defaults are in the fields below. */
  provider: z.string().min(1).default('fal'),
  model: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
  pricing: ModelPricingSchema.optional(),
  maxDuration: z.number().positive().optional(),
  notes: z.string().optional(),
  /** Provider-specific model slugs, params, and prices. */
  alternatives: z.record(z.string(), ModelRoleVariantSchema).default({}),
});

/** Loader inputs that name a model file in a ComfyUI workflow. */
export const COMFYUI_MODEL_INPUTS = ['unet_name', 'clip_name', 'vae_name', 'lora_name', 'ckpt_name', 'model_name'] as const;

/**
 * The model files a fixed ComfyUI workflow family may load, per loader input,
 * e.g. `unet_name: [minimax_h3_fl2va_pruned_int8_convrot.safetensors]`. A loader
 * input without a list may not appear in the workflow.
 */
export const ComfyUILockSchema = z
  .object(
    Object.fromEntries(COMFYUI_MODEL_INPUTS.map((name) => [name, z.array(z.string().min(1)).min(1).optional()])) as Record<
      (typeof COMFYUI_MODEL_INPUTS)[number],
      z.ZodOptional<z.ZodArray<z.ZodString>>
    >,
  )
  .strict();

export const ModelsConfigSchema = z.object({
  version: z.literal(1).default(1),
  last_verified: z.string().optional(),
  roles: z.record(z.string(), ModelRoleSchema),
  /** Allowed model files per fixed workflow family: `pika-h3-ref2va`, `pika-h3-fl2va`. */
  comfyui_locks: z.record(z.string(), ComfyUILockSchema).default({}),
});

/** Platforms the `publish` command uploads to. Instagram, X, and LinkedIn are posted by the release autopilot's post adapters (ADR 0029). */
export const PublishPlatformSchema = z.enum(['youtube', 'tiktok']);

const HashtagSchema = z
  .string()
  .regex(/^#[\p{L}\p{N}_]+$/u, 'a hashtag is # followed by letters, digits, or underscores');

/** Fields every upload item shares: the main video and each Short. */
const UploadItemFields = {
  /** The video the user uploads, relative to the project (or absolute, e.g. on the media drive). */
  file: z.string().min(1),
  title: z.string().min(1),
  /** The description body, without the hashtag line; `publish` and `upload-text` append the hashtags. */
  description: z.string().min(1),
  /** Studio tags (YouTube): plain words or phrases, without `#`. */
  tags: z.array(z.string().min(1)).default([]),
  hashtags: z.array(HashtagSchema).min(1),
  /** The thumbnail `publish` sets, relative to the project. */
  thumbnail: z.string().min(1).optional(),
  /** BCP-47 language of the texts and the audio; defaults to the file's `language`. */
  language: z.string().min(2).optional(),
  /** "Made for kids" on YouTube. */
  made_for_kids: z.boolean().default(false),
  /** "Altered or synthetic content" on YouTube. */
  synthetic_media: z.boolean().default(true),
  /** YouTube video category; 10 is Music. */
  category_id: z.string().regex(/^\d+$/).default('10'),
};

/** A short English version of an item's texts, for an international audience. */
const EnglishSummarySchema = z.object({ title: z.string().min(1), description: z.string().min(1) });

export const UploadMainSchema = z.object({
  ...UploadItemFields,
  /** YouTube chapters; without them they come from the timing's sections. */
  chapters: z.array(z.object({ start: z.number().nonnegative(), title: z.string().min(1) })).optional(),
  /** The comment to pin under the main video. */
  pinned_comment: z.string().min(1).optional(),
  /** The YouTube community post announcing the video. */
  community_post: z.string().min(1).optional(),
  summary_en: EnglishSummarySchema.optional(),
  /** Further thumbnails for YouTube's Test & compare, set by hand in YouTube Studio. */
  alternate_thumbnails: z.array(z.string().min(1)).default([]),
  platforms: z.array(PublishPlatformSchema).min(1).default(['youtube']),
});

export const UploadShortSchema = z.object({
  /** The Short name (`Z1-intro`), as in `renders/shorts/<name>-9x16.mp4`. */
  name: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'name must be letters, digits, dashes, and underscores'),
  /** The moment in a few words, for the heading of the upload text. */
  moment: z.string().min(1).optional(),
  ...UploadItemFields,
  /** The video this Short points to; YouTube's "related video" is set by hand. */
  related: z.literal('main').default('main'),
  platforms: z.array(PublishPlatformSchema).min(1).default(['youtube', 'tiktok']),
  /** The Short as an Instagram Reel: its own caption, at most five hashtags, the cover frame, and the caption of the release-day story when it shows this Short. */
  instagram: z
    .object({
      caption: z.string().min(1),
      hashtags: z.array(HashtagSchema).default([]),
      /** Second of the Short shown as the Reel cover. */
      cover_frame: z.number().nonnegative().optional(),
      /** The caption of the release-day story when it shows this Short's video (the first Short); at most 120 characters, optional. */
      story: z.string().min(1).optional(),
    })
    .optional(),
  /** The Short on TikTok, laid out like the TikTok Studio form: caption, hashtags, the pointer to the full video (`overlay`, a line in the description), and a comment to pin after posting. */
  tiktok: z
    .object({
      caption: z.string().min(1),
      hashtags: z.array(HashtagSchema).default([]),
      overlay: z.string().min(1).optional(),
      pinned_comment: z.string().min(1).optional(),
    })
    .optional(),
  /** The Short as a native video post on X; the link to the main video goes in a reply. */
  x: z.object({ post: z.string().min(1), hashtags: z.array(HashtagSchema).default([]) }).optional(),
  summary_en: EnglishSummarySchema.optional(),
});

/** The release post on X: the post with a native video, and an optional reply that holds the YouTube link. */
export const UploadXSchema = z.object({
  post: z.string().min(1),
  hashtags: z.array(HashtagSchema).default([]),
  /** The optional reply under the post; the YouTube link is appended to it. Without it the post carries no link. */
  reply: z.string().min(1).optional(),
  /** The video attached to the post: `main` (the main video, also when omitted) or a Short's name. */
  media: z.string().min(1).optional(),
});

/**
 * LinkedIn: whether the song suits it (a political, work, tech, or AI angle),
 * decided by the agent with a reason, and the post when it does.
 */
export const UploadLinkedInSchema = z
  .object({
    decision: z.enum(['post', 'skip']),
    reason: z.string().min(1),
    post: z.string().min(1).optional(),
    hashtags: z.array(HashtagSchema).default([]),
    /** The video attached to the post: `main` (the 1:1 or 16:9 render) or a Short name. */
    media: z.string().min(1).default('main'),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'post' && !value.post) ctx.addIssue({ code: 'custom', path: ['post'], message: 'decision post needs the post text' });
  });

/** The song's page on the artist microsite: the texts the page shows beside video, lyrics, and links. */
export const UploadMicrositeSchema = z.object({
  /** One or two sentences for the release list and link previews. */
  teaser: z.string().min(1),
  /** The page text about the song: a few paragraphs, Markdown. */
  text: z.string().min(1),
  /** A line of the lyrics to feature, quoted as sung. */
  quote: z.string().min(1).optional(),
});

/**
 * `review/upload.yaml`: the upload data of the release package. `qa-export`
 * writes it; `upload-text` renders `review/upload.md` from it, and `publish`
 * uploads from it.
 */
export const UploadDataSchema = z
  .object({
    version: z.literal(1),
    /** BCP-47 language of the texts, e.g. `de` or `en`. */
    language: z.string().min(2),
    main: UploadMainSchema,
    shorts: z.array(UploadShortSchema).default([]),
    /** The main video's Instagram Reel (`instagram-post`): its best vertical render; only for a main video of at most 180 s (ADR 0057). */
    instagram_post: z.object({ caption: z.string().min(1), hashtags: z.array(HashtagSchema).default([]) }).optional(),
    /** Spotify for Artists: the Artist Pick message and the editorial pitch. */
    spotify: z.object({ artist_pick: z.string().min(1).optional(), pitch: z.string().min(1).optional() }).optional(),
    /** The announcement a week before the release: an Instagram story with the cover, a YouTube post, and an X post. */
    announcement: z
      .object({
        text: z.string().min(1),
        hashtags: z.array(HashtagSchema).default([]),
        /** The still the announcement and story images are composed from; without it, the still of the cover's recipe. */
        image: z.object({ still: z.string().min(1), focus: z.string().regex(/^\d*\.?\d+,\d*\.?\d+$/, 'use x,y fractions such as 0.5,0.35').optional() }).optional(),
      })
      .optional(),
    x: UploadXSchema.optional(),
    linkedin: UploadLinkedInSchema.optional(),
    microsite: UploadMicrositeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>(['main']);
    data.shorts.forEach((short, index) => {
      if (seen.has(short.name)) {
        ctx.addIssue({ code: 'custom', path: ['shorts', index, 'name'], message: `duplicate item name "${short.name}"` });
      }
      seen.add(short.name);
    });
  });

const WeekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const ClockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM');
const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

/** Platforms the release autopilot can post to by API (ADR 0029). */
export const AutopilotPlatformSchema = z.enum(['youtube', 'tiktok', 'instagram', 'x', 'linkedin', 'microsite']);

/**
 * `config/release-schedule.yaml`: the workspace's release rules. Every
 * project's calendar takes the next free slots under them, so releases and
 * Shorts of different songs never collide. Optional; the defaults are a
 * Friday release (Global Release Day) in the computer's time zone.
 */
export const ReleaseScheduleSchema = z.object({
  version: z.literal(1),
  /** IANA time zone of every time below, e.g. `Europe/Berlin`; defaults to the computer's time zone. */
  timezone: z.string().min(1).optional(),
  release: z
    .object({
      weekday: WeekdaySchema.default('fri'),
      /** When the song goes live on the streaming services (Global Release Day: Friday 00:00). */
      song_time: ClockSchema.default('00:00'),
      /** When the main video goes live on YouTube. */
      video_time: ClockSchema.default('18:00'),
      /** Publish the main video as a YouTube Premiere. */
      premiere: z.boolean().default(true),
      /** At least this many weeks between two releases. */
      min_gap_weeks: z.number().int().min(0).default(1),
      /** The earliest release day, in days from today: distributor delivery and the pitch need the lead. */
      lead_days: z.number().int().min(0).default(21),
      /** No release on these days: `MM-DD` every year or `YYYY-MM-DD` once. Defaults to Christmas and New Year. */
      skip: z
        .array(z.string().regex(/^(\d{4}-)?\d{2}-\d{2}$/, 'use MM-DD or YYYY-MM-DD'))
        .default(['12-24', '12-25', '12-26', '12-31', '01-01']),
    })
    .prefault({}),
  /** Tasks before and after the release, in days relative to the release day. */
  steps: z
    .object({
      distributor: z.number().int().max(0).default(-21),
      pitch: z.number().int().max(-7).default(-14),
      announce: z.number().int().max(-1).default(-7),
      canvas: z.number().int().max(0).default(-7),
      links: z.number().int().min(0).default(1),
      /** When a task without a posting time is due. */
      task_time: ClockSchema.default('10:00'),
    })
    .prefault({}),
  /** Shorts, Reels, and TikToks after the release: one per slot day, songs interleaved. */
  shorts: z
    .object({
      weekdays: z.array(WeekdaySchema).min(1).default(['mon', 'wed', 'fri']),
      times: z
        .object({
          youtube: ClockSchema.default('18:00'),
          tiktok: ClockSchema.default('20:00'),
          instagram: ClockSchema.default('20:00'),
          x: ClockSchema.default('18:00'),
        })
        .prefault({}),
      /** At most this many Shorts of one song per week (Monday to Sunday). */
      per_song_per_week: z.number().int().min(1).default(1),
      /** The first Short goes out on the release day. */
      first_on_release_day: z.boolean().default(true),
    })
    .prefault({}),
  /** Posting times of the release-day posts. */
  posts: z
    .object({
      instagram: ClockSchema.default('20:00'),
      x: ClockSchema.default('18:00'),
      /** LinkedIn: the first such weekday after the release, in the morning. */
      linkedin_weekday: WeekdaySchema.default('tue'),
      linkedin_time: ClockSchema.default('09:00'),
    })
    .prefault({}),
  /** Slots taken outside any project calendar, e.g. Shorts planned by hand. */
  booked: z
    .array(z.object({ date: DaySchema, kind: z.enum(['release', 'short']).default('short'), label: z.string().min(1) }))
    .default([]),
  /** The release autopilot: which platforms `release-run` posts to by API once the user approved a release (ADR 0029). */
  autopilot: z
    .object({
      /** Platforms the autopilot posts to; the others stay manual on the board. */
      platforms: z.array(AutopilotPlatformSchema).default(['youtube', 'tiktok', 'instagram', 'x', 'linkedin', 'microsite']),
      /** YouTube videos are uploaded this many hours before their calendar time (private, or scheduled once the API project is audited). */
      youtube_ahead_hours: z.number().min(0).max(24 * 14).default(24),
      /** Google audited the API project: scheduled uploads go public at their time. Without it they stay private until you switch them in YouTube Studio. */
      youtube_audited: z.boolean().default(false),
      /** TikTok audited the app for direct posting (scope video.publish): posts go out with caption instead of landing as inbox drafts. */
      tiktok_direct: z.boolean().default(false),
      /** A post whose time passed by more than this many hours (the computer was off) waits for you instead of going out late. */
      late_hours: z.number().min(0).max(24 * 7).default(12),
      /** Failed attempts before a post waits for you. */
      retries: z.number().int().min(1).max(10).default(3),
      /** The artist microsite: copy microsite/<slug>.json and its images into `dir` at the page's time, then run `command` there. */
      microsite: z
        .object({
          /** Directory the song pages live in, relative to the workspace or absolute. */
          dir: z.string().min(1),
          /** A command run in `dir` after the copy, e.g. a commit and push that deploys the site. */
          command: z.string().min(1).optional(),
        })
        .optional(),
    })
    .prefault({}),
});

export const CalendarPlatformSchema = z.enum(['distributor', 'spotify', 'youtube', 'shorts', 'tiktok', 'instagram', 'x', 'linkedin', 'microsite']);

/** One dated step of a release calendar. */
export const CalendarEventSchema = z.object({
  /** Stable key, also the key of its status: `youtube`, `pitch`, `short:Z1-intro:tiktok`, ... */
  id: z.string().min(1),
  /** Local date-time with offset, e.g. `2026-12-11T18:00:00+01:00`. */
  at: z.string().min(1),
  platform: CalendarPlatformSchema,
  /** What happens: distributor, pitch, announce, canvas, song, artist-pick, youtube, community, story, post, page, links, short. */
  step: z.string().min(1),
  /** `main`, a Short name, or the announcement. */
  item: z.string().min(1).default('main'),
});

/** `review/calendar.yaml`: when what goes online where. `release` writes it and keeps the dates of events it already holds. */
export const ReleaseCalendarSchema = z.object({
  version: z.literal(1),
  project: z.string().min(1),
  title: z.string().min(1),
  release_date: DaySchema,
  /** True while `release.release_date` in project.yaml is not set: the date is the calendar's proposal. */
  proposed: z.boolean().default(false),
  timezone: z.string().min(1),
  events: z.array(CalendarEventSchema).default([]),
});

/** `review/release-status.json`: what is posted, keyed by calendar event, with the live URL, and the user's release approval. */
export const ReleaseStatusSchema = z.object({
  version: z.literal(1),
  /** The user's one click on the release board: from then on the autopilot posts this release at its calendar times. */
  approval: z
    .object({
      /** When the user approved. */
      at: z.string().min(1),
      /** The release day the user approved. */
      release_date: DaySchema,
    })
    .optional(),
  items: z
    .record(
      z.string(),
      z.object({
        done: z.boolean().default(false),
        /** When it was marked done. */
        at: z.string().optional(),
        /** The live post, video, or track. */
        url: z.string().url().optional(),
        /** Who marked it done: the user on the board, or the autopilot. */
        by: z.enum(['user', 'autopilot']).optional(),
        /** The user takes this post over by hand: the autopilot leaves it alone. */
        manual: z.boolean().optional(),
      }),
    )
    .default({}),
});

export const AutopilotEntryStatusSchema = z.enum([
  /** An attempt started; a crash leaves it standing, and the post then waits for the user. */
  'running',
  /** Live on the platform. */
  'posted',
  /** YouTube: uploaded as a private video; waiting for it to go public. */
  'uploaded',
  /** YouTube: uploaded with a publication time. */
  'scheduled',
  /** TikTok: a draft in the inbox, waiting for the user to post it. */
  'draft',
  'failed',
  /** The user asked for another attempt: earlier failures and a stuck attempt no longer count. */
  'retry',
  /** The user asked to post now although the time has passed. */
  'force',
]);

/** One step of the autopilot on one calendar event. */
export const AutopilotEntrySchema = z.object({
  event: z.string().min(1),
  status: AutopilotEntryStatusSchema,
  at: z.string().min(1),
  /** Platform ID of the post or video. */
  remote_id: z.string().min(1).optional(),
  url: z.string().url().optional(),
  /** YouTube: the scheduled publication time. */
  publish_at: z.string().optional(),
  error: z.string().optional(),
  /** A failure after which the post may be live anyway: never retried by itself, the user checks the platform. */
  uncertain: z.boolean().optional(),
  /** A failure no retry fixes (credentials, billing, a broken text): the post waits for the user at once. */
  fatal: z.boolean().optional(),
  warnings: z.array(z.string()).default([]),
  /** What the user still does by hand on the platform. */
  manual_steps: z.array(z.string()).default([]),
  /** What the calls cost, where the platform bills per call (X). */
  cost_usd: z.number().nonnegative().optional(),
  mock: z.boolean().default(false),
});

/** `review/autopilot.json`: the autopilot's log, one entry per step, oldest first. `release-run` writes it; the board appends retry and force. */
export const AutopilotLogSchema = z.object({
  version: z.literal(1),
  entries: z.array(AutopilotEntrySchema).default([]),
});

export const PublishStatusSchema = z.enum(['uploaded', 'scheduled', 'draft', 'processing', 'failed']);

/** One upload attempt of one item to one platform. */
export const PublishEntrySchema = z.object({
  platform: PublishPlatformSchema,
  /** `main` or a Short name. */
  item: z.string().min(1),
  file: z.string().min(1),
  /** SHA-256 of the uploaded video. */
  file_hash: z.string().regex(/^[0-9a-f]{64}$/),
  /** YouTube video ID or TikTok publish ID. */
  remote_id: z.string().min(1).optional(),
  url: z.string().url().optional(),
  status: PublishStatusSchema,
  /** YouTube: the scheduled `publishAt`. */
  publish_at: z.string().optional(),
  thumbnail: z.enum(['set', 'skipped', 'failed', 'none']).optional(),
  /** True for runs of the mock adapter; a real run never skips because of them. */
  mock: z.boolean().default(false),
  warnings: z.array(z.string()).default([]),
  error: z.string().optional(),
  /** A failed attempt that may have gone out anyway (a lost answer after the last byte): it is never sent again without `--force`. */
  uncertain: z.boolean().optional(),
  /** YouTube API quota units the attempt spent. */
  quota_units: z.number().int().nonnegative().optional(),
  at: z.string().min(1),
});

/** `review/publish.json`: the publish log, one entry per upload attempt, oldest first. */
export const PublishLogSchema = z.object({
  version: z.literal(1),
  entries: z.array(PublishEntrySchema).default([]),
});

/**
 * Text limits per platform, checked by `release` and `qa`. `config/channel.yaml`
 * may override them when a platform changes its rules.
 */
export const PLATFORM_LIMITS = {
  youtube: { title: 100, description_bytes: 5000, tags: 500, hashtags: 15 },
  /**
   * Instagram allows five hashtags per post and Reel since December 2025. A
   * story has no text field; the caption added to a story's video takes 120
   * characters in the app (HS-267).
   */
  instagram: { caption: 2200, hashtags: 5, story_caption: 120 },
  /** TikTok's caption limit for an upload through its API; the app allows more. */
  tiktok: { caption: 2200, hashtags: 10 },
  /** Spotify for Artists: the editorial pitch. */
  spotify: { pitch: 500 },
  /** X without Premium: 280 characters per post (links count as 23); one or two hashtags. */
  x: { post: 280, hashtags: 2 },
  /** LinkedIn: 3,000 characters; about 210 show before "see more"; at most three hashtags. */
  linkedin: { post: 3000, hook: 210, hashtags: 3 },
} as const;

const LimitOverrides = <T extends Record<string, number>>(limits: T) =>
  z.object(Object.fromEntries(Object.keys(limits).map((key) => [key, z.number().int().positive().optional()])) as Record<keyof T, z.ZodOptional<z.ZodNumber>>);

/** A channel's presence on one platform. A URL may hold the placeholder `<ID>`, reported as a TODO. */
export const ChannelLinkSchema = z.object({
  handle: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
});

/**
 * `config/channel.yaml`: the workspace's channel, optional. Release texts take
 * links, footer, hashtag sets, and disclosure defaults from it.
 */
export const ChannelConfigSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  tagline: z.string().min(1).optional(),
  /** A line the release board shows in its top right corner. */
  motto: z.string().min(1).max(200).optional(),
  /** BCP-47 language of the channel's own texts (footer, bios). */
  language: z.string().min(2),
  /** Keyed by platform: youtube, instagram, tiktok, spotify, or any other. */
  links: z.record(z.string(), ChannelLinkSchema).default({}),
  /** Building blocks appended to descriptions. */
  footer: z
    .object({
      /** E.g. "Made with coreslopper: https://www.npmjs.com/package/coreslopper". */
      tool_credit: z.string().min(1).optional(),
      /** Template with {artist}, {title}, and {ai_tool}. */
      song_credit: z.string().min(1).optional(),
      /** Link keys listed below a description, in order. */
      links: z.array(z.string().min(1)).default([]),
    })
    .prefault({}),
  /** Named hashtag sets, e.g. always, tech, satire, international. */
  hashtag_sets: z.record(z.string(), z.array(HashtagSchema)).default({}),
  limits: z
    .object({
      youtube: LimitOverrides(PLATFORM_LIMITS.youtube).optional(),
      instagram: LimitOverrides(PLATFORM_LIMITS.instagram).optional(),
      tiktok: LimitOverrides(PLATFORM_LIMITS.tiktok).optional(),
      spotify: LimitOverrides(PLATFORM_LIMITS.spotify).optional(),
      x: LimitOverrides(PLATFORM_LIMITS.x).optional(),
      linkedin: LimitOverrides(PLATFORM_LIMITS.linkedin).optional(),
    })
    .prefault({}),
  /** AI disclosure defaults: YouTube "altered or synthetic content", TikTok AI label, Instagram "AI info", distributor AI credits. */
  disclosure: z
    .object({
      youtube_synthetic: z.boolean().default(true),
      tiktok_ai_label: z.boolean().default(true),
      instagram_ai_label: z.boolean().default(true),
      distributor_ai_credits: z.boolean().default(true),
    })
    .prefault({}),
  /**
   * Release facts that are the same for every song of the channel: `release`
   * and the board use them where a project's `release:` block leaves a field
   * out. The project always wins. Only facts the user gave go here.
   */
  release_defaults: z
    .object({
      distributor: z.enum(['distrokid', 'manual']).optional(),
      artist: z.string().min(1).optional(),
      primary_genre: z.string().min(1).optional(),
      secondary_genre: z.string().min(1).optional(),
      explicit: z.boolean().optional(),
      songwriters: z.array(z.string().min(1)).optional(),
      producer: z.string().min(1).optional(),
      label: z.string().min(1).optional(),
      ai_credits: z
        .object({
          lyrics: AiShareSchema.optional(),
          music: AiShareSchema.optional(),
          vocals: AiShareSchema.optional(),
          instrumental: AiShareSchema.optional(),
        })
        .optional(),
      ai_tool: z.string().min(1).optional(),
      license_note: z.string().min(1).optional(),
    })
    .optional(),
});

export const ReleaseFileKindSchema = z.enum([
  'video',
  'subtitles',
  'thumbnail',
  'short',
  'short-thumbnail',
  'tiktok-cover',
  'audio',
  'cover',
  'canvas',
  'lyrics',
  'text',
  'readme',
  'calendar',
  'microsite',
  /** The announcement images and teaser a week before the release, with the release date on them. */
  'announcement',
  /** The release-day story image. */
  'story',
  /** The 4:5 Instagram feed image of older release folders; `release` no longer composes it (ADR 0057). */
  'feed-image',
]);

/** One file of the release folder. */
export const ReleaseFileSchema = z.object({
  /** Relative to `renders/release/`. */
  path: z.string().min(1),
  kind: ReleaseFileKindSchema,
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** What the file must meet: size, duration, codec, limits. */
  spec: z.record(z.string(), z.unknown()).default({}),
  /** The project file it came from, or `generated`. */
  source: z.string().min(1),
});

/**
 * One text of a release post as the platform receives it. `limit` is the check
 * `release`, `qa`, the board and `publish` measure; `hashtags` is the platform's
 * own hashtag count. Neither carries a TODO: a missing text is absent from
 * `ReleasePlanPost.texts` and named in `ReleasePlan.problems`.
 */
export const PlanTextLimitSchema = z.object({
  max: z.number().int().positive(),
  unit: z.enum(['chars', 'bytes']).default('chars'),
  /** X counts a link as 23 characters. */
  counting: z.literal('x').optional(),
  /** Characters added for a link the text will carry (the X reply's YouTube link). */
  extra: z.number().int().nonnegative().optional(),
  /** Link slots that do not count (the LinkedIn post's YouTube link). */
  strip: z.array(z.string().min(1)).optional(),
  /** The prefix of the error line, e.g. `youtube main` or `tiktok Z1-intro`. */
  label: z.string().min(1),
  /** The noun of the error line, e.g. `title` or `reply with the link`. */
  field: z.string().min(1),
  verb: z.enum(['has', 'have']).default('has'),
  /** A sentence that replaces the standard limit line. */
  style: z.literal('linkedin-hook').optional(),
});

export const PlanHashtagsSchema = z.object({
  count: z.number().int().nonnegative(),
  max: z.number().int().positive(),
  label: z.string().min(1),
  /** A parenthetical suffix, e.g. ` (Instagram)` for the announcement. */
  suffix: z.string().optional(),
});

export const PlanTextSchema = z.object({
  /** The exact text the platform receives: no TODO marker, no `<ID>` placeholder. */
  value: z.string(),
  limit: PlanTextLimitSchema.optional(),
  hashtags: PlanHashtagsSchema.optional(),
});

/** One file of a post inside `renders/release/`, with the role the board labels it by. */
export const PlanFileSchema = z.object({
  role: z.string().min(1),
  path: z.string().min(1),
  /** The number of an alternate thumbnail (2, 3). */
  index: z.number().int().positive().optional(),
});

/** A post, story, or task of one release, keyed by its calendar event id. */
export const ReleasePlanPostSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(['youtube', 'shorts', 'tiktok', 'instagram', 'spotify', 'x', 'linkedin', 'microsite']),
  /** A task (distributor, pitch, canvas, links) rather than a post to publish. */
  task: z.boolean().default(false),
  texts: z.record(z.string(), PlanTextSchema).default({}),
  files: z.array(PlanFileSchema).default([]),
  /** The render or video the platform uploads, relative to the project. */
  source: z.string().min(1).optional(),
  /** The release-folder media the social API uploads. */
  media: z.string().min(1).optional(),
  placement: z.enum(['reel', 'feed', 'story']).optional(),
  /** The text points at the live main video. */
  needsYoutube: z.boolean().optional(),
  /** Ask for the live URL once posted. */
  url: z.boolean().optional(),
  pointer: z.literal('youtube').optional(),
  /** The moment of a Short, for its heading. */
  moment: z.string().min(1).optional(),
  /** Second of the Short shown as the Reel cover. */
  coverFrame: z.number().nonnegative().optional(),
  syntheticMedia: z.boolean().optional(),
  madeForKids: z.boolean().optional(),
  /** The video language on YouTube. */
  language: z.string().min(2).optional(),
  english: z.object({ title: z.string(), description: z.string() }).optional(),
  /** Why LinkedIn is skipped, when it is. */
  reason: z.string().min(1).optional(),
  /** The first LinkedIn paragraph and what shows before "see more". */
  hook: z.object({ count: z.number().int().nonnegative(), max: z.number().int().positive() }).optional(),
  /** Worded problems of this post (identical captions, media not a Short). */
  errors: z.array(z.string()).default([]),
  /** Fields still to write in review/upload.yaml, e.g. `shorts.Z1-intro.tiktok`. */
  missing: z.array(z.string()).default([]),
});

/**
 * One release plan: every post's exact text, files, sources and limits, and
 * what is still missing. `release` writes it into `manifest.json`; the folder
 * texts, QA, the board, the autopilot and `publish` all read it.
 */
export const ReleasePlanSchema = z.object({
  version: z.literal(1),
  kind: z.enum(['music-video', 'episode', 'meme']),
  language: z.string().min(1),
  slug: z.string().min(1),
  artist: z.string().optional(),
  title: z.string(),
  durationSeconds: z.number().optional(),
  premiere: z.boolean().default(false),
  /** The channel's disclosure switches and facts the folder and board show. */
  settings: z
    .object({
      youtubeSynthetic: z.boolean().default(true),
      instagramAiLabel: z.boolean().default(true),
      tiktokAiLabel: z.boolean().default(true),
      /** The channel's YouTube handle, for the TikTok pointer. */
      youtubeHandle: z.string().min(1).optional(),
      distributor: z.string().min(1).optional(),
      linkedin: z.object({ decision: z.enum(['post', 'skip']), reason: z.string().min(1) }).optional(),
    })
    .prefault({}),
  posts: z.array(ReleasePlanPostSchema).default([]),
  problems: z.object({ errors: z.array(z.string()).default([]), missing: z.array(z.string()).default([]) }).prefault({}),
});

/**
 * Which posts and files a release has (ADR 0057): a music video, a meme, an
 * episode, or a short episode – an episode whose master is at least as tall as
 * wide and whose episode track lasts at most 180 s.
 */
export const ReleaseShapeSchema = z.enum(['music-video', 'meme', 'episode', 'short-episode']);

/** `renders/release/manifest.json`: every file `release` wrote, the plan, and the open TODOs. */
export const ReleaseManifestSchema = z.object({
  version: z.literal(1),
  project: z.string().min(1),
  /** The release shape this run derived; a manifest without it reads as its project kind (`manifestShape`). */
  shape: ReleaseShapeSchema.optional(),
  generated_at: z.string().min(1),
  files: z.array(ReleaseFileSchema).default([]),
  plan: ReleasePlanSchema.optional(),
  todos: z.array(z.string()).default([]),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ProjectKind = z.infer<typeof ProjectKindSchema>;
export type Distribution = z.infer<typeof DistributionSchema>;
export type DisplayRule = z.infer<typeof DisplayRuleSchema>;
export type SetDefinition = z.infer<typeof SetSchema>;
export type Plate = z.infer<typeof PlateSchema>;
export type Prop = z.infer<typeof PropSchema>;
export type SetBible = z.infer<typeof SetBibleSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type ScriptLine = z.infer<typeof ScriptLineSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type Take = z.infer<typeof TakeSchema>;
export type SeriesState = z.infer<typeof SeriesStateSchema>;
export type Takes = z.infer<typeof TakesSchema>;
export type Format = z.infer<typeof FormatSchema>;
export type StageStatus = z.infer<typeof StageStatusSchema>;
export type StageState = z.infer<typeof StageStateSchema>;
export type State = z.infer<typeof StateSchema>;
export type Word = z.infer<typeof WordSchema>;
export type Line = z.infer<typeof LineSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Timing = z.infer<typeof TimingSchema>;
export type TimingOverrides = z.infer<typeof TimingOverridesSchema>;
export type Anchor = z.infer<typeof AnchorSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type ShotSource = z.infer<typeof ShotSourceSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type Shot = z.infer<typeof ShotSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type StyleBible = z.infer<typeof StyleBibleSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type CharacterState = z.infer<typeof CharacterStateSchema>;
export type CharacterBible = z.infer<typeof CharacterBibleSchema>;
export type LibraryCharacter = z.infer<typeof LibraryCharacterSchema>;
export type LibraryPlate = z.infer<typeof LibraryPlateSchema>;
export type LibrarySet = z.infer<typeof LibrarySetSchema>;
export type BrandKit = z.infer<typeof BrandKitSchema>;
/** One note on a render: a frame, or a range from `frame` to `end_frame`. Written by the board's review view. */
export const ReviewNoteSchema = z
  .object({
    /** Set by the board; notes written by the retired desktop player have none until the board submits them. */
    id: z.string().min(1).optional(),
    frame: z.number().int().nonnegative(),
    seconds: z.number().nonnegative(),
    /** `mm:ss.mmm`. */
    time: z.string(),
    end_frame: z.number().int().nonnegative().optional(),
    end_seconds: z.number().nonnegative().optional(),
    end_time: z.string().optional(),
    text: z.string().min(1),
    /** The review round that sent this note to the agent; a note without one is a draft. */
    round: z.number().int().positive().optional(),
    created: z.string().optional(),
  })
  .passthrough();

/** `review/notes/<video-stem>.json`: the user's notes on one render. */
export const ReviewNotesSchema = z
  .object({
    video: z.string().min(1),
    fps: z.number().positive(),
    notes: z.array(ReviewNoteSchema).default([]),
  })
  .passthrough();

/** `review/rounds/<NNN>.json`: notes the user sent to the agent, frozen when sent. */
export const ReviewRoundSchema = z.object({
  version: z.literal(1),
  round: z.number().int().positive(),
  /** The render the notes refer to, in renders/. Frames and seconds are that file's. */
  video: z.string().min(1),
  fps: z.number().positive(),
  submitted_at: z.string().min(1),
  notes: z
    .array(
      z.object({
        id: z.string().min(1),
        frame: z.number().int().nonnegative(),
        seconds: z.number().nonnegative(),
        time: z.string(),
        end_frame: z.number().int().nonnegative().optional(),
        end_seconds: z.number().nonnegative().optional(),
        end_time: z.string().optional(),
        /** Storyboard shots on screen during the note, from the effective timing. */
        shots: z.array(z.string()).default([]),
        section: z.string().optional(),
        text: z.string().min(1),
      }),
    )
    .min(1),
});

export const ReviewReplyStatusSchema = z.enum(['fixed', 'partly', 'not-fixed', 'question']);

/** `review/rounds/<NNN>.replies.json`: the agent's answer to a round, one reply per note. Its existence closes the round. */
export const ReviewRepliesSchema = z.object({
  version: z.literal(1),
  round: z.number().int().positive(),
  answered_at: z.string().min(1),
  /** The render that shows the fixes, in renders/. */
  render: z.string().optional(),
  notes: z.array(
    z.object({
      id: z.string().min(1),
      status: ReviewReplyStatusSchema,
      /** One or two sentences: what changed, or why not. */
      reply: z.string().min(1),
    }),
  ),
});

/** A file name inside a library entry's folder: no folders, no dot files. */
const LibraryFileSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, 'a library file is a plain file name inside the entry folder');

/**
 * `library/characters/<id>/character.yaml`: a character of the workspace's
 * character library. Its files lie next to it. A project or series takes a
 * copy (`character use`); the identity (sheet, references, voice) always
 * comes along, each state only when chosen.
 */
export const LibraryCharacterSchema = z
  .object({
    version: z.literal(1),
    id: ScriptIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    prompt: z.string().optional(),
    face: DisplayRuleSchema.default('full'),
    /** The character sheet, a file of this folder. */
    sheet: LibraryFileSchema.optional(),
    /** Identity and outfit references: seed, face, outfits, turnarounds. */
    refs: z.array(LibraryFileSchema).default([]),
    voice: z.object({ ref: LibraryFileSchema, transcript: z.string().min(1) }).optional(),
    /** Continuity states from earlier productions; chosen one by one when the character is used. */
    states: z
      .array(CharacterStateSchema.extend({ ref: LibraryFileSchema.optional(), from: z.string().optional() }).passthrough())
      .default([]),
    /** Free words for finding the character on the board: "pop star", "narrator". */
    tags: z.array(z.string().min(1)).default([]),
    /** Where the character came from first: `projects/<slug>` or `manual`. */
    origin: z.string().min(1),
    added: z.string().min(1),
    /** Every later import into this entry: when, from where, which files and states it brought. */
    history: z
      .array(z.object({ at: z.string().min(1), from: z.string().min(1), added: z.array(z.string()).default([]) }))
      .default([]),
  })
  .superRefine((entry, ctx) => duplicateIds(entry.states, ctx, ['states'], 'state'));

/** A plate of a library set: its camera angle and the image's plain file name. */
export const LibraryPlateSchema = z.object({
  id: ScriptIdSchema,
  /** Camera position and framing, e.g. "shelf, frontal, waist height, medium". */
  angle: z.string().min(1),
  /** Prompt for the plate; the set's prompt plus the angle when absent. */
  prompt: z.string().optional(),
  /** The plate image, a file of this folder. */
  file: LibraryFileSchema.optional(),
});

/**
 * `library/sets/<id>/set.yaml`: a set of the workspace's set library. Its
 * files lie next to it. A project or canon takes a copy (`set use`) with every
 * reference and every plate, since the plates are the same place in one light.
 */
export const LibrarySetSchema = z
  .object({
    version: z.literal(1),
    id: ScriptIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    prompt: z.string().min(1),
    /** Reference start frames, each a file of this folder. */
    refs: z.array(LibraryFileSchema).default([]),
    plates: z.array(LibraryPlateSchema).default([]),
    /** Free words for finding the set on the board: "bar", "night", "neon". */
    tags: z.array(z.string().min(1)).default([]),
    /** Where the set came from first: `projects/<slug>` or `manual`. */
    origin: z.string().min(1),
    added: z.string().min(1),
    /** Every later import into this entry: when, from where, which files and plates it brought. */
    history: z
      .array(z.object({ at: z.string().min(1), from: z.string().min(1), added: z.array(z.string()).default([]) }))
      .default([]),
  })
  .superRefine((entry, ctx) => duplicateIds(entry.plates, ctx, ['plates'], 'plate'));

/** The one audio file of a library sound, next to its `sound.yaml`. */
export const LIBRARY_SOUND_FILE = 'sound.wav';
/** The entry file of a library sound. */
export const LIBRARY_SOUND_ENTRY = 'sound.yaml';

const SecondsSchema = z.number().finite().nonnegative();

/**
 * `library/sounds/<id>/sound.yaml`: a sound of the workspace's sound library
 * (AGG-LibrarySound, ADR 0051), next to its one WAV (`sound.wav`). Length and
 * loudness are measured from the file, never typed. The cue is the moment the
 * sound lands, in seconds from its (trimmed) start; a trim and a cue lie
 * inside the sound.
 */
export const LibrarySoundSchema = z
  .object({
    version: z.literal(1),
    id: ScriptIdSchema,
    title: z.string().trim().min(1, 'a library sound needs a title'),
    /** What the sound is typically used for; the meme skill picks by it. */
    use_when: z.string().trim().min(1, 'a library sound needs a use when'),
    tags: z.array(z.string().min(1)).default([]),
    /** Seconds, measured from `sound.wav`. */
    length: z.number().finite().positive(),
    /** Integrated loudness in LUFS, measured from `sound.wav`; the file is never normalised. */
    loudness: z.number().finite(),
    cue: SecondsSchema.optional(),
    trim: z.object({ start: SecondsSchema, end: SecondsSchema }).optional(),
    /** Where the sound came from: a URL or free words. */
    source: z.string().min(1).optional(),
    licence: z.string().trim().min(1).default('unknown'),
    /** The credit text a licence that asks for attribution needs (HS-265). */
    credit: z.string().min(1).optional(),
    /** sha256 of `sound.wav`: one sound, one entry; a take copied from it records this hash. */
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    /** sha256 of the file as the user added it, so the same file is found again whatever ffmpeg build converts it. */
    original_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    added: z.string().min(1),
  })
  .superRefine((sound, ctx) => {
    for (const problem of librarySoundTimeProblems(sound)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [problem.field], message: problem.message });
  });

export type LibrarySound = z.infer<typeof LibrarySoundSchema>;

/** How long a library sound plays: its trim, or the whole sound without one. */
export function librarySoundSeconds(sound: { length: number; trim?: { start: number; end: number } }): number {
  return sound.trim ? sound.trim.end - sound.trim.start : sound.length;
}

/** Where a cue or a trim leaves the sound: a trim inside the length, a cue inside the (trimmed) sound. */
export function librarySoundTimeProblems(sound: { length: number; cue?: number; trim?: { start: number; end: number } }): { field: 'cue' | 'trim'; message: string }[] {
  const problems: { field: 'cue' | 'trim'; message: string }[] = [];
  const { length, cue, trim } = sound;
  if (trim && !(trim.start < trim.end)) {
    problems.push({ field: 'trim', message: `the trim ${trim.start}-${trim.end} must start before it ends` });
  } else if (trim && trim.end > length) {
    problems.push({ field: 'trim', message: `the trim ${trim.start}-${trim.end} lies outside the sound's length of ${length} s` });
  }
  const span = trim ? trim.end - trim.start : length;
  if (cue !== undefined && cue > span) {
    problems.push({ field: 'cue', message: trim ? `the cue ${cue} lies outside the trim of ${span} s` : `the cue ${cue} lies outside the sound's length of ${length} s` });
  }
  return problems;
}

export const ReferenceKindSchema = z.enum(['look', 'character', 'location', 'storyboard', 'concept', 'footage', 'voice', 'other']);

/**
 * `references.yaml` of a project or series canon: what the user handed over
 * before the grilling (images, storyboards, concepts, footage, voice
 * recordings, links). Files live in `assets/references/`.
 */
export const ReferencesSchema = z.object({
  version: z.literal(1),
  references: z
    .array(
      z
        .object({
          id: z.string().regex(/^r[0-9a-f]{6,}$/),
          kind: ReferenceKindSchema,
          /** Relative to the project or canon, under assets/references/. */
          file: z.string().regex(/^assets\/references\/[^/]+$/).optional(),
          url: z.string().regex(/^https?:\/\//).optional(),
          /** The original file name or the link's title. */
          title: z.string().optional(),
          /** Who or what it shows: a character, a set, a section of the song. */
          subject: z.string().optional(),
          /** What the user wants from it, in their words. */
          note: z.string().optional(),
          added: z.string().min(1),
        })
        .refine((value) => Boolean(value.file) !== Boolean(value.url), { message: 'a reference is either a file or a url' }),
    )
    .default([]),
});

export type ReferenceKind = z.infer<typeof ReferenceKindSchema>;
export type References = z.infer<typeof ReferencesSchema>;
export type Reference = References['references'][number];
export type ReviewNote = z.infer<typeof ReviewNoteSchema>;
export type ReviewNotes = z.infer<typeof ReviewNotesSchema>;
export type ReviewRound = z.infer<typeof ReviewRoundSchema>;
export type ReviewReplies = z.infer<typeof ReviewRepliesSchema>;
export type ModelPricing = z.infer<typeof ModelPricingSchema>;
export type ModelRoleVariant = z.infer<typeof ModelRoleVariantSchema>;
export type ModelRole = z.infer<typeof ModelRoleSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type ProviderKind = z.infer<typeof ProviderKindSchema>;
export type ImageProviderKind = z.infer<typeof ImageProviderKindSchema>;
export type VideoProviderKind = z.infer<typeof VideoProviderKindSchema>;
export type LipSyncProviderKind = z.infer<typeof LipSyncProviderKindSchema>;
export type PublishPlatform = z.infer<typeof PublishPlatformSchema>;
export type UploadMain = z.infer<typeof UploadMainSchema>;
export type UploadShort = z.infer<typeof UploadShortSchema>;
export type UploadData = z.infer<typeof UploadDataSchema>;
export type ReleaseSchedule = z.infer<typeof ReleaseScheduleSchema>;
export type CalendarPlatform = z.infer<typeof CalendarPlatformSchema>;
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;
export type ReleaseCalendar = z.infer<typeof ReleaseCalendarSchema>;
export type ReleaseStatus = z.infer<typeof ReleaseStatusSchema>;
export type AutopilotPlatform = z.infer<typeof AutopilotPlatformSchema>;
export type AutopilotSettings = ReleaseSchedule['autopilot'];
export type AutopilotEntry = z.infer<typeof AutopilotEntrySchema>;
export type AutopilotLog = z.infer<typeof AutopilotLogSchema>;
export type PublishStatus = z.infer<typeof PublishStatusSchema>;
export type PublishEntry = z.infer<typeof PublishEntrySchema>;
export type PublishLog = z.infer<typeof PublishLogSchema>;
export type AiShare = z.infer<typeof AiShareSchema>;
export type ReleaseMetadata = z.infer<typeof ReleaseMetadataSchema>;
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;
export type PlanTextLimit = z.infer<typeof PlanTextLimitSchema>;
export type PlanHashtags = z.infer<typeof PlanHashtagsSchema>;
export type PlanText = z.infer<typeof PlanTextSchema>;
export type PlanFile = z.infer<typeof PlanFileSchema>;
export type ReleasePlanPost = z.infer<typeof ReleasePlanPostSchema>;
export type ReleasePlan = z.infer<typeof ReleasePlanSchema>;
export type ReleaseFile = z.infer<typeof ReleaseFileSchema>;
export type ReleaseFileKind = z.infer<typeof ReleaseFileKindSchema>;
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;
export type ReleaseShape = z.infer<typeof ReleaseShapeSchema>;
