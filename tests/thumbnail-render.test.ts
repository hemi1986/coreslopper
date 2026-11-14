import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashFile } from '@coreslopper/core';
import { renderThumbnail } from '../packages/cli/src/thumbnail.ts';
import { thumbnailProblems } from '../packages/cli/src/thumbnail-files.ts';

// Needs the Remotion browser (`npx remotion browser ensure`); CI sets the variable after that step.
describe.runIf(process.env.CORESLOPPER_RENDER_TESTS === '1')('thumbnail render', () => {
  it('renders the same 1280x720 JPEG twice for the demo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-thumb-render-'));
    const still = join(dir, 'still.svg');
    await writeFile(
      still,
      '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#0d0d24"/><circle cx="1300" cy="420" r="220" fill="#05d9e8"/></svg>',
    );
    const options = {
      projectDir: join(process.cwd(), 'projects/demo'),
      still,
      text: 'Neon|Rain',
      tag: 'Demo',
      layout: 'left',
    };
    const a = await renderThumbnail({ ...options, out: join(dir, 'a.jpg') });
    const b = await renderThumbnail({ ...options, out: join(dir, 'b.jpg') });
    expect(await thumbnailProblems(a)).toEqual([]);
    expect(await hashFile(a)).toBe(await hashFile(b));
  }, 240_000);

  it('renders a 1080x1920 Short thumbnail', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-thumb-render-'));
    const still = join(dir, 'still.svg');
    await writeFile(
      still,
      '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#0d0d24"/><circle cx="1300" cy="420" r="220" fill="#ff2a6d"/></svg>',
    );
    const out = await renderThumbnail({
      projectDir: join(process.cwd(), 'projects/demo'),
      still,
      text: 'Neon|Rain',
      format: '9x16',
      focus: '0.68,0.39',
      out: join(dir, 'short.jpg'),
    });
    expect(await thumbnailProblems(out, '9x16')).toEqual([]);
  }, 240_000);
});
