export type Operation = 'generateImage' | 'editImage' | 'imageToVideo';

export interface ProviderInput {
  model: string;
  prompt: string;
  negativePrompt?: string;
  references?: string[];
  seed: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  params?: Record<string, unknown>;
  outputDir: string;
}

export interface ProviderOutput {
  files: string[];
  raw?: unknown;
}

export interface Provider {
  name: string;
  generateImage(input: ProviderInput): Promise<ProviderOutput>;
  editImage(input: ProviderInput): Promise<ProviderOutput>;
  imageToVideo(input: ProviderInput): Promise<ProviderOutput>;
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
