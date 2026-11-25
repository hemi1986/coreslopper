import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { parse } from 'yaml';
import { boardHandler } from '../packages/cli/src/release-board.ts';
import {
  characterLibraryFixture,
  cleanupLibraryFixtures,
  setLibraryFixture,
  type LibraryKindFixture,
} from './helpers/library-fixture.ts';

// One route table over the board handler for both URL families. The kind's
// lifecycle is the fixture; this suite pins what both families owe: the
// listing, the file route, cross-kind 404, the write verbs, upload roles and
// the write guard. The browser views stay separate.

afterEach(cleanupLibraryFixtures);

const fixtures: LibraryKindFixture[] = [characterLibraryFixture, setLibraryFixture];

function board(ws: string) {
  const handler = boardHandler({ root: ws, refresh: async () => undefined });
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((done) => {
      const raw = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
      const requestHeaders = {
        host: '127.0.0.1:4848',
        ...(raw === undefined ? {} : { 'content-type': 'application/json', origin: 'http://127.0.0.1:4848' }),
        ...headers,
      };
      const req = Object.assign(Readable.from(raw === undefined ? [] : [Buffer.from(raw)]), { method, url, headers: requestHeaders });
      const chunks: Buffer[] = [];
      const res = {
        statusCode: 200,
        headers: {} as Record<string, unknown>,
        setHeader(name: string, value: unknown) {
          this.headers[name.toLowerCase()] = value;
        },
        writeHead(status: number, head: Record<string, unknown> = {}) {
          this.statusCode = status;
          Object.assign(this.headers, head);
          return this;
        },
        write(chunk: Buffer | string) {
          chunks.push(Buffer.from(chunk));
          return true;
        },
        end(chunk?: Buffer | string) {
          if (chunk) chunks.push(Buffer.from(chunk));
          done({ status: this.statusCode, headers: this.headers, body: Buffer.concat(chunks).toString('utf8') });
        },
        on() {
          return this;
        },
        once() {
          return this;
        },
        emit() {
          return true;
        },
        removeListener() {
          return this;
        },
      };
      void handler(req as never, res as never);
    });
  return { call };
}

for (const fixture of fixtures) {
  describe(`the board’s ${fixture.kind} routes`, () => {
    it('lists with targets, serves the entry’s files, and never serves the entry file, a dot file, or the other kind’s path', async () => {
      const ws = await fixture.makeWorkspace();
      await fixture.add(ws, fixture.newInput);
      const source = await fixture.writeSource(ws, fixture.file.name, fixture.file.content);
      await fixture.addFile(ws, fixture.newId, source, fixture.file.options);
      await fixture.makeTarget(ws, 'fixture-target');
      const { call } = board(ws);

      const listing = JSON.parse((await call('GET', fixture.listPath)).body);
      expect(listing[fixture.targetArray].map((entry: { id: string }) => entry.id)).toContain(fixture.newId);
      expect(listing.targets).toContainEqual({ scope: 'project', slug: 'fixture-target', title: 'fixture-target' });

      const file = await call('GET', `${fixture.filePath}/${fixture.newId}/${fixture.file.name}`);
      expect(file.status).toBe(200);
      expect(file.body).toBe(fixture.file.content);
      expect((await call('GET', `${fixture.filePath}/${fixture.newId}/${fixture.entryFile}`)).status).toBe(403);
      expect((await call('GET', `${fixture.filePath}/${fixture.newId}/.incoming-x.png`)).status).toBe(403);

      const other = fixtures.find((entry) => entry !== fixture)!;
      expect((await call('GET', `${other.filePath}/${fixture.newId}/${fixture.file.name}`)).status).toBe(404);
      expect((await call('GET', `${fixture.filePath}/unknown/${fixture.file.name}`)).status).toBe(404);
    });

    it('writes new, update, upload, remove-file, use and delete through its own paths', async () => {
      const ws = await fixture.makeWorkspace();
      const target = await fixture.makeTarget(ws, 'fixture-target');
      const { call } = board(ws);
      const upload = (name: string, bytes: string, query: string) =>
        call('POST', `${fixture.uploadPath}/${fixture.newId}?${query}`, bytes, {
          'content-type': 'application/octet-stream',
          origin: 'http://127.0.0.1:4848',
        });

      const created = await call('POST', `${fixture.listPath}/new`, fixture.newInput);
      expect(created.status).toBe(200);
      expect(JSON.parse(created.body)).toEqual({ id: fixture.newId });

      const updated = await call('POST', `${fixture.listPath}/${fixture.newId}`, { action: 'update', ...fixture.updateInput });
      expect(updated.status).toBe(200);
      expect(await fixture.load(ws, fixture.newId)).toMatchObject({ id: fixture.newId, ...fixture.updateInput });

      const accepted = await upload(fixture.upload.name, fixture.upload.content, `name=${encodeURIComponent(fixture.upload.name)}&role=${fixture.upload.role}`);
      expect(accepted.status).toBe(200);
      const withUpload = await fixture.load(ws, fixture.newId);
      expect(fixture.fileNames(withUpload)).toContain(fixture.upload.name);
      expect(await readFile(join(fixture.entryDir(ws, fixture.newId), fixture.upload.name), 'utf8')).toBe(fixture.upload.content);

      const refusedRole = await upload('other.png', 'other', 'name=other.png&role=' + fixture.upload.invalidRole);
      expect(refusedRole.status).toBe(400);
      expect(JSON.parse(refusedRole.body).error).toMatch(new RegExp(fixture.roles.join('|')));

      const removed = await call('POST', `${fixture.listPath}/${fixture.newId}`, { action: 'remove-file', name: fixture.upload.name });
      expect(removed.status).toBe(200);
      expect(fixture.fileNames(await fixture.load(ws, fixture.newId))).not.toContain(fixture.upload.name);
      expect(existsSync(join(fixture.entryDir(ws, fixture.newId), fixture.upload.name))).toBe(false);

      // A production's item comes into the library, then the route copies it into the video.
      await fixture.importFrom(ws, await fixture.makeSource(ws, 'fixture-source'));
      const used = await call('POST', `${fixture.listPath}/use`, { scope: 'project', slug: 'fixture-target', id: fixture.importedId });
      expect(used.status).toBe(200);
      const result = JSON.parse(used.body).result;
      expect(result).toMatchObject({ updated: false });
      expect(result.files.length).toBeGreaterThan(0);
      for (const file of result.files) expect(existsSync(join(target, file))).toBe(true);
      const bible = parse(await readFile(join(target, `${fixture.targetArray}.yaml`), 'utf8'));
      expect(bible[fixture.targetArray][0]).toMatchObject({ id: fixture.importedId, library: fixture.importedId });

      const deleted = await call('POST', `${fixture.listPath}/${fixture.newId}`, { action: 'delete' });
      expect(deleted.status).toBe(200);
      expect(existsSync(fixture.entryDir(ws, fixture.newId))).toBe(false);
      // A production keeps its copy after the library entry is gone.
      expect(existsSync(join(target, result.files[0]))).toBe(true);
    });

    it('passes the board’s write guard: a write from another host is refused', async () => {
      const ws = await fixture.makeWorkspace();
      const { call } = board(ws);

      const refused = await call('POST', `${fixture.listPath}/new`, fixture.newInput, { host: 'rebound.example:4848' });

      expect(refused.status).toBe(403);
      expect(JSON.parse(refused.body).error).toMatch(/127\.0\.0\.1 only/);
      expect((await fixture.list(ws)).entries).toEqual([]);
    });
  });
}
