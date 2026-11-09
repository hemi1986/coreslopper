export type Operation =
  | 'generateImage'
  | 'editImage'
  | 'textToVideo'
  | 'imageToVideo'
  | 'firstLastFrameToVideo'
  | 'lipSync';

export interface ProviderInput {
  model: string;
  prompt: string;
  negativePrompt?: string;
  references?: string[];
  /** Audio file that drives a lipSync generation (vocal segment). */
  audio?: string;
  seed: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  params?: Record<string, unknown>;
  outputDir: string;
  /** Stable request key for providers that support idempotent submissions. */
  idempotencyKey?: string;
}

export interface ProviderOutput {
  files: string[];
  raw?: unknown;
}

export interface Provider {
  name: string;
  generateImage(input: ProviderInput): Promise<ProviderOutput>;
  editImage(input: ProviderInput): Promise<ProviderOutput>;
  /** Generate a clip from the prompt alone. */
  textToVideo(input: ProviderInput): Promise<ProviderOutput>;
  /** Animate a start frame (`references[0]`). */
  imageToVideo(input: ProviderInput): Promise<ProviderOutput>;
  /** Animate between a start frame (`references[0]`) and an end frame (`references[1]`). */
  firstLastFrameToVideo(input: ProviderInput): Promise<ProviderOutput>;
  /** Animate a still face image so it sings or speaks the given audio. */
  lipSync(input: ProviderInput): Promise<ProviderOutput>;
  /**
   * Extra cache-key material that is not in the request, such as the content of
   * a local workflow file. Return undefined when the model name is enough.
   */
  fingerprint?(operation: Operation, model: string): Promise<string | undefined>;
}

export interface GenerationRequest extends Omit<ProviderInput, 'seed'> {
  operation: Operation;
  role: string;
  seed?: number;
  estimatedCostUsd: number;
  projectDir?: string;
}

export interface GenerationResult {
  id: string;
  hash: string;
  operation: Operation;
  role: string;
  provider: string;
  model: string;
  prompt: string;
  seed: number;
  references: string[];
  audio?: string;
  params: Record<string, unknown>;
  costUsd: number;
  cached: boolean;
  files: string[];
  createdAt: string;
}

export interface GenerationRunnerOptions {
  provider: Provider;
  cacheDir: string;
  manifestPath: string;
  beforeGenerate?: (estimatedCostUsd: number) => Promise<void> | void;
}
