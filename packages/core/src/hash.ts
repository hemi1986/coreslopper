import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function hashFile(path: string): Promise<string> {
  const data = await readFile(path);
  return sha256(data);
}

/**
 * Stable JSON stringify: object keys are sorted recursively, so the same
 * logical request produces the same cache key regardless of key order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const item = record[key];
      if (item !== undefined) sorted[key] = sortValue(item);
    }
    return sorted;
  }
  return value;
}

export function hashObject(value: unknown): string {
  return sha256(canonicalJson(value));
}
