import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { parse } from 'yaml';
import { loadProject } from '@coreslopper/core';
import { createMeme, finishSetup, wizardOptions } from '../packages/cli/src/board-wizard.ts';
import { addLibraryCharacter } from '../packages/cli/src/character-library.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';

// CMD-CreateMeme through the board's wizard (POST /api/new/meme): EVT-MemeCreated, EVT-MemeRefused.

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-meme-wizard-'));
  temporary.push(dir);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(dir, folder), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  return dir;
}

/** A POST to the board's API from the board's own page. */
function post(ws: string, url: string, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const handler = boardHandler({ root: ws, refresh: async () => undefined });
  return new Promise((resolveDone) => {
    const chunks: Buffer[] = [];
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(payload))]), {
      method: 'POST',
      url,
      headers: { host: '127.0.0.1:4848', origin: 'http://127.0.0.1:4848', 'content-type': 'application/json' },
    });
    const res = {
      statusCode: 200,
      setHeader() {},
      writeHead(status: number) {
        this.statusCode = status;
        return this;
      },
      write(chunk: Buffer) {
        chunks.push(Buffer.from(chunk));
        return true;
      },
      end(chunk?: Buffer | string) {
        if (chunk) chunks.push(Buffer.from(chunk));
        const text = Buffer.concat(chunks).toString('utf8');
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(text) as Record<string, unknown>;
        } catch {
          body = { error: text };
        }
        resolveDone({ status: this.statusCode, body });
      },
    };
    void handler(req as never, res as never);
  });
}

const MEME = { slug: 'office-prank', title: 'Office Prank', budget: 10, imageProvider: 'mock', videoProvider: 'mock' };

async function withOfficeRobot(ws: string): Promise<void> {
  await addLibraryCharacter(ws, { id: 'office-robot', name: 'Office Robot', description: 'A boxy grey robot with a coffee-stained screen face.' });
}

describe('the meme wizard (CMD-CreateMeme)', () => {
  it('ST-008: A meme is created with its pitch and a library character', async () => {
    const ws = await workspace();
    await withOfficeRobot(ws);
    const created = await post(ws, '/api/new/meme', { ...MEME, idea: 'The printer takes revenge', setting: 'an open-plan office', characters: ['office-robot'] });
    expect(created).toMatchObject({ status: 200, body: { slug: 'office-prank', next: '/new-meme office-prank' } });

    const dir = join(ws, 'projects', 'office-prank');
    const project = await loadProject(dir);
    expect(project.config.kind).toBe('meme');
    expect(project.config.formats).toEqual({ master: { aspect: '9:16', width: 1080, height: 1920, fps: 30 }, derivatives: [] });
    const pitch = await readFile(join(dir, 'pitch.md'), 'utf8');
    expect(pitch).toContain('The printer takes revenge');
    expect(pitch).toContain('an open-plan office');
    const bible = parse(await readFile(join(dir, 'characters.yaml'), 'utf8')) as { characters: Array<{ id: string; library?: string }> };
    expect(bible.characters).toEqual([expect.objectContaining({ id: 'office-robot', library: 'office-robot' })]);
    expect(project.state.stages.setup?.status).toBe('done');
    expect(project.state.stage).toBe('script');
  });

  it('ST-008: A meme without characters is valid', async () => {
    const ws = await workspace();
    const created = await post(ws, '/api/new/meme', { ...MEME, idea: 'The printer takes revenge', characters: [] });
    expect(created).toMatchObject({ status: 200, body: { slug: 'office-prank' } });

    const dir = join(ws, 'projects', 'office-prank');
    const project = await loadProject(dir);
    expect(project.state.stages.setup?.status).toBe('done');
    expect(existsSync(join(dir, 'characters.yaml'))).toBe(false);
    const pitch = await readFile(join(dir, 'pitch.md'), 'utf8');
    expect(pitch).toContain('The printer takes revenge');
    expect(pitch).not.toMatch(/setting/i);
  });

  it('ST-008: An empty idea is refused', async () => {
    const ws = await workspace();
    for (const idea of [undefined, '', '   ']) {
      const refused = await post(ws, '/api/new/meme', { ...MEME, idea });
      expect(refused.status).toBe(400);
      expect(String(refused.body.error)).toMatch(/needs an idea/);
    }
    expect(existsSync(join(ws, 'projects', 'office-prank'))).toBe(false);
  });

  it('ST-008: A taken slug is refused', async () => {
    const ws = await workspace();
    await mkdir(join(ws, 'projects', 'office-prank'), { recursive: true });
    await writeFile(join(ws, 'projects', 'office-prank', 'keep.txt'), 'mine');
    const refused = await post(ws, '/api/new/meme', { ...MEME, idea: 'The printer takes revenge' });
    expect(refused.status).toBe(400);
    expect(String(refused.body.error)).toMatch(/slug "office-prank" is taken/);
    expect(await readFile(join(ws, 'projects', 'office-prank', 'keep.txt'), 'utf8')).toBe('mine');
    expect(existsSync(join(ws, 'projects', 'office-prank', 'project.yaml'))).toBe(false);
  });
});

describe('createMeme as new --kind meme runs it', () => {
  it('derives the title from the slug, defaults the budget to 10 USD, and writes the pitch in the user words', async () => {
    const ws = await workspace();
    const dir = await createMeme(ws, { slug: 'office-prank', imageProvider: 'mock', videoProvider: 'mock', idea: '  The printer takes revenge ', setting: 'an open-plan office', internal: true });
    const project = await loadProject(dir);
    expect(project.config).toMatchObject({ title: 'Office Prank', budget_usd: 10, distribution: 'internal' });
    expect(await readFile(join(dir, 'pitch.md'), 'utf8')).toBe('# Pitch\n\n## Idea\n\nThe printer takes revenge\n\n## Setting\n\nan open-plan office\n');
  });

  it('refuses an unknown library character and a budget under the minimum before any folder exists', async () => {
    const ws = await workspace();
    const input = { slug: 'office-prank', imageProvider: 'mock', videoProvider: 'mock', idea: 'The printer takes revenge' };
    await expect(createMeme(ws, { ...input, characters: ['ghost'] })).rejects.toThrow(/no library character "ghost"/);
    await expect(createMeme(ws, { ...input, budget: 0.01 })).rejects.toThrow(/at least/);
    expect(existsSync(join(ws, 'projects', 'office-prank'))).toBe(false);
  });

  it('finishes a meme setup only once pitch.md holds the idea', async () => {
    const ws = await workspace();
    const dir = await createMeme(ws, { slug: 'office-prank', imageProvider: 'mock', videoProvider: 'mock', idea: 'The printer takes revenge' });
    await writeFile(join(dir, 'pitch.md'), '\n');
    await expect(finishSetup(dir)).rejects.toThrow(/the idea in pitch.md/);
  });

  it('offers the library characters and the meme budget default in the wizard options', async () => {
    const ws = await workspace();
    await withOfficeRobot(ws);
    expect(await wizardOptions(ws, {})).toMatchObject({ library: [{ id: 'office-robot', name: 'Office Robot' }], memeDefaultBudgetUsd: 10 });
  });
});
