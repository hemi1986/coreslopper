import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, copyFile, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  BenchScoresFileSchema,
  BudgetError,
  ConfigError,
  ValidationError,
  assertAffordable,
  benchPaths,
  ensureDir,
  fixturePath,
  formatUsd,
  hashFile,
  loadBenchCases,
  loadBenchConfig,
  loadBenchTargets,
  remainingBudget,
  repoRoot,
  selectBenchCases,
  writeJsonAtomic,
  type BenchCase,
  type BenchConfig,
  type BenchPaths,
  type BenchScore,
  type BenchTarget,
} from '@coreslopper/core';
import {
  ComfyUIProvider,
  checkComfyUI,
  comfyUIBaseUrl,
  comfyUIVram,
  createProvider,
  type ProviderKind,
} from '@coreslopper/providers';
import { runBatch, type BatchConfig, type BatchItem, type BatchTarget } from './generate.js';
import { resolveBinary } from './media.js';
import { renderBenchReport, type BenchRatings } from './bench-report.js';

export type BenchStatus = 'ok' | 'error' | 'refused' | 'skipped';

export interface BenchMedia {
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
}

export interface BenchResult {
  /** `<case>/<target>/<seed index>`. */
  key: string;
  case: string;
  target: string;
  seedIndex: number;
  seed: number;
  status: BenchStatus;
  error?: string;
  /** Output files, relative to the run directory. */
  files: string[];
  hash?: string;
  cached?: boolean;
  costUsd?: number;
  /** Wall time of the generation; for a cache hit, the time recorded when it was generated. */
  elapsedSeconds?: number;
  media?: BenchMedia;
  vram?: BenchVram;
  /** Frame strip for clips, relative to the run directory. */
  strip?: string;
  /** Lip-sync clip with its driving vocal muxed in, relative to the run directory. */
  review?: string;
  /** `--repeat`: whether a second uncached render gave byte-identical output. */
  deterministic?: boolean;
  /** `--transcribe`: recognized text and word error rate against `expectText`. */
  transcript?: { text: string; wer: number };
}

/** Device memory sampled while a ComfyUI job ran. */
export interface BenchVram {
  device?: string;
  totalGb: number;
  /** In use when the job started (models still loaded from earlier jobs count). */
  beforeGb: number;
  /** Highest use seen while the job ran. */
  peakGb: number;
}

/** Poll the server's VRAM until stopped; ComfyUI reports no peak itself. */
function sampleVram(url: string, intervalMs = 1_500): { stop(): Promise<BenchVram | undefined> } {
  let before: number | undefined;
  let peak = 0;
  let total = 0;
  let device: string | undefined;
  let running = true;
  const loop = (async () => {
    while (running) {
      const vram = await comfyUIVram(url, fetch, 1_000);
      if (vram) {
        before ??= vram.usedGb;
        peak = Math.max(peak, vram.usedGb);
        total = vram.totalGb;
        device = vram.device;
      }
      if (running) await new Promise((done) => setTimeout(done, intervalMs));
    }
  })();
  return {
    async stop() {
      running = false;
      await loop;
      const last = await comfyUIVram(url, fetch, 1_000);
      if (last) peak = Math.max(peak, last.usedGb);
      if (before === undefined) return undefined;
      return { ...(device ? { device } : {}), totalGb: total, beforeGb: before, peakGb: Number(peak.toFixed(2)) };
    },
  };
}

export interface BenchRunTargetInfo {
  provider: ProviderKind;
  description?: string;
  comfyuiUrl?: string;
  server?: string;
}

export interface BenchRun {
  id: string;
  createdAt: string;
  updatedAt: string;
  set?: string;
  cases: string[];
  targets: Record<string, BenchRunTargetInfo>;
  seeds: number;
  results: BenchResult[];
}

const REFUSAL = /content checker|flagged|moderation|safety (?:filter|system|check)|nsfw|not allowed|policy/i;

