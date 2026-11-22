import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectConfigSchema } from '@coreslopper/core';
import { buildVideoProps, formatConfig, renderArtifactKeys, renderInputsHash } from '../packages/cli/src/render.ts';
import { readRecipe, recipePath, writeRecipe } from '../packages/cli/src/thumbnail-recipe.ts';
import { thumbnailProblems } from '../packages/cli/src/thumbnail-files.ts';

// Characterization tests for the render slice (adopted 2026-11-22, docs/domain/adoption-report.md). They pin what
// the code does today and the decided model keeps, not what the gap register wants.

const demoDir = join(process.cwd(), 'projects/demo');

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function folder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-render-'));
  temporary.push(dir);
  return dir;
}

/** A JPEG header with one SOF0 segment, padded to `bytes`. */
function jpeg(width: number, height: number, components: number, bytes = 64): Buffer {
  const buffer = Buffer.alloc(bytes);
  buffer.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  buffer[11] = components;
  return buffer;
}

describe('every format of a project', () => {
  it('renders at the master frame rate, whatever fps a derivative names', () => {
    const config = ProjectConfigSchema.parse({
      version: 1,
      slug: 'formats',
      title: 'Formats',
      created: '2026-11-22T00:00:00Z',
      workflow: { version: '0.1.0' },
      budget_usd: 10,
      formats: {
        master: { aspect: '16:9', width: 1920, height: 1080, fps: 30 },
        derivatives: [{ aspect: '4:5', width: 1080, height: 1350, fps: 25 }],
      },
    });
    expect(formatConfig(config, '4x5')).toEqual({ width: 1080, height: 1350, fps: 30 });
  });

  it('gets the resolved shots, the effective timing and the bibles as serializable props', async () => {
    const master = await buildVideoProps({ projectDir: demoDir });
    const vertical = await buildVideoProps({ projectDir: demoDir, format: '9x16' });
    expect(master.props.format).toBe('16x9');
    expect([master.props.width, master.props.height]).toEqual([1920, 1080]);
    expect([vertical.props.width, vertical.props.height, vertical.props.fps]).toEqual([1080, 1920, master.props.fps]);
    expect(vertical.props.shots).toEqual(master.props.shots);
    expect(master.props.durationInFrames).toBe(master.resolved.durationInFrames);
    expect(master.props.shots.length).toBe(master.resolved.shots.length);
    expect(master.props.style.palette).toBeDefined();
    expect(master.props.timing.audio.duration).toBeGreaterThan(0);
    expect(master.props.fonts!.length).toBeGreaterThan(0);
    for (const font of master.props.fonts!) expect(isAbsolute(font.url)).toBe(false);
    expect(JSON.parse(JSON.stringify(master.props))).toEqual(master.props);
  });
});

describe('the render record', () => {
  it('is two state.json artifacts named after the render file', () => {
    expect(renderArtifactKeys('renders/16x9.mp4')).toEqual({
      inputs: 'render:renders/16x9.mp4:inputs',
      file: 'render:renders/16x9.mp4:sha256',
    });
  });

  it('hashes the props and the bytes of the song', async () => {
    const root = await folder();
    await writeFile(join(root, 'song.wav'), 'first take');
    const { props } = await buildVideoProps({ projectDir: demoDir });
    const withSong = { ...props, audioSrc: 'song.wav' };

    const first = await renderInputsHash(withSong, root);
    expect(await renderInputsHash(withSong, root)).toBe(first);
    expect(await renderInputsHash({ ...withSong, shots: withSong.shots.slice(1) }, root)).not.toBe(first);
    await writeFile(join(root, 'song.wav'), 'second take');
    expect(await renderInputsHash(withSong, root)).not.toBe(first);
  });
});

describe('a composed image', () => {
  it('keeps its recipe beside it, with the source relative to the project and defaults left out', async () => {
    const dir = await folder();
    const image = join(dir, 'thumb-1-hero.jpg');
    await writeRecipe(image, {
      projectDir: demoDir,
      still: join(demoDir, 'storyboard.yaml'),
      text: 'NEON|RAIN',
      format: '16x9',
      layout: 'left',
      zoom: 1,
      scrim: 1,
      textOffset: 0,
    });
    expect(recipePath(image)).toBe(join(dir, 'thumb-1-hero.recipe.json'));
    expect(JSON.parse(await readFile(recipePath(image), 'utf8'))).toEqual({
      version: 1,
      still: 'storyboard.yaml',
      format: '16x9',
      text: 'NEON|RAIN',
      layout: 'left',
    });
    expect(await readRecipe(image)).toMatchObject({ still: 'storyboard.yaml', layout: 'left' });

    await writeFile(recipePath(image), '{ broken');
    expect(await readRecipe(image)).toBeUndefined();
  });

  it('is checked for its format size, its size limit, and RGB only for the cover', async () => {
    const dir = await folder();
    const write = async (name: string, buffer: Buffer) => {
      await writeFile(join(dir, name), buffer);
      return join(dir, name);
    };
    expect(await thumbnailProblems(await write('ok.jpg', jpeg(1280, 720, 3)))).toEqual([]);
    expect(await thumbnailProblems(await write('grey.jpg', jpeg(1280, 720, 1)))).toEqual([]);
    expect(await thumbnailProblems(await write('short.jpg', jpeg(1080, 1920, 3)), '9x16')).toEqual([]);
    expect(await thumbnailProblems(await write('wrong.jpg', jpeg(1920, 1080, 3)))).toEqual(['1920x1080, expected 1280x720']);
    expect(await thumbnailProblems(await write('big.jpg', jpeg(1280, 720, 3, 2 * 1024 * 1024)))).toEqual([
      '2.00 MB, limit 2 MB',
    ]);
    expect(await thumbnailProblems(await write('cover.jpg', jpeg(3000, 3000, 1)), '1x1')).toEqual([
      '1 colour components, expected RGB',
    ]);
    expect(await thumbnailProblems(await write('text.jpg', Buffer.from('not an image')))).toEqual(['not a JPEG']);
  });
});
