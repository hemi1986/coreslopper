import { z } from 'zod';

export const FormatSchema = z.object({
  aspect: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive().default(30),
});

/** Every generation provider. `comfyui` is a local backend for video clips only. */
export const ProviderKindSchema = z.enum(['fal', 'higgsfield', 'comfyui', 'mock']);
/** Providers that can generate and edit stills. */
export const ImageProviderKindSchema = z.enum(['fal', 'higgsfield', 'mock']);
/** Providers that can generate video clips. */
export const VideoProviderKindSchema = z.enum(['fal', 'higgsfield', 'comfyui', 'mock']);
/** Providers that can lip-sync a face to a vocal segment. */
export const LipSyncProviderKindSchema = z.enum(['fal', 'higgsfield', 'mock']);

export const ProjectConfigSchema = z.object({
  version: z.literal(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase letters, digits, and dashes'),
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
  providers: z
    .object({
      image: ImageProviderKindSchema.default('mock'),
      video: VideoProviderKindSchema.default('mock'),
      /**
       * Lip-sync can use a different provider from the rest of the video.
       * Defaults to `video`, or to `fal` when `video` is `comfyui`.
       */
      lipsync: LipSyncProviderKindSchema.optional(),
    })
    .default({ image: 'mock', video: 'mock' }),
  brand: z.string().min(1).default('example'),
  models: z.record(z.string(), z.unknown()).default({}),
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
  bpm: z.number().positive(),
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
    })
    .default({ style: [], characters: [] }),
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

export const CharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  sheet: z.string().optional(),
  refs: z.array(z.string()).default([]),
  prompt: z.string().optional(),
});

export const CharacterBibleSchema = z.object({
  version: z.literal(1).default(1),
  characters: z.array(CharacterSchema).default([]),
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
