import { existsSync } from 'node:fs';
import { appendFile, copyFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { ValidationError, ensureDir, loadProject, loadSeries, providerForRole, type ProviderKind } from '@coreslopper/core';
import { imageSize } from './clip-options.js';
import { BatchSchema, projectTarget, runBatch, seriesTarget, type BatchTarget } from './generate.js';
import { cropImage, editSize, parseBox, pasteBack, snapBoxAspect, type Box } from './image-ops.js';
import { committedEpisodeBudgets } from './series.js';
import { latestVerdicts } from './verdicts.js';

export interface PatchOptions {
  /** The image to repair. */
  image: string;
  /** `x,y,w,h` of the region to edit: fractions of the image (0-1) or pixels. */
  box: string;
  /** Edit prompt for the crop; the crop is `image 1`, extra references follow as image 2, 3, … */
  prompt: string;
  /** Extra reference images for the edit (state, prop), relative to the working directory. */
  references?: string[];
  /** Shot or reference the image belongs to; names the attempt in `verdicts.jsonl`. */
  subject?: string;
  /** Attempt number of the patched image; default: one after the last reviewed attempt of the subject, else 2. */
  attempt?: number;
  /** Where the patched image goes; default `<image dir>/attempts/<name>-a<attempt>.png`. */
  out?: string;
  /** Also put the patched image in place of `image`; the old one is kept as the previous attempt. */
  replace?: boolean;
  /** Width of the soft edge in pixels of the original; default 24. */
  feather?: number;
  /** Long side the crop is scaled to for the edit; default 1024. */
  size?: number;
  seed?: number;
  role?: string;
  /** Local workflow for the edit, e.g. `qwen-edit-quality`. */
  workflow?: string;
  provider?: ProviderKind;
  /** Run against a series canon instead of a project. */
  seriesDir?: string;
  /** Replaces the edit generation; used by tests. Returns the edited crop. */
  edit?: (crop: string, prompt: string) => Promise<string>;
}

export interface PatchResult {
  image: string;
  out: string;
  attempt: number;
  box: Box;
  crop: string;
  edit: string;
  replaced: boolean;
}

/**
 * Edit one region of an image and paste it back: crop the box, scale it up, run
 * it as an `image.edit` generation (cache, manifest, budget), scale the result
 * back, and blend it into the original with a soft edge. Everything outside the
 * box stays pixel-identical. The result is filed as the next attempt.
 */
export async function patchImage(projectDir: string, options: PatchOptions): Promise<PatchResult> {
  let target: BatchTarget;
  if (options.seriesDir) {
    const loaded = await loadSeries(options.seriesDir);
    target = seriesTarget(loaded, await committedEpisodeBudgets(options.seriesDir, loaded.series.slug));
  } else {
    target = projectTarget(await loadProject(projectDir));
  }
  const root = target.paths.root;
  const image = resolve(options.image);
  if (!existsSync(image)) throw new ValidationError(`Missing image: ${image}`);
  if (!options.prompt.trim()) throw new ValidationError('Pass --prompt: what the edit changes inside the box.');
  const references = (options.references ?? []).map((reference) => resolve(reference));
  for (const reference of references) if (!existsSync(reference)) throw new ValidationError(`Missing reference image: ${reference}`);

  const size = imageSize(image);
  // Snap to a standard aspect: cloud edit models return one of these, and a
  // result of another shape would be cropped on paste-back.
  const { box, ratio } = snapBoxAspect(parseBox(options.box, size), size);
  const extension = extname(image) || '.png';
  const stem = basename(image, extension);
  const verdicts = join(target.paths.assets, 'review', 'verdicts.jsonl');
  const reviewed = options.subject ? latestVerdicts(verdicts).get(options.subject)?.attempt : undefined;
  const attempt = options.attempt ?? (reviewed ?? 1) + 1;
  const attemptsDir = join(dirname(image), 'attempts');
  const out = options.out ? resolve(options.out) : join(attemptsDir, `${stem}-a${attempt}${extension}`);

  const workDir = join(target.paths.assets, 'patches');
  const crop = await cropImage(image, box, join(workDir, `${stem}-a${attempt}-crop.png`), editSize(box, options.size ?? 1024));
  let edit: string;
  if (options.edit) {
    edit = await options.edit(crop, options.prompt);
  } else {
    const role = options.role ?? 'image.edit';
    const provider = options.provider ?? providerForRole(target.config, role);
    const local = provider === 'comfyui' || provider === 'mock';
    const batch = BatchSchema.parse([
      {
        operation: 'editImage',
        role,
        id: `patch:${stem}-a${attempt}`,
        prompt: options.prompt,
        references: [crop, ...references].map((path) => relative(root, path)),
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        // Local workflows take the size from the crop; cloud models need the ratio.
        ...(local ? (options.workflow ? { params: { workflow: options.workflow } } : {}) : { params: { aspect_ratio: ratio } }),
      },
    ]);
    const [done] = await runBatch(target, batch, { provider: options.provider });
    const file = done?.result?.files[0];
    if (!file) throw new ValidationError('The edit returned no image.');
    edit = file;
  }
  await pasteBack(image, edit, box, out, options.feather ?? 24);

  let replaced = false;
  if (options.replace) {
    const previous = join(attemptsDir, `${stem}-a${attempt - 1}${extension}`);
    if (!existsSync(previous)) {
      await ensureDir(attemptsDir);
      await copyFile(image, previous);
    }
    await copyFile(out, image);
    replaced = true;
  }

  const rel = (path: string) => relative(root, path);
  const result: PatchResult = { image: rel(image), out: rel(out), attempt, box, crop: rel(crop), edit: rel(edit), replaced };
  const log = join(target.paths.assets, 'review', 'patches.jsonl');
  await ensureDir(dirname(log));
  await appendFile(
    log,
    `${JSON.stringify({ ...result, subject: options.subject, prompt: options.prompt, references: references.map(rel), at: new Date().toISOString() })}\n`,
  );
  return result;
}
