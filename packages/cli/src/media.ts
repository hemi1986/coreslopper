import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { ensureDir, loadProject, repoRoot, ValidationError } from '@coreslopper/core';

function resolveBinary(name: 'ffmpeg' | 'ffprobe'): string {
  const local = join(repoRoot(), '.tools', 'ffmpeg', name);
  if (existsSync(local)) return local;
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return name;
  } catch {
    throw new ValidationError(
      `${name} is not on PATH and ${local} is missing. Run ./scripts/install-ffmpeg.sh on Linux x64, or install ffmpeg with your package manager.`,
    );
  }
}

export async function normalizeAudio(projectDir: string, input: string, output?: string): Promise<string> {
  const ffmpeg = resolveBinary('ffmpeg');
  const project = await loadProject(projectDir);
  const source = resolve(input);
  if (!existsSync(source)) throw new ValidationError(`Missing audio input: ${source}`);
  const destination = output ? resolve(output) : resolve(project.paths.root, 'audio', 'song.wav');
  await ensureDir(dirname(destination));
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-i',
      source,
      '-af',
      'loudnorm=I=-14:TP=-1:LRA=11',
      '-ar',
      '48000',
      '-ac',
      '2',
      destination,
    ],
    { stdio: 'inherit' },
  );
  console.log(`Normalized audio written to ${destination}`);
  return destination;
}

export async function importFootage(
  projectDir: string,
  input: string,
  name: string,
  width = 1920,
  height = 1080,
  fps = 30,
): Promise<string> {
  const ffmpeg = resolveBinary('ffmpeg');
  const project = await loadProject(projectDir);
  const source = resolve(input);
  if (!existsSync(source)) throw new ValidationError(`Missing footage input: ${source}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new ValidationError('Footage name must be lowercase letters, digits, and dashes.');
  }
  const destination = resolve(project.paths.assets, 'footage', `${name}.mp4`);
  await ensureDir(dirname(destination));
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-i',
      source,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`,
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      destination,
    ],
    { stdio: 'inherit' },
  );
  console.log(`Footage proxy written to ${destination}`);
  return destination;
}

export async function extractFrame(
  projectDir: string,
  input: string,
  position: 'first' | 'middle' | 'last',
  output?: string,
): Promise<string> {
  const ffmpeg = resolveBinary('ffmpeg');
  const ffprobe = resolveBinary('ffprobe');
  const project = await loadProject(projectDir);
  const source = resolve(input);
  if (!existsSync(source)) throw new ValidationError(`Missing clip: ${source}`);
  const duration = Number(
    execFileSync(
      ffprobe,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', source],
      { encoding: 'utf8' },
    ).trim(),
  );
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new ValidationError(`Could not read the duration of ${source}.`);
  }
  const timestamp = position === 'first' ? 0.05 : position === 'middle' ? duration / 2 : Math.max(0, duration - 0.05);
  const destination = output
    ? resolve(output)
    : resolve(project.paths.assets, 'frames', `${basename(source, extname(source))}-${position}.png`);
  await ensureDir(dirname(destination));
  execFileSync(
    ffmpeg,
    ['-y', '-ss', timestamp.toFixed(3), '-i', source, '-frames:v', '1', destination],
    { stdio: 'inherit' },
  );
  console.log(`Frame written to ${destination}`);
  return destination;
}
