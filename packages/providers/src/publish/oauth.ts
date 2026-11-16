import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PublishError } from './http.js';

/** A PKCE verifier and its S256 challenge. TikTok's desktop flow wants the challenge hex-encoded. */
export function pkcePair(encoding: 'base64url' | 'hex' = 'base64url'): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest(encoding);
  return { verifier, challenge };
}

export function randomState(): string {
  return randomBytes(16).toString('hex');
}

export interface Loopback {
  /** The redirect URI with the port actually bound. */
  redirectUri: string;
  /** Resolve with the authorization code once the browser comes back with the right state. */
  waitForCode(state: string, timeoutMs?: number): Promise<string>;
  close(): Promise<void>;
}

const PAGE = (text: string) =>
  `<!doctype html><meta charset="utf-8"><title>coreslopper</title><body style="font-family:sans-serif;padding:2rem">${text}</body>`;

/**
 * Listen on the loopback address of `redirectUri` for the OAuth redirect.
 * Port 0 binds a free port (Google allows any loopback port for desktop
 * clients); a fixed port must match the URI registered with the platform.
 */
export async function startLoopback(redirectUri: string): Promise<Loopback> {
  const url = new URL(redirectUri);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new PublishError(`The redirect URI must be http on a loopback address, got ${redirectUri}.`);
  }
  const path = url.pathname || '/';
  let deliver: ((query: URLSearchParams) => void) | undefined;
  const pending: URLSearchParams[] = [];
  const server: Server = createServer((request, response) => {
    const incoming = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (incoming.pathname !== path) {
      response.writeHead(404).end();
      return;
    }
    const error = incoming.searchParams.get('error');
    response.writeHead(error ? 400 : 200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      PAGE(error ? 'Authorization was not granted. You can close this tab.' : 'coreslopper is authorized. You can close this tab.'),
    );
    if (deliver) deliver(incoming.searchParams);
    else pending.push(incoming.searchParams);
  });
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname.replace(/^\[|\]$/g, '');
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(url.port || 0), host, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  url.port = String(port);
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return {
    redirectUri: url.toString(),
    close,
    waitForCode(state, timeoutMs = 300_000) {
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new PublishError('No authorization arrived within the time limit.')), timeoutMs);
        deliver = (query) => {
          const error = query.get('error');
          if (error) {
            clearTimeout(timer);
            reject(new PublishError(`Authorization failed: ${error} ${query.get('error_description') ?? ''}`.trim()));
            return;
          }
          // A redirect with a foreign state is ignored, not trusted.
          if (query.get('state') !== state) return;
          const code = query.get('code');
          if (!code) return;
          clearTimeout(timer);
          resolve(code);
        };
        for (const query of pending.splice(0)) deliver(query);
      });
    },
  };
}

/** Open a URL in the user's browser; best effort, the caller prints the URL too. */
export function openBrowser(url: string): void {
  const run = (command: string, args: string[]) => {
    try {
      const child = spawn(command, args, { stdio: 'ignore', detached: true });
      child.on('error', () => undefined);
      child.unref();
    } catch {
      // The printed URL is the fallback.
    }
  };
  if (process.platform === 'darwin') run('open', [url]);
  else if (process.platform === 'win32') run('rundll32', ['url.dll,FileProtocolHandler', url]);
  else if (process.env.WSL_DISTRO_NAME) run('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
  else run('xdg-open', [url]);
}

/**
 * An access token from a refresh token, cached until shortly before it
 * expires. `invalidate` forces a refresh after a 401.
 */
export class RefreshingToken {
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly refresh: () => Promise<{ accessToken: string; expiresInSeconds: number }>,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    const { accessToken, expiresInSeconds } = await this.refresh();
    // Refresh a minute early so a long upload does not cross the expiry.
    this.token = { value: accessToken, expiresAt: this.now() + Math.max(0, expiresInSeconds - 60) * 1000 };
    return accessToken;
  }

  invalidate(): void {
    this.token = undefined;
  }
}
