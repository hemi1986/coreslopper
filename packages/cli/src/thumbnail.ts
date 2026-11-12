import { existsSync } from 'node:fs';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { renderStill, selectComposition } from '@remotion/renderer';
import {
  ValidationError,
  ensureDir,
  hashFile,
  loadProject,
  repoRoot,
  resolvePalette,
  resolveRole,
  type StyleBible,
} from '@coreslopper/core';
import {
  THUMBNAIL_LAYOUTS,
  THUMBNAIL_MAX_BYTES,
  parseFocus,
  parseThumbnailText,
  readableOn,
  type ThumbnailLayout,
} from '../../remotion/src/lib/thumbnail.js';
import type { ThumbnailProps } from '../../remotion/src/types.js';
import { brandFonts, bundleFor } from './render.js';
import { thumbnailProblems } from './thumbnail-files.js';

export interface ThumbnailOptions {
  projectDir: string;
  still: string;
  text: string;
  out: string;
  tag?: string;
  layout?: string;
  accent?: string;
  focus?: string;
  zoom?: number;
  /** Typography key of style.yaml for the hook (default `display`). */
  font?: string;
}

const STILL_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
/** JPEG qualities tried in order until the file is under YouTube's 2 MB limit. */
const JPEG_QUALITIES = [90, 85, 80, 72, 64];

/** Resolve a palette key, role, or #rrggbb colour of the style bible; unknown tokens are an error. */
export function paletteColor(style: Pick<StyleBible, 'palette' | 'roles'>, token: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(token)) return token;
  const palette = resolvePalette(style);
  const color = palette[token] ?? palette[token.replace(/-/g, '_')];
  if (!color) {
    throw new ValidationError(`"${token}" is not a palette key or role of style.yaml. Known: ${Object.keys(palette).join(', ')}.`);
  }
  return color;
}

/** The thumbnail colours: first slab on the primary role, the rest on the accent, text picked for contrast. */
export function thumbnailColors(style: Pick<StyleBible, 'palette' | 'roles'>, accentToken = 'accent'): ThumbnailProps['colors'] {
  const background = resolveRole(style, 'background');
  const primary = resolveRole(style, 'primary');
  const text = resolveRole(style, 'text');
  const accent = paletteColor(style, accentToken);
  return {
    background,
    slab: primary,
    slabText: readableOn(primary, [text, background]),
    accent,
    accentText: readableOn(accent, [primary, background, text]),
  };
}

function typographyFont(style: StyleBible, key: string, fallbackWeight: number): { family: string; weight: number } | undefined {
  const entry = style.typography[key];
  return entry ? { family: entry.family, weight: entry.weight ?? fallbackWeight } : undefined;
}

/**
 * Validate the options and build the composition props, without rendering.
 * The still is copied into `.cache/thumbnail/` under the repository so the
 * renderer can serve it wherever it lives (e.g. a media drive).
 */
export async function buildThumbnailProps(
  options: ThumbnailOptions,
  root = repoRoot(),
): Promise<{ props: ThumbnailProps; slug: string }> {
  const project = await loadProject(options.projectDir);
  const style = project.style;
  if (!style) throw new ValidationError('The project has no style.yaml; run the style-character stage first.');

  const layout = (options.layout ?? 'left') as ThumbnailLayout;
  if (!THUMBNAIL_LAYOUTS.includes(layout)) {
    throw new ValidationError(`Unknown layout "${options.layout}". Use ${THUMBNAIL_LAYOUTS.join(', ')}.`);
  }
  let lines: string[];
  let focus: { x: number; y: number };
  try {
    lines = parseThumbnailText(options.text);
    focus = parseFocus(options.focus);
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
  const zoom = options.zoom ?? 1;
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 4) throw new ValidationError(`Invalid zoom ${options.zoom}; use 1–4.`);
  const tag = options.tag?.trim().toUpperCase() || undefined;

  // A still path is taken from the working directory first, then from the project.
  const candidates = [resolve(process.cwd(), options.still), resolve(project.paths.root, options.still)];
  const stillPath = candidates.find((path) => existsSync(path));
  if (!stillPath) throw new ValidationError(`Still not found: ${options.still}`);
  const extension = extname(stillPath).toLowerCase();
  if (!STILL_TYPES.has(extension)) {
    throw new ValidationError(`Unsupported still type ${extension}. Use ${[...STILL_TYPES].join(', ')}.`);
  }
  const stagedDir = join(root, '.cache', 'thumbnail', project.config.slug);
  await mkdir(stagedDir, { recursive: true });
  const staged = join(stagedDir, `${(await hashFile(stillPath)).slice(0, 16)}${extension}`);
  if (!existsSync(staged)) await copyFile(stillPath, staged);

  const fontKey = options.font ?? 'display';
  const hookFont = typographyFont(style, fontKey, 700);
  if (!hookFont) {
    throw new ValidationError(`style.yaml has no typography "${fontKey}". Known: ${Object.keys(style.typography).join(', ')}.`);
  }
  const tagFont = typographyFont(style, 'mono', 700) ?? { family: 'JetBrains Mono', weight: 700 };

  const props: ThumbnailProps = {
    still: relative(root, staged).split('\\').join('/'),
    lines,
    ...(tag ? { tag } : {}),
    layout,
    focus,
    zoom,
    hookFont: { family: hookFont.family, weight: Math.max(700, hookFont.weight) },
    tagFont: { family: tagFont.family, weight: Math.max(600, tagFont.weight) },
    colors: thumbnailColors(style, options.accent),
    fonts: await brandFonts(project.paths.root, project.config.brand, root),
  };
  return { props, slug: project.config.slug };
}

/** Render one 1280x720 JPEG thumbnail; returns its path. */
export async function renderThumbnail(options: ThumbnailOptions): Promise<string> {
  const root = repoRoot();
  const { props, slug } = await buildThumbnailProps(options, root);
  const output = resolve(process.cwd(), options.out);
  if (!/\.jpe?g$/i.test(output)) throw new ValidationError(`--out must be a .jpg file: ${options.out}`);

  const workDir = join(root, '.cache', 'render', `${slug}-thumbnail`);
  await mkdir(workDir, { recursive: true });
  const serveUrl = await bundleFor({ ...props, project: { slug } }, root, workDir);
  try {
    const composition = await selectComposition({ serveUrl, id: 'Thumbnail', inputProps: props });
    await ensureDir(join(output, '..'));
    for (const quality of JPEG_QUALITIES) {
      await renderStill({
        composition,
        serveUrl,
        output,
        frame: 0,
        inputProps: props,
        imageFormat: 'jpeg',
        jpegQuality: quality,
        overwrite: true,
      });
      if ((await stat(output)).size < THUMBNAIL_MAX_BYTES) break;
    }
    const problems = await thumbnailProblems(output);
    if (problems.length) throw new ValidationError(`Thumbnail ${output} failed its checks`, problems);
    console.log(`Thumbnail written to ${output}`);
    return output;
  } finally {
    await rm(serveUrl, { recursive: true, force: true }).catch(() => undefined);
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
