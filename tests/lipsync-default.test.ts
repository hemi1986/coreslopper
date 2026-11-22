import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SeriesSchema, defaultLipSyncProvider, loadProject, providerForRole, readYamlFile } from '@coreslopper/core';
import { createEpisode, createSeriesCanon, createVideoProject } from '../packages/cli/src/board-wizard.ts';
import { createProject } from '../packages/cli/src/new-project.ts';
import { createSeries } from '../packages/cli/src/new-series.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-lipsync-default-'));
  temporary.push(dir);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(dir, folder), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  return dir;
}

async function lipsyncOf(projectDir: string) {
  return (await loadProject(projectDir)).config.providers.lipsync;
}

describe('lip-sync routing without providers.lipsync', () => {
  it('follows the video provider, ComfyUI included, and keeps Topview on fal', () => {
    const lipsync = (video: 'fal' | 'higgsfield' | 'topview' | 'comfyui' | 'mock') =>
      providerForRole({ providers: { image: 'fal', video } }, 'video.lipsync');
    expect(lipsync('comfyui')).toBe('comfyui');
    expect(lipsync('topview')).toBe('fal');
    expect(lipsync('fal')).toBe('fal');
    expect(lipsync('higgsfield')).toBe('higgsfield');
    expect(lipsync('mock')).toBe('mock');
    expect(defaultLipSyncProvider('comfyui')).toBe('comfyui');
  });

  it('lets an explicit providers.lipsync win', () => {
    expect(providerForRole({ providers: { image: 'fal', video: 'comfyui', lipsync: 'fal' } }, 'video.lipsync')).toBe('fal');
    expect(providerForRole({ providers: { image: 'topview', video: 'topview', lipsync: 'topview' } }, 'video.lipsync')).toBe('topview');
  });
});

describe('new projects write providers.lipsync', () => {
  it('new writes the resolved default unless a lip-sync provider is chosen', async () => {
    const ws = await workspace();
    const local = await createProject({ root: ws, slug: 'local-teaser', budget: 5, imageProvider: 'mock', videoProvider: 'comfyui' });
    expect(await lipsyncOf(local)).toBe('comfyui');
    const topview = await createProject({ root: ws, slug: 'topview-clip', budget: 5, imageProvider: 'topview', videoProvider: 'topview' });
    expect(await lipsyncOf(topview)).toBe('fal');
    const chosen = await createProject({ root: ws, slug: 'chosen', budget: 5, videoProvider: 'comfyui', lipsyncProvider: 'fal' });
    expect(await lipsyncOf(chosen)).toBe('fal');
  });

  it('new-series writes the resolved default unless a lip-sync provider is chosen', async () => {
    const ws = await workspace();
    const local = await createSeries({ root: ws, slug: 'local-series', budget: 50, providers: { image: 'comfyui', video: 'comfyui', audio: 'comfyui' } });
    expect((await readYamlFile(join(local, 'series.yaml'), SeriesSchema)).providers.lipsync).toBe('comfyui');
    const chosen = await createSeries({ root: ws, slug: 'chosen-series', budget: 50, providers: { video: 'comfyui', lipsync: 'fal' } });
    expect((await readYamlFile(join(chosen, 'series.yaml'), SeriesSchema)).providers.lipsync).toBe('fal');
  });

  it('the board wizard writes it, and an episode copies it from series.yaml', async () => {
    const ws = await workspace();
    const video = await createVideoProject(ws, {
      slug: 'glass-harbor', title: 'Glass Harbor', artist: 'Test Artist', budget: 40, imageProvider: 'mock', videoProvider: 'comfyui',
      language: 'en', rights: 'own song', license: 'all rights reserved',
    });
    expect(await lipsyncOf(video)).toBe('comfyui');
    await createSeriesCanon(ws, { slug: 'night-ferry', title: 'Night Ferry', budget: 80, format: '9x16', imageProvider: 'mock', videoProvider: 'comfyui', audioProvider: 'comfyui' });
    const episode = await createEpisode(ws, { series: 'night-ferry', episode: 1, slug: 'night-ferry-01', budget: 10 });
    expect(await lipsyncOf(episode)).toBe('comfyui');
  });
});