export function resultKey(caseId: string, target: string, seedIndex: number): string {
  return `${caseId}/${target}/${seedIndex}`;
}

/** The seed of the n-th repetition of a case; the first is the case seed. */
export function benchSeed(benchCase: BenchCase, seedIndex: number): number {
  return benchCase.seed + seedIndex * 101;
}

function log(message: string): void {
  console.log(message);
}

// ---------------------------------------------------------------------------
// import

export interface BenchImportOptions {
  /** Workspace whose `projects/` holds the source media; default this repository. */
  from?: string;
  cases?: string[];
  force?: boolean;
  paths?: BenchPaths;
}

export interface BenchImportSummary {
  copied: number;
  skipped: number;
  missing: string[];
}

export async function importBenchFixtures(options: BenchImportOptions = {}): Promise<BenchImportSummary> {
  const paths = options.paths ?? benchPaths();
  const workspace = resolve(options.from ?? repoRoot());
  const projects = existsSync(join(workspace, 'projects')) ? join(workspace, 'projects') : workspace;
  const cases = selectBenchCases(await loadBenchCases(paths), { ids: options.cases });
  const summary: BenchImportSummary = { copied: 0, skipped: 0, missing: [] };
  for (const benchCase of cases) {
    for (const [name, fixture] of Object.entries(benchCase.fixtures)) {
      const destination = join(paths.root, fixturePath(benchCase, name));
      if (existsSync(destination) && !options.force) {
        summary.skipped += 1;
        continue;
      }
      const source = join(projects, fixture.from);
      if (!existsSync(source)) {
        summary.missing.push(`${benchCase.id}.${name}: ${source}`);
        continue;
      }
      await ensureDir(dirname(destination));
      if (fixture.cut) {
        execFileSync(
          resolveBinary('ffmpeg'),
          [
            '-y', '-v', 'error',
            '-ss', fixture.cut.start.toFixed(3),
            '-t', fixture.cut.duration.toFixed(3),
            '-i', source,
            '-ar', '48000',
            destination,
          ],
          { stdio: 'inherit' },
        );
      } else {
        await copyFile(source, destination);
      }
      summary.copied += 1;
    }
  }
  log(`Fixtures: ${summary.copied} copied, ${summary.skipped} already present, ${summary.missing.length} missing.`);
  for (const line of summary.missing) log(`  missing ${line}`);
  return summary;
}

// ---------------------------------------------------------------------------
// list

export function missingFixtures(benchCase: BenchCase, paths: BenchPaths): string[] {
  return Object.keys(benchCase.fixtures).filter((name) => !existsSync(join(paths.root, fixturePath(benchCase, name))));
}

export async function listBench(paths = benchPaths()): Promise<void> {
  const [config, targets, cases] = await Promise.all([
    loadBenchConfig(paths),
    loadBenchTargets(paths),
    loadBenchCases(paths),
  ]);
  log(`Bench cases (${cases.length}):`);
  for (const benchCase of cases) {
    const missing = missingFixtures(benchCase, paths);
    const fixtures = missing.length === 0 ? 'fixtures ok' : `missing ${missing.join(', ')}`;
    log(`  ${benchCase.id.padEnd(22)} ${benchCase.operation.padEnd(22)} [${benchCase.sets.join(', ')}] ${fixtures}`);
  }
  log(`Targets (${Object.keys(targets).length}):`);
  for (const [name, target] of Object.entries(targets)) {
    const where = target.comfyui_url ? ` @ ${target.comfyui_url}` : '';
    log(`  ${name.padEnd(22)} ${target.provider}${where}: ${Object.keys(target.operations).join(', ')}`);
  }
  const sets = new Set(cases.flatMap((value) => value.sets));
  log(`Sets: ${[...sets].map((set) => `${set}${config.sets[set] ? ` (${config.sets[set].description})` : ''}`).join(', ')}`);
}

// ---------------------------------------------------------------------------
// run

