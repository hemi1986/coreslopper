import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReviewPrompt, parseVerdict, reviewImage } from '../packages/cli/src/review-image.ts';

describe('parseVerdict', () => {
  it('reads structured output from claude -p --output-format json', () => {
    const raw = JSON.stringify({
      type: 'result',
      is_error: false,
      result: '',
      structured_output: { verdict: 'fail', score: 4, issues: ['third arm -> remove it'], fix_prompt: 'exactly two arms' },
    });
    expect(parseVerdict(raw)).toEqual({
      verdict: 'fail',
      score: 4,
      issues: ['third arm -> remove it'],
      fix_prompt: 'exactly two arms',
    });
  });

  it('falls back to the art-director text format', () => {
    const raw = JSON.stringify({
      result: 'VERDICT: pass\nSCORE: 8\nISSUES:\n- faint glyph on cuff -> ignore\nFIX_PROMPT: none',
    });
    expect(parseVerdict(raw)).toEqual({ verdict: 'pass', score: 8, issues: ['faint glyph on cuff -> ignore'], fix_prompt: 'none' });
  });

  it('reads JSON embedded in the result text', () => {
    const raw = JSON.stringify({ result: 'Done.\n{"verdict":"pass","score":9,"issues":[],"fix_prompt":"none"}' });
    expect(parseVerdict(raw).verdict).toBe('pass');
  });

  it('throws on an error result or a missing verdict', () => {
    expect(() => parseVerdict(JSON.stringify({ is_error: true, result: 'rate limited' }))).toThrow(/rate limited/);
    expect(() => parseVerdict('no idea')).toThrow(/No verdict/);
  });
});

describe('buildReviewPrompt', () => {
  it('names the shot, neighbours, and focus', () => {
    const prompt = buildReviewPrompt({
      projectDir: 'projects/x',
      images: ['projects/x/assets/keyframes/shot-002.png'],
      shot: 'shot-002',
      neighbours: ['projects/x/assets/keyframes/shot-001.png'],
      focus: 'hatch lid present',
    });
    expect(prompt).toContain('storyboard shot shot-002');
    expect(prompt).toContain('shot-001.png');
    expect(prompt).toContain('hatch lid present');
  });
});

describe('reviewImage', () => {
  it('appends the verdict to assets/review/verdicts.jsonl', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'review-image-'));
    const project = join(dir, 'demo');
    cpSync(join(process.cwd(), 'projects/demo'), project, {
      recursive: true,
      filter: (source) => !/\/(assets|renders|\.cache)(\/|$)/.test(source),
    });
    mkdirSync(join(project, 'assets', 'keyframes'), { recursive: true });
    const image = join(project, 'assets', 'keyframes', 'still.png');
    writeFileSync(image, 'png');
    let seen = '';
    const verdict = await reviewImage(project, {
      images: [image],
      ref: 'prop:walkman',
      attempt: 2,
      runner: async (prompt) => {
        seen = prompt;
        return JSON.stringify({ structured_output: { verdict: 'pass', score: 8, issues: [], fix_prompt: 'none' } });
      },
    });
    expect(seen).toContain('continuity reference prop:walkman');
    expect(verdict).toMatchObject({ verdict: 'pass', subject: 'prop:walkman', attempt: 2 });
    const log = join(project, 'assets', 'review', 'verdicts.jsonl');
    expect(existsSync(log)).toBe(true);
    expect(JSON.parse(readFileSync(log, 'utf8').trim()).verdict).toBe('pass');
  });

  it('rejects an unknown shot', async () => {
    await expect(
      reviewImage(join(process.cwd(), 'projects/demo'), {
        images: [join(process.cwd(), 'package.json')],
        shot: 'shot-999',
        runner: async () => '',
      }),
    ).rejects.toThrow(/not in storyboard/);
  });
});

describe('reviewImage on a series canon', () => {
  it('logs to the series review folder and refuses shots', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'review-series-'));
    writeFileSync(join(dir, 'series.yaml'), 'version: 1\n');
    const image = join(dir, 'plate.png');
    writeFileSync(image, 'png');
    const runner = async () => JSON.stringify({ structured_output: { verdict: 'fail', score: 3, issues: ['x -> y'], fix_prompt: 'p' } });
    const verdict = await reviewImage(dir, { images: [image], ref: 'plate:yard/wide', runner });
    expect(verdict.verdict).toBe('fail');
    expect(existsSync(join(dir, 'review', 'verdicts.jsonl'))).toBe(true);
    await expect(reviewImage(dir, { images: [image], shot: 'shot-001', runner })).rejects.toThrow(/no shots/);
  });
});
