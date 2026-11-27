import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { loadProject, writeTextAtomic } from '@coreslopper/core';

// The recipe of a thumbnail: the still, focus, and options it was composed
// from, written beside the JPEG as `<name>.recipe.json`. `release` composes
// the announcement and story images from the cover's recipe, so they
// follow the release date without the agent choosing a still again.

export const ThumbnailRecipeSchema = z.object({
  version: z.literal(1),
  /** The still, relative to the project when it lies inside it. */
  still: z.string().min(1),
  format: z.string().min(1),
  text: z.string().min(1),
  focus: z.string().optional(),
  zoom: z.number().optional(),
  accent: z.string().optional(),
  font: z.string().optional(),
  tag: z.string().optional(),
  layout: z.string().optional(),
  /** Scrim strength 0–1, when not the default 1. */
  scrim: z.number().optional(),
  /** Hook shift in pixels, when not 0; it belongs to this image's layout only. */
  textOffset: z.number().optional(),
});
export type ThumbnailRecipe = z.infer<typeof ThumbnailRecipeSchema>;

/** `renders/cover-3000x3000.jpg` → `renders/cover-3000x3000.recipe.json`. */
export const recipePath = (image: string) => image.replace(/\.jpe?g$/i, '') + '.recipe.json';

/** Write the recipe of a rendered thumbnail; the still is stored relative to the project when it lies inside. */
export async function writeRecipe(
  output: string,
  options: { projectDir: string; still: string; text: string; format?: string; focus?: string; zoom?: number; accent?: string; font?: string; tag?: string; layout?: string; scrim?: number; textOffset?: number },
): Promise<void> {
  const project = await loadProject(options.projectDir);
  const candidates = [resolve(process.cwd(), options.still), resolve(project.paths.root, options.still)];
  const still = candidates.find((path) => existsSync(path)) ?? options.still;
  const inside = relative(project.paths.root, still);
  const recipe: ThumbnailRecipe = {
    version: 1,
    still: isAbsolute(still) && !inside.startsWith('..') ? inside.split(sep).join('/') : still,
    format: options.format ?? '16x9',
    text: options.text,
    ...(options.focus ? { focus: options.focus } : {}),
    ...(options.zoom && options.zoom !== 1 ? { zoom: options.zoom } : {}),
    ...(options.accent ? { accent: options.accent } : {}),
    ...(options.font ? { font: options.font } : {}),
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.layout ? { layout: options.layout } : {}),
    ...(options.scrim !== undefined && options.scrim !== 1 ? { scrim: options.scrim } : {}),
    ...(options.textOffset ? { textOffset: options.textOffset } : {}),
  };
  await writeTextAtomic(recipePath(output), `${JSON.stringify(recipe, null, 2)}\n`);
}

/** The recipe beside a thumbnail, or undefined when there is none or it is unreadable. */
export async function readRecipe(image: string): Promise<ThumbnailRecipe | undefined> {
  const path = recipePath(image);
  if (!existsSync(path)) return undefined;
  try {
    return ThumbnailRecipeSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return undefined;
  }
}
