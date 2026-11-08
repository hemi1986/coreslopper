import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv']);
export const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac']);

export function mimeForPath(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.avif') return 'image/avif';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.m4a') return 'audio/mp4';
  if (extension === '.ogg') return 'audio/ogg';
  if (extension === '.flac') return 'audio/flac';
  return 'application/octet-stream';
}

export async function fileToDataUri(path: string): Promise<string> {
  const data = await readFile(path);
  return `data:${mimeForPath(path)};base64,${data.toString('base64')}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export class NonRetryableHttpError extends Error {}

export async function fetchJsonWithRetry(
  label: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
  attempts = 4,
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      const text = await response.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }
      if (!response.ok) {
        const message = `${label} ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
        if (!isRetryableStatus(response.status)) throw new NonRetryableHttpError(message);
        if (attempt < attempts - 1) {
          await delay(500 * 2 ** attempt);
          continue;
        }
        throw new Error(message);
      }
      return body as Record<string, unknown>;
    } catch (error) {
      if (error instanceof NonRetryableHttpError) throw error;
      lastError = error;
      if (attempt >= attempts - 1) break;
      await delay(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function collectUrls(value: unknown, keyHint = ''): string[] {
  const found: string[] = [];
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) {
      const extension = extname(new URL(value).pathname).toLowerCase();
      if (
        IMAGE_EXTENSIONS.has(extension) ||
        VIDEO_EXTENSIONS.has(extension) ||
        AUDIO_EXTENSIONS.has(extension) ||
        keyHint === 'url' ||
        keyHint.endsWith('_url')
      ) {
        found.push(value);
      }
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) found.push(...collectUrls(item, keyHint));
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      found.push(...collectUrls(item, key));
    }
  }
  return found;
}

export function extensionFor(contentType: string | null, url: string): string {
  const type = (contentType ?? '').split(';')[0]?.trim().toLowerCase();
  if (type === 'image/png') return '.png';
  if (type === 'image/jpeg') return '.jpg';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/svg+xml') return '.svg';
  if (type === 'video/mp4') return '.mp4';
  if (type === 'video/webm') return '.webm';
  if (type === 'audio/mpeg') return '.mp3';
  if (type === 'audio/wav' || type === 'audio/x-wav') return '.wav';
  if (type === 'audio/mp4') return '.m4a';
  const extension = extname(new URL(url).pathname).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension) || AUDIO_EXTENSIONS.has(extension)) {
    return extension;
  }
  return '.bin';
}

export async function downloadOutputs(
  prefix: string,
  urls: string[],
  outputDir: string,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const files: string[] = [];
  for (const [index, url] of urls.entries()) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Failed to download ${prefix} output ${url}: ${response.status}`);
    const extension = extensionFor(response.headers.get('content-type'), url);
    const name = createHash('sha256').update(url).digest('hex').slice(0, 16);
    const path = join(outputDir, `${prefix}-${name}-${index}${extension}`);
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
    files.push(path);
  }
  return files;
}
