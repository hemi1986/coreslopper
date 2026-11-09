import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
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
import { resolveBinary } from './media.js';
import { validateProject } from './validate.js';

export interface RenderOptions {
  projectDir: string;
  format?: FormatId;
  preview?: boolean;
  stillFrame?: number;
  stillScale?: number;
  out?: string;
  requireAudio?: boolean;
  /** Inclusive frame range, for test renders. */
  frames?: [number, number];
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

/**
 * Memory limits. Remotion's defaults size the <OffthreadVideo> frame cache and
 * the in-browser media cache at half of the free system memory each, which
 * fills a 48 GB WSL VM. All values can be overridden through the environment.
 */
const MB = 1024 * 1024;
function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
const renderLimits = () => ({
  // Every Chrome tab holds its own decoded frames, so memory scales with it: clamp to 2–4.
  concurrency: Math.min(4, Math.max(2, envInt('CORESLOPPER_RENDER_CONCURRENCY', 4))),
  offthreadVideoCacheSizeInBytes: envInt('CORESLOPPER_VIDEO_CACHE_MB', 2048) * MB,
  mediaCacheSizeInBytes: envInt('CORESLOPPER_MEDIA_CACHE_MB', 512) * MB,
  offthreadVideoThreads: 2,
  segmentSeconds: envInt('CORESLOPPER_SEGMENT_SECONDS', 60),
});

const STAGED_FILE = /\.(png|jpe?g|webp|avif|gif|svg|mp4|webm|mov|mkv|wav|mp3|m4a|aac|ogg|flac|ttf|otf|woff2?)$/i;

/**
 * Build a minimal public directory that exposes only the folders of the files
 * this render references, as symlinks. Remotion copies its public directory into every
 * bundle; using the repository root copied node_modules, .git, .cache and all
 * projects (several GB) on each render.
 */
async function stagePublicDir(props: VideoProps, root: string, dir: string): Promise<number> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const files = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (STAGED_FILE.test(value) && !isAbsolute(value) && !value.startsWith('..') && existsSync(join(root, value))) {
        files.add(value);
      }
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(props);
  // Remotion's file server refuses symlinked files but follows symlinked
  // directories, so link the folders that hold the referenced files (the
  // outermost one wins when folders are nested).
  const folders = [...new Set([...files].map((file) => dirname(file)))].sort((a, b) => a.length - b.length);
  const linked: string[] = [];
  for (const folder of folders) {
    if (linked.some((parent) => folder === parent || folder.startsWith(`${parent}/`))) continue;
    linked.push(folder);
    const link = join(dir, folder);
    await mkdir(dirname(link), { recursive: true });
    await symlink(await realpath(join(root, folder)), link, 'dir');
  }
  return files.size;
}

