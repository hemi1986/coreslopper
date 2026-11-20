import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '@coreslopper/core';
import type { ImageVerdict } from './review-image.js';

/** The last verdict per subject (shot id or reference label) of a `verdicts.jsonl`. */
export function latestVerdicts(path: string): Map<string, ImageVerdict> {
  const latest = new Map<string, ImageVerdict>();
  if (!existsSync(path)) return latest;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const verdict = JSON.parse(line) as ImageVerdict;
      // A clip and its keyframe share the shot id; keep them apart.
      latest.set(verdict.clip ? `${verdict.subject} (clip)` : verdict.subject, verdict);
    } catch {
      // a torn line from a killed review
    }
  }
  return latest;
}

export interface VerdictSummary {
  subject: string;
  verdict: 'pass' | 'fail';
  score: number;
  attempt: number;
  image: string;
  issues: string[];
}

/** The path of the verdict log of a project, or of a series canon (`series/<slug>`). */
export async function verdictsPath(dir: string): Promise<string> {
  if (existsSync(join(dir, 'series.yaml'))) return join(dir, 'review', 'verdicts.jsonl');
  return join((await loadProject(dir)).paths.assets, 'review', 'verdicts.jsonl');
}

export async function summarizeVerdicts(dir: string, options: { failed?: boolean } = {}): Promise<VerdictSummary[]> {
  const rows = [...latestVerdicts(await verdictsPath(dir)).entries()]
    .map(([subject, verdict]) => ({
      subject,
      verdict: verdict.verdict,
      score: verdict.score,
      attempt: verdict.attempt,
      image: verdict.clip ?? verdict.image,
      issues: verdict.issues,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
  return options.failed ? rows.filter((row) => row.verdict === 'fail') : rows;
}

export function formatVerdicts(rows: VerdictSummary[]): string {
  if (rows.length === 0) return 'No verdicts.';
  const width = Math.max(...rows.map((row) => row.subject.length));
  const lines = rows.map((row) => {
    const blocking = row.issues.filter((issue) => !/^\W*note\b/i.test(issue));
    const detail = row.verdict === 'fail' ? ` · ${blocking.join(' | ').slice(0, 300)}` : '';
    return `${row.subject.padEnd(width)}  ${row.verdict}  ${String(row.score).padStart(2)}  a${row.attempt}${detail}`;
  });
  const failed = rows.filter((row) => row.verdict === 'fail').length;
  return `${lines.join('\n')}\n${rows.length - failed} pass, ${failed} fail`;
}