export interface BenchRunOptions {
  targets: string[];
  set?: string;
  cases?: string[];
  /** Seeds per case (case seed, +101, +202, ...). */
  seeds?: number;
  /** Render the first seed a second time, uncached, and compare the bytes. */
  repeat?: boolean;
  /** Ignore cached generations for this run. */
  fresh?: boolean;
  /** Transcribe speech outputs with faster-whisper and compare with `expectText`. */
  transcribe?: boolean;
  dryRun?: boolean;
  /** Run directory name; an existing run is extended. */
  id?: string;
  paths?: BenchPaths;
}

interface BenchState {
  budget: { totalUsd: number; spentUsd: number; reservedUsd: number };
  updatedAt: string;
}

async function loadBenchState(paths: BenchPaths, config: BenchConfig): Promise<BenchState> {
  let state: BenchState = {
    budget: { totalUsd: config.budget_usd, spentUsd: 0, reservedUsd: 0 },
    updatedAt: new Date().toISOString(),
  };
  if (existsSync(paths.state)) state = JSON.parse(await readFile(paths.state, 'utf8')) as BenchState;
  // bench.yaml owns the budget; spend carries over.
  state.budget.totalUsd = config.budget_usd;
  return state;
}

function providersFor(kind: ProviderKind): BatchConfig['providers'] {
  return { image: kind, video: kind, lipsync: kind, audio: kind } as BatchConfig['providers'];
}

function batchConfig(benchCase: BenchCase, target: BenchTarget, config: BenchConfig): BatchConfig {
  const spec = target.operations[benchCase.operation];
  const override: Record<string, unknown> = {};
  if (spec?.model) override.model = spec.model;
  if (spec?.pricing) override.pricing = spec.pricing;
  return {
    providers: providersFor(target.provider),
    models: Object.keys(override).length > 0 ? { [benchCase.role]: override } : {},
    formats: { master: { aspect: 'bench', ...config.master, fps: 30 }, derivatives: [] },
    batch_cap_usd: config.batch_cap_usd,
  };
}

export function benchItem(benchCase: BenchCase, target: BenchTarget, seedIndex: number): BatchItem {
  const spec = target.operations[benchCase.operation];
  return {
    operation: benchCase.operation,
    role: benchCase.role,
    prompt: benchCase.prompt,
    references: benchCase.inputs.references.map((name) => fixturePath(benchCase, name)),
    ...(benchCase.inputs.audio ? { audio: fixturePath(benchCase, benchCase.inputs.audio) } : {}),
    seed: benchSeed(benchCase, seedIndex),
    ...(benchCase.width ? { width: benchCase.width } : {}),
    ...(benchCase.height ? { height: benchCase.height } : {}),
    ...(benchCase.durationSeconds ? { durationSeconds: benchCase.durationSeconds } : {}),
    params: { ...benchCase.params, ...(spec?.params ?? {}) },
  };
}

function providerFactory(target: BenchTarget): (kind: ProviderKind) => ReturnType<typeof createProvider> {
  return (kind) => {
    if (kind !== 'comfyui') return createProvider(kind);
    const workflowsDir = target.comfyui_workflows_dir
      ? isAbsolute(target.comfyui_workflows_dir)
        ? target.comfyui_workflows_dir
        : join(repoRoot(), target.comfyui_workflows_dir)
      : undefined;
    return new ComfyUIProvider({
      ...(target.comfyui_url ? { baseUrl: target.comfyui_url } : {}),
      ...(workflowsDir ? { workflowsDir } : {}),
    });
  };
}

function batchTarget(
  paths: BenchPaths,
  state: BenchState,
  config: BatchConfig,
  outputDir: string,
  label: string,
): BatchTarget {
  return {
    label,
    config,
    state,
    paths: { root: paths.root, assets: outputDir, manifest: paths.manifest },
    saveState: () => writeJsonAtomic(paths.state, state),
  };
}

function runId(set: string | undefined): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return `${stamp}${set ? `-${set}` : ''}`;
}

