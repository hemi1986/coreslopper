import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import {
  ValidationError,
  ensureDir,
  projectPaths,
  repoRoot,
  type ResolvedShot,
  type ResolvedStoryboard,
} from '@coreslopper/core';
import type { FormatId, VideoProps } from '../../remotion/src/types.js';
import { validateProject } from './validate.js';

export interface RenderOptions {
  projectDir: string;
  format?: FormatId;
  preview?: boolean;
  stillFrame?: number;
  stillScale?: number;
  out?: string;
  requireAudio?: boolean;
}

function aspectFor(id: FormatId): string {
  if (id === '9x16') return '9:16';
  if (id === '1x1') return '1:1';
  if (id === '4x5') return '4:5';
  return '16:9';
}

function formatConfig(project: Awaited<ReturnType<typeof validateProject>>['project'], id: FormatId) {
  const master = project.config.formats.master;
  if (id === '16x9') {
    return { width: master.width, height: master.height, fps: master.fps };
  }
  const aspect = aspectFor(id);
  const derivative = project.config.formats.derivatives.find((item) => item.aspect === aspect);
  if (!derivative) {
    throw new ValidationError(`Format ${id} (${aspect}) is not configured for this project.`);
  }
  return { width: derivative.width, height: derivative.height, fps: master.fps };
}

function publicAsset(path: string | undefined, projectRoot: string, root: string): string | undefined {
  if (!path) return undefined;
  const absolute = isAbsolute(path) ? path : resolve(projectRoot, path);
  const relativePath = relative(root, absolute);
  if (relativePath.startsWith('..')) {
    throw new ValidationError(`Asset ${path} is outside the repository; Remotion cannot serve it.`);
  }
  return relativePath.split(sep).join('/');
}

function withPublicAssets(
  shots: ResolvedShot[],
  projectRoot: string,
  root: string,
): ResolvedShot[] {
  return shots.map((shot) => ({
    ...shot,
    asset: publicAsset(shot.asset, projectRoot, root),
    layers: shot.layers?.map((layer) => ({
      ...layer,
      asset: publicAsset(layer.asset, projectRoot, root),
    })),
  }));
}

export async function buildVideoProps(
  options: RenderOptions,
): Promise<{ props: VideoProps; resolved: ResolvedStoryboard; paths: ReturnType<typeof projectPaths> }> {
  const { project, resolved } = await validateProject(options.projectDir);
  const root = repoRoot();
  const formatId = options.format ?? '16x9';
  const format = formatConfig(project, formatId);
  const paths = projectPaths(options.projectDir);

  const songPath = join(paths.root, 'audio', 'song.wav');
  const hasAudio = existsSync(songPath);
  if (options.requireAudio && !hasAudio) {
    throw new ValidationError(`Missing ${songPath}. Generate or import the song before rendering.`);
  }
  const audioSrc = hasAudio ? publicAsset(songPath, paths.root, root) : undefined;

  const props: VideoProps = {
    project: { slug: project.config.slug, title: project.config.title },
    format: formatId,
    width: format.width,
    height: format.height,
    fps: format.fps,
    durationInFrames: resolved.durationInFrames,
    audioSrc,
    style: project.style!,
    characters: project.characters!,
    timing: project.effectiveTiming!,
    shots: withPublicAssets(resolved.shots, paths.root, root),
  };
  return { props, resolved, paths };
}

function outputPath(paths: ReturnType<typeof projectPaths>, format: FormatId, preview: boolean): string {
  return join(paths.renders, `${preview ? 'preview-' : ''}${format}.mp4`);
}

export async function renderProject(options: RenderOptions): Promise<string> {
  const { props, paths } = await buildVideoProps(options);
  const root = repoRoot();
  const entryPoint = join(root, 'packages/remotion/src/index.ts');
  const outputLocation = options.out
    ? resolve(process.cwd(), options.out)
    : outputPath(paths, options.format ?? '16x9', options.preview ?? false);
  await ensureDir(paths.renders);

  console.log(`Bundling Remotion composition for ${props.project.slug}...`);
  const serveUrl = await bundle({
    entryPoint,
    publicDir: root,
  });
  const composition = await selectComposition({
    serveUrl,
    id: 'MusicVideo',
    inputProps: props,
  });

  if (options.stillFrame !== undefined) {
    const output = join(paths.renders, `still-${options.stillFrame}.png`);
    await renderStill({
      composition,
      serveUrl,
      output,
      frame: options.stillFrame,
      inputProps: props,
      imageFormat: 'png',
      scale: options.stillScale ?? 1,
      overwrite: true,
    });
    console.log(`Still written to ${output}`);
    return output;
  }

  await ensureDir(dirname(outputLocation));
  const uses3d = props.shots.some(
    (shot) =>
      shot.motion?.component === 'NeonTorus' ||
      shot.layers?.some((layer) => layer.component === 'NeonTorus'),
  );
  console.log(
    `Rendering ${props.format} ${props.width}x${props.height} @ ${props.fps}fps, ${props.durationInFrames} frames${uses3d ? ' (3D: software GL, concurrency 1)' : ''}...`,
  );
  let lastReported = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    inputProps: props,
    crf: options.preview ? 22 : 18,
    audioCodec: 'aac',
    audioBitrate: '192k',
    pixelFormat: 'yuv420p',
    scale: options.preview ? 0.5 : 1,
    overwrite: true,
    concurrency: uses3d ? 1 : 4,
    chromiumOptions: { gl: uses3d ? 'swangle' : 'angle' },
    onProgress: ({ progress, renderedFrames, encodedFrames }) => {
      const percent = Math.round(progress * 100);
      if (percent >= lastReported + 10) {
        lastReported = percent;
        console.log(`  ${percent}% (${renderedFrames} rendered, ${encodedFrames} encoded)`);
      }
    },
  });
  console.log(`Render written to ${outputLocation}`);
  return outputLocation;
}
