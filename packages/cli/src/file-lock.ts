import { link, mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Small cross-process locks on lock files. Two writers of the same files (the
// release board and `release-run`) hold a short lock around each
// read-modify-write; a lock whose holder died is taken over once it is stale.

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Run `fn` while holding the lock file `path`; waits up to `timeoutMs` for another holder. */
export async function withFileLock<T>(path: string, fn: () => Promise<T>, options: { timeoutMs?: number; staleMs?: number } = {}): Promise<T> {
  const timeout = options.timeoutMs ?? 15_000;
  const stale = options.staleMs ?? 60_000;
  await mkdir(dirname(path), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      const handle = await open(path, 'wx');
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const info = await stat(path).catch(() => undefined);
      if (info && Date.now() - info.mtimeMs > stale) {
        await rm(path, { force: true });
        continue;
      }
      if (Date.now() - started > timeout) throw new Error(`${path} is locked by another process; try again in a moment`);
      await sleep(25);
    }
  }
  try {
    return await fn();
  } finally {
    await rm(path, { force: true });
  }
}

/**
 * Take a long-held lock that names its holder, atomically: the file appears
 * only with its content (a temp file linked into place), so another process
 * never reads an empty lock. Returns the release function, or undefined when
 * a live holder has it.
 */
export async function acquireHolderLock(path: string, options: { staleMs: number; alive: (pid: number) => boolean }): Promise<(() => Promise<void>) | undefined> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await link(temp, path);
        return () => rm(path, { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const info = await stat(path).catch(() => undefined);
        if (!info) continue;
        const holder = await readFile(path, 'utf8')
          .then((text) => JSON.parse(text) as { pid?: unknown })
          .catch(() => undefined);
        const young = Date.now() - info.mtimeMs < options.staleMs;
        // An unreadable lock is held while it is young: only an old one is taken over.
        if (young && (holder === undefined || (typeof holder.pid === 'number' && options.alive(holder.pid)))) return undefined;
        await rm(path, { force: true });
      }
    }
    return undefined;
  } finally {
    await rm(temp, { force: true });
  }
}
