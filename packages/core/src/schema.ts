import { z } from 'zod';

export const FormatSchema = z.object({
  aspect: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive().default(30),
});

/** Every generation provider. `comfyui` is a local backend that runs tagged workflow exports. */
export const ProviderKindSchema = z.enum(['fal', 'higgsfield', 'comfyui', 'mock']);
/** Providers that can generate and edit stills. */
export const ImageProviderKindSchema = z.enum(['fal', 'higgsfield', 'comfyui', 'mock']);
/** Providers that can generate video clips. */
export const VideoProviderKindSchema = z.enum(['fal', 'higgsfield', 'comfyui', 'mock']);
/** Providers that can lip-sync a face to a vocal segment. */
export const LipSyncProviderKindSchema = z.enum(['fal', 'higgsfield', 'comfyui', 'mock']);
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

/** What a project produces. A missing kind means `music-video`. */
export const ProjectKindSchema = z.enum(['music-video', 'episode']);

export const ProvidersSchema = z
  .object({
    image: ImageProviderKindSchema.default('mock'),
    video: VideoProviderKindSchema.default('mock'),
    /**
     * Lip-sync can use a different provider from the rest of the video.
     * Defaults to `video`, or to `fal` when `video` is `comfyui`.
     */
    lipsync: LipSyncProviderKindSchema.optional(),
    /** `audio.*` roles (stingers, SFX, voices, extra music; never the song itself). Defaults to `comfyui`. */
    audio: AudioProviderKindSchema.optional(),
  })
  .default({ image: 'mock', video: 'mock' });

export const ProjectConfigSchema = z
  .object({
    version: z.literal(1),
    slug: SlugSchema,
    kind: ProjectKindSchema.default('music-video'),
    /** Episode only: the series whose canon this episode uses (`series/<slug>/`). */
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
  })
  .superRefine((config, ctx) => {
    if (config.kind !== 'episode') return;
    for (const key of ['series', 'episode'] as const) {
      if (config[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: `an episode project must set "${key}"` });
      }
    }
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
    edge: z.enum(['start', 'end']).default('start'),
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
      /** Episode only: sets of the series canon; each must be the set of the shot's scene. */
      sets: z.array(z.string()).default([]),
    })
    .default({ style: [], characters: [], sets: [] }),
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
   */
  lipSync: z
    .object({
      character: z.string().min(1),
      source: z.string().default('audio/stems/vocals.wav'),
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
});

export const CharacterBibleSchema = z.object({
  version: z.literal(1).default(1),
  characters: z.array(CharacterSchema).default([]),
});

/** A recurring location of a series. */
export const SetSchema = z.object({
  id: ScriptIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  /** Prompt anchor that every keyframe in this set starts from. */
  prompt: z.string().min(1),
  /** Reference start frames, relative to the series folder (`sets/<id>/...`). */
  refs: z.array(z.string()).default([]),
});

export const SetBibleSchema = z.object({
  version: z.literal(1).default(1),
  sets: z.array(SetSchema).default([]),
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
    prompt: z.string().min(1),
    duration: z.number().positive(),
    pause_after: PauseAfterSchema,
  }),
  z.object({
    kind: z.literal('pause'),
    ...ScriptLineBase,
    duration: z.number().positive(),
  }),
]);

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

export const TakeSchema = z.object({
  source: z.enum(['generated', 'imported']),
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

export const ModelsConfigSchema = z.object({
  version: z.literal(1).default(1),
  last_verified: z.string().optional(),
  roles: z.record(z.string(), ModelRoleSchema),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ProjectKind = z.infer<typeof ProjectKindSchema>;
export type DisplayRule = z.infer<typeof DisplayRuleSchema>;
export type SetDefinition = z.infer<typeof SetSchema>;
export type SetBible = z.infer<typeof SetBibleSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type ScriptLine = z.infer<typeof ScriptLineSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type Take = z.infer<typeof TakeSchema>;
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
export type CharacterBible = z.infer<typeof CharacterBibleSchema>;
export type BrandKit = z.infer<typeof BrandKitSchema>;
export type ModelPricing = z.infer<typeof ModelPricingSchema>;
export type ModelRoleVariant = z.infer<typeof ModelRoleVariantSchema>;
export type ModelRole = z.infer<typeof ModelRoleSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type ProviderKind = z.infer<typeof ProviderKindSchema>;
export type ImageProviderKind = z.infer<typeof ImageProviderKindSchema>;
export type VideoProviderKind = z.infer<typeof VideoProviderKindSchema>;