async function bundleFor(props: VideoProps, root: string, workDir: string): Promise<string> {
  const publicDir = join(workDir, 'public');
  const staged = await stagePublicDir(props, root, publicDir);
  console.log(`Bundling Remotion composition for ${props.project.slug} (${staged} public files)...`);
  return bundle({
    entryPoint: join(root, 'packages/remotion/src/index.ts'),
    publicDir,
    symlinkPublicDir: true,
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(resolveBinary('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`ffmpeg exited with code ${code}`)),
    );
  });
}

export async function renderProject(options: RenderOptions): Promise<string> {
  const { props, paths } = await buildVideoProps(options);
  const root = repoRoot();
  const format = options.format ?? '16x9';
  const preview = options.preview ?? false;
  const limits = renderLimits();
  const outputLocation = options.out ? resolve(process.cwd(), options.out) : outputPath(paths, format, preview);
  await ensureDir(paths.renders);

  // Work files stay on the Linux filesystem (fast, never on a /mnt drive);
  // only the finished file is written to `renders/`.
  const workDir = join(
    root,
    '.cache',
    'render',
    `${props.project.slug}-${options.stillFrame !== undefined ? 'still' : `${format}${preview ? '-preview' : ''}`}`,
  );
  await mkdir(workDir, { recursive: true });
  const serveUrl = await bundleFor(props, root, workDir);
  try {
    const composition = await selectComposition({ serveUrl, id: 'MusicVideo', inputProps: props });

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
        offthreadVideoCacheSizeInBytes: limits.offthreadVideoCacheSizeInBytes,
        mediaCacheSizeInBytes: limits.mediaCacheSizeInBytes,
      });
      console.log(`Still written to ${output}`);
      return output;
    }

    const uses3d = props.shots.some(
      (shot) =>
        shot.motion?.component === 'NeonTorus' ||
        shot.layers?.some((layer) => layer.component === 'NeonTorus'),
    );
    const [first, last] = options.frames ?? [0, props.durationInFrames - 1];
    const segmentFrames = limits.segmentSeconds * props.fps;
    const segments: Array<[number, number]> = [];
    for (let start = first; start <= last; start += segmentFrames) {
      segments.push([start, Math.min(last, start + segmentFrames - 1)]);
    }
    const concurrency = uses3d ? 1 : limits.concurrency;
    console.log(
      `Rendering ${props.format} ${props.width}x${props.height} @ ${props.fps}fps, frames ${first}-${last} ` +
        `in ${segments.length} segment(s) of ≤${limits.segmentSeconds}s, concurrency ${concurrency}` +
        `${uses3d ? ' (3D: software GL)' : ''}...`,
    );

    // Segments are cached by a hash of everything that affects their pixels,
    // so an interrupted render resumes with the next missing segment.
    const settingsHash = createHash('sha256')
      .update(JSON.stringify({ props, preview, crf: preview ? 22 : 18 }))
      .digest('hex')
      .slice(0, 12);
    const segmentFiles: string[] = [];
    for (const [index, [start, end]] of segments.entries()) {
      const file = join(workDir, `seg-${settingsHash}-${start}-${end}.mp4`);
      segmentFiles.push(file);
      if (existsSync(`${file}.done`)) {
        console.log(`  segment ${index + 1}/${segments.length} (frames ${start}-${end}) cached`);
        continue;
      }
      console.log(`  segment ${index + 1}/${segments.length} (frames ${start}-${end})`);
      let lastReported = -1;
      // A fresh browser and compositor per segment: caches and leaks never
      // outlive one segment. Video only; the song is muxed once at the end.
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation: file,
        inputProps: props,
        frameRange: [start, end],
        muted: true,
        crf: preview ? 22 : 18,
        pixelFormat: 'yuv420p',
        scale: preview ? 0.5 : 1,
        overwrite: true,
        concurrency,
        offthreadVideoCacheSizeInBytes: limits.offthreadVideoCacheSizeInBytes,
        mediaCacheSizeInBytes: limits.mediaCacheSizeInBytes,
        offthreadVideoThreads: limits.offthreadVideoThreads,
        chromiumOptions: { gl: uses3d ? 'swangle' : 'angle' },
        onProgress: ({ progress }) => {
          const percent = Math.round(progress * 100);
          if (percent >= lastReported + 25) {
            lastReported = percent;
            console.log(`    ${percent}%`);
          }
        },
      });
      await writeFile(`${file}.done`, '');
    }

    // Join with the concat demuxer (stream copy, no re-encode) and add the
    // song in the same pass.
    console.log(`Joining ${segmentFiles.length} segment(s) and muxing audio...`);
    const listFile = join(workDir, 'segments.txt');
    await writeFile(listFile, segmentFiles.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n') + '\n');
    await ensureDir(dirname(outputLocation));
    const duration = (last - first + 1) / props.fps;
    const songPath = props.audioSrc ? join(root, props.audioSrc) : undefined;
    const audioArgs = songPath
      ? ['-ss', (first / props.fps).toFixed(6), '-t', duration.toFixed(6), '-i', songPath]
      : [];
    const tempOutput = join(workDir, 'joined.mp4');
    await runFfmpeg([
      '-threads', '6',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      ...audioArgs,
      '-map', '0:v:0',
      ...(songPath ? ['-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : []),
      '-c:v', 'copy',
      '-t', duration.toFixed(6),
      '-movflags', '+faststart',
      tempOutput,
    ]);
    // Write locally first, then copy (streamed) to the possibly external renders/ folder.
    await rm(outputLocation, { force: true });
    await copyFile(tempOutput, outputLocation);
    await rm(workDir, { recursive: true, force: true });
    console.log(`Render written to ${outputLocation}`);
    return outputLocation;
  } finally {
    await rm(serveUrl, { recursive: true, force: true }).catch(() => undefined);
    await rm(join(workDir, 'public'), { recursive: true, force: true }).catch(() => undefined);
  }
}