export function probeMedia(path: string): BenchMedia {
  try {
    const output = execFileSync(
      resolveBinary('ffprobe'),
      [
        '-v', 'error',
        '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration',
        '-of', 'json',
        path,
      ],
      { encoding: 'utf8' },
    );
    const data = JSON.parse(output) as {
      streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string }[];
      format?: { duration?: string };
    };
    const video = data.streams?.find((stream) => stream.codec_type === 'video');
    const [num, den] = (video?.r_frame_rate ?? '').split('/').map(Number);
    const duration = Number(data.format?.duration);
    const isStill = /\.(png|jpe?g|webp)$/i.test(path);
    return {
      ...(video?.width ? { width: video.width, height: video.height } : {}),
      ...(!isStill && Number.isFinite(duration) && duration > 0 ? { durationSeconds: Number(duration.toFixed(3)) } : {}),
      ...(!isStill && num && den ? { fps: Number((num / den).toFixed(2)) } : {}),
    };
  } catch {
    return {};
  }
}

function isClip(path: string): boolean {
  return /\.(mp4|webm|mov|mkv)$/i.test(path);
}

/** A row of frames at the case's positions, 480 px wide each. */
export function writeFrameStrip(clip: string, positions: number[], destination: string): boolean {
  const duration = probeMedia(clip).durationSeconds;
  if (!duration) return false;
  const ffmpeg = resolveBinary('ffmpeg');
  const inputs: string[] = [];
  for (const position of positions) {
    const time = Math.min(Math.max(0, position * duration), Math.max(0, duration - 0.05));
    inputs.push('-ss', time.toFixed(3), '-i', clip);
  }
  const scaled = positions.map((_, index) => `[${index}:v]scale=480:-2,setsar=1[f${index}]`).join(';');
  const stack =
    positions.length === 1
      ? `${scaled};[f0]copy[out]`
      : `${scaled};${positions.map((_, index) => `[f${index}]`).join('')}hstack=inputs=${positions.length}[out]`;
  execFileSync(
    ffmpeg,
    ['-y', '-v', 'error', ...inputs, '-filter_complex', stack, '-map', '[out]', '-frames:v', '1', '-q:v', '3', destination],
    { stdio: 'inherit' },
  );
  return true;
}

