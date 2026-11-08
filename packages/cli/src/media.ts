import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ensureDir, loadProject, ValidationError } from '@coreslopper/core';

function requireFfmpeg(): void {
  try {
    execFileSync('which', ['ffmpeg'], { stdio: 'ignore' });
  } catch {
    throw new ValidationError('ffmpeg is not on PATH. Install it before importing footage or normalizing audio.');
  }
}

export async function normalizeAudio(projectDir: string, input: string, output?: string): Promise<string> {
  requireFfmpeg();
  const project = await loadProject(projectDir);
  const source = resolve(input);
  if (!existsSync(source)) throw new ValidationError(`Missing audio input: ${source}`);
  const destination = output ? resolve(output) : resolve(project.paths.root, 'audio', 'song.wav');
  await ensureDir(dirname(destination));
  execFileSync(
    'ffmpeg',
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
  requireFfmpeg();
  const project = await loadProject(projectDir);
  const source = resolve(input);
  if (!existsSync(source)) throw new ValidationError(`Missing footage input: ${source}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new ValidationError('Footage name must be lowercase letters, digits, and dashes.');
  }
  const destination = resolve(project.paths.assets, 'footage', `${name}.mp4`);
  await ensureDir(dirname(destination));
  execFileSync(
    'ffmpeg',
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