/** The lip-sync clip with its driving audio, so the review hears what the mouth should do. */
function writeReviewMux(clip: string, audio: string, destination: string): void {
  execFileSync(
    resolveBinary('ffmpeg'),
    ['-y', '-v', 'error', '-i', clip, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', destination],
    { stdio: 'inherit' },
  );
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Word error rate of `hypothesis` against `reference` (0 = exact). */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = normalizeWords(reference);
  const hyp = normalizeWords(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  let previous = Array.from({ length: hyp.length + 1 }, (_, index) => index);
  for (let i = 1; i <= ref.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= hyp.length; j += 1) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return Number((previous[hyp.length]! / ref.length).toFixed(3));
}

function transcribe(path: string): string {
  const script = join(repoRoot(), 'scripts', 'audio-analysis', 'transcribe.py');
  const output = execFileSync(
    'uv',
    ['run', '--project', join(repoRoot(), 'scripts', 'audio-analysis'), '--extra', 'asr', 'python', script, path],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return (JSON.parse(output) as { text: string }).text;
}

async function timingFor(paths: BenchPaths, hash: string): Promise<number | undefined> {
  if (!existsSync(paths.timings)) return undefined;
  const lines = (await readFile(paths.timings, 'utf8')).trim().split('\n');
  for (const line of lines.reverse()) {
    try {
      const entry = JSON.parse(line) as { hash: string; elapsedSeconds: number };
      if (entry.hash === hash) return entry.elapsedSeconds;
    } catch {
      // ignore a torn line
    }
  }
  return undefined;
}

export async function loadBenchRun(runDir: string): Promise<BenchRun> {
  const path = join(runDir, 'run.json');
  if (!existsSync(path)) throw new ValidationError(`No bench run at ${runDir} (run.json missing).`);
  return JSON.parse(await readFile(path, 'utf8')) as BenchRun;
}

function upsert(run: BenchRun, result: BenchResult): void {
  const index = run.results.findIndex((entry) => entry.key === result.key);
  if (index >= 0) run.results[index] = result;
  else run.results.push(result);
}

export async function runBench(options: BenchRunOptions): Promise<BenchRun> {
  const paths = options.paths ?? benchPaths();
  const [config, allTargets, allCases] = await Promise.all([
    loadBenchConfig(paths),
    loadBenchTargets(paths),
    loadBenchCases(paths),
  ]);
  if (options.targets.length === 0) throw new ValidationError('Name at least one target with --targets.');
  for (const name of options.targets) {
    if (!allTargets[name]) {
      throw new ValidationError(`Unknown bench target "${name}". Known: ${Object.keys(allTargets).join(', ')}.`);
    }
  }
  const cases = selectBenchCases(allCases, { set: options.set, ids: options.cases });
  if (cases.length === 0) throw new ValidationError('No bench case matches the set and case filter.');
  const seeds = Math.max(1, options.seeds ?? 1);

  const missing = cases.flatMap((benchCase) =>
    missingFixtures(benchCase, paths)
      .filter((name) => name !== benchCase.golden)
      .map((name) => `${benchCase.id}.${name}`),
  );
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing fixtures: ${missing.join(', ')}. Run \`npm run cli -- bench import --from <workspace>\` first.`,
    );
  }

  const state = await loadBenchState(paths, config);
  const id = options.id ?? runId(options.set);
  const runDir = join(paths.runs, id);
  const run: BenchRun = existsSync(join(runDir, 'run.json'))
    ? await loadBenchRun(runDir)
    : {
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(options.set ? { set: options.set } : {}),
        cases: [],
        targets: {},
        seeds,
        results: [],
      };
  run.cases = [...new Set([...run.cases, ...cases.map((value) => value.id)])];
  run.seeds = Math.max(run.seeds, seeds);

  // Plan: every (case, target, seed) that the target covers; estimate first.
  interface Planned {
    benchCase: BenchCase;
    targetName: string;
    target: BenchTarget;
    seedIndex: number;
    config: BatchConfig;
    item: BatchItem;
  }
  const planned: Planned[] = [];
  let estimate = 0;
  for (const targetName of options.targets) {
    const target = allTargets[targetName]!;
    run.targets[targetName] = {
      provider: target.provider,
      ...(target.description ? { description: target.description } : {}),
      ...(target.comfyui_url ? { comfyuiUrl: target.comfyui_url } : {}),
    };
    for (const benchCase of cases) {
      for (let seedIndex = 0; seedIndex < seeds; seedIndex += 1) {
        const key = resultKey(benchCase.id, targetName, seedIndex);
        if (!target.operations[benchCase.operation]) {
          upsert(run, {
            key, case: benchCase.id, target: targetName, seedIndex,
            seed: benchSeed(benchCase, seedIndex), status: 'skipped',
            error: `target does not run ${benchCase.operation}`, files: [],
          });
          continue;
        }
        const plan: Planned = {
          benchCase, targetName, target, seedIndex,
          config: batchConfig(benchCase, target, config),
          item: benchItem(benchCase, target, seedIndex),
        };
        try {
          const [dry] = await runBatch(
            batchTarget(paths, state, plan.config, runDir, `bench ${targetName}`),
            [plan.item],
            { dryRun: true, log: false },
          );
          const repeats = options.repeat && seedIndex === 0 ? 2 : 1;
          estimate += (dry?.resolved.cost ?? 0) * repeats;
          planned.push(plan);
        } catch (error) {
          upsert(run, {
            key, case: benchCase.id, target: targetName, seedIndex,
            seed: benchSeed(benchCase, seedIndex), status: 'error',
            error: error instanceof Error ? error.message : String(error), files: [],
          });
        }
      }
    }
  }

  log(
    `Bench run ${id}: ${cases.length} case(s) x ${options.targets.length} target(s) x ${seeds} seed(s) -> ${planned.length} generation(s), worst case ${formatUsd(estimate)}`,
  );
  log(`Bench budget: ${formatUsd(remainingBudget(state))} remaining of ${formatUsd(state.budget.totalUsd)}`);
  assertAffordable({ batch_cap_usd: config.batch_cap_usd ?? remainingBudget(state) }, state, estimate, 'bench run');
  if (options.dryRun) {
    for (const plan of planned) log(`  ${plan.benchCase.id} on ${plan.targetName} (seed ${plan.item.seed})`);
    return run;
  }

  await ensureDir(runDir);
  for (const targetName of options.targets) {
    const target = allTargets[targetName]!;
    if (target.provider === 'comfyui') {
      const status = await checkComfyUI(comfyUIBaseUrl(target.comfyui_url));
      run.targets[targetName]!.server = status.message;
      if (!status.ok) log(`  ${targetName}: ComfyUI at ${status.url} is not reachable (${status.message}).`);
    }
  }
  await writeJsonAtomic(join(runDir, 'run.json'), run);

  // --fresh bypasses the cache once per invocation, also when a run id is reused.
  const invocation = new Date().toISOString();
  for (const [index, plan] of planned.entries()) {
    const { benchCase, targetName, target, seedIndex } = plan;
    const key = resultKey(benchCase.id, targetName, seedIndex);
    const outputDir = join(runDir, 'out', targetName, benchCase.id, `s${seedIndex}`);
    const cacheKey: Record<string, unknown> = {};
    if (target.comfyui_url) cacheKey.comfyuiUrl = comfyUIBaseUrl(target.comfyui_url);
    if (options.fresh) cacheKey.fresh = invocation;
    const label = `[${index + 1}/${planned.length}] ${benchCase.id} on ${targetName} (seed ${plan.item.seed})`;
    const result: BenchResult = {
      key, case: benchCase.id, target: targetName, seedIndex, seed: benchSeed(benchCase, seedIndex), status: 'ok', files: [],
    };
    await rm(outputDir, { recursive: true, force: true });
    const sampler = target.provider === 'comfyui' ? sampleVram(comfyUIBaseUrl(target.comfyui_url)) : undefined;
    const started = performance.now();
    try {
      const [generated] = await runBatch(
        batchTarget(paths, state, plan.config, outputDir, `bench ${targetName}`),
        [plan.item],
        {
          log: false,
          providerFactory: providerFactory(target),
          ...(Object.keys(cacheKey).length > 0 ? { cacheKey } : {}),
        },
      );
      const generation = generated!.result!;
      const elapsed = Number(((performance.now() - started) / 1000).toFixed(2));
      const vram = await sampler?.stop();
      if (vram && !generation.cached) result.vram = vram;
      result.files = generation.files.map((file) => relative(runDir, file));
      result.hash = generation.hash;
      result.cached = generation.cached;
      result.costUsd = generation.costUsd;
      if (generation.cached) {
        const recorded = await timingFor(paths, generation.hash);
        if (recorded !== undefined) result.elapsedSeconds = recorded;
      } else {
        result.elapsedSeconds = elapsed;
        await appendFile(paths.timings, `${JSON.stringify({ hash: generation.hash, elapsedSeconds: elapsed, target: targetName, case: benchCase.id })}\n`);
      }
      const first = generation.files[0];
      if (first) {
        result.media = probeMedia(first);
        if (isClip(first)) {
          const strip = join(outputDir, 'strip.jpg');
          if (writeFrameStrip(first, benchCase.frames, strip)) result.strip = relative(runDir, strip);
          if (benchCase.operation === 'lipSync' && plan.item.audio) {
            const review = join(outputDir, 'review.mp4');
            writeReviewMux(first, join(paths.root, plan.item.audio), review);
            result.review = relative(runDir, review);
          }
        }
        if (options.transcribe && benchCase.expectText && /\.(wav|mp3|flac|ogg)$/i.test(first)) {
          const text = transcribe(first);
          result.transcript = { text, wer: wordErrorRate(benchCase.expectText, text) };
        }
        if (options.repeat && seedIndex === 0) {
          const [again] = await runBatch(
            batchTarget(paths, state, plan.config, join(outputDir, 'repeat'), `bench ${targetName}`),
            [plan.item],
            { log: false, providerFactory: providerFactory(target), cacheKey: { ...cacheKey, repeat: 1 } },
          );
          const second = again?.result?.files[0];
          if (second) result.deterministic = (await hashFile(first)) === (await hashFile(second));
        }
      }
      const time = result.elapsedSeconds !== undefined ? `${result.elapsedSeconds}s` : 'time unknown';
      log(`${label}: ${generation.cached ? 'cache hit, ' : ''}${time}, ${formatUsd(generation.costUsd)}`);
    } catch (error) {
      await sampler?.stop();
      if (error instanceof BudgetError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      result.status = REFUSAL.test(message) ? 'refused' : 'error';
      result.error = message;
      result.elapsedSeconds = Number(((performance.now() - started) / 1000).toFixed(2));
      log(`${label}: ${result.status} (${message.split('\n')[0]?.slice(0, 160)})`);
      if (error instanceof ConfigError && !REFUSAL.test(message)) {
        log(`  ${targetName}: configuration error; check the target in bench/targets.yaml.`);
      }
    }
    upsert(run, result);
    run.updatedAt = new Date().toISOString();
    await writeJsonAtomic(join(runDir, 'run.json'), run);
  }

  const report = await writeBenchReport(runDir, paths);
  log(`Report: ${report}`);
  return run;
}

// ---------------------------------------------------------------------------
// report

export function resolveRunDir(arg: string | undefined, paths = benchPaths()): string {
  if (arg && (arg.includes('/') || existsSync(arg))) return resolve(arg);
  if (arg && arg !== 'latest') return join(paths.runs, arg);
  const runs = existsSync(paths.runs)
    ? execFileSync('ls', ['-1t', paths.runs], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    : [];
  const latest = runs.find((name) => existsSync(join(paths.runs, name, 'run.json')));
  if (!latest) throw new ValidationError(`No bench runs in ${paths.runs}.`);
  return join(paths.runs, latest);
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/**
 * Rubric scores of a run: `scores/<case>.json` (one file per reviewed case, so
 * parallel reviewers never write the same file) merged over `scores.json`.
 */
export async function loadBenchScores(runDir: string): Promise<Record<string, BenchScore>> {
  const files = [join(runDir, 'scores.json')];
  const dir = join(runDir, 'scores');
  if (existsSync(dir)) {
    files.push(...(await readdir(dir)).filter((name) => name.endsWith('.json')).sort().map((name) => join(dir, name)));
  }
  const scores: Record<string, BenchScore> = {};
  for (const file of files) {
    const raw = await readJsonIfExists<unknown>(file);
    if (raw === undefined) continue;
    const parsed = BenchScoresFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        `${file}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
      );
    }
    Object.assign(scores, parsed.data);
  }
  return scores;
}

export async function writeBenchReport(runDir: string, paths = benchPaths()): Promise<string> {
  const run = await loadBenchRun(runDir);
  const allCases = await loadBenchCases(paths);
  const cases = allCases.filter((value) => run.cases.includes(value.id));
  const scores = await loadBenchScores(runDir);
  const ratings = (await readJsonIfExists<BenchRatings>(join(runDir, 'ratings.json'))) ?? {};
  const fixtureBase = relative(runDir, paths.root);
  const html = renderBenchReport({ run, cases, scores, ratings, fixtureBase, fixtureExists: (path) => existsSync(join(paths.root, path)) });
  const destination = join(runDir, 'index.html');
  await writeFileAtomic(destination, html);
  return destination;
}

async function writeFileAtomic(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, path);
}

