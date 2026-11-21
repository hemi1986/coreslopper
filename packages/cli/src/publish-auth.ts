import { chmod, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError, repoRoot, type PublishPlatform } from '@coreslopper/core';
import {
  exchangeTikTokCode,
  exchangeYouTubeCode,
  openBrowser,
  pkcePair,
  randomState,
  resolveTikTokCredentials,
  resolveYouTubeCredentials,
  startLoopback,
  tiktokAuthUrl,
  tiktokRedirectUri,
  tiktokScopes,
  youtubeAuthUrl,
  type FetchLike,
} from '@coreslopper/providers';
import { upsertEnv } from './init.js';
import { findWorkspaceRoot } from './workspace.js';

/** The `.env` of the workspace (or of this repository). */
export function workspaceEnvPath(): string {
  return join(findWorkspaceRoot() ?? repoRoot(), '.env');
}

/** Write one value into `.env` (mode 0600) and into the running process. The value is never printed. */
export async function saveEnvValue(key: string, value: string, envPath = workspaceEnvPath()): Promise<void> {
  const content = existsSync(envPath) ? await readFile(envPath, 'utf8') : '# Local secrets. This file is gitignored.\n';
  await writeFile(envPath, upsertEnv(content, key, value), { encoding: 'utf8', mode: 0o600 });
  await chmod(envPath, 0o600).catch(() => undefined);
  process.env[key] = value;
}

export interface PublishAuthOptions {
  envPath?: string;
  /** TikTok: the redirect URI registered in the developer portal. */
  redirectUri?: string;
  open?: (url: string) => void;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  log?: (line: string) => void;
}

/**
 * One-time consent for a platform: open the consent URL, catch the redirect
 * on localhost, exchange the code (PKCE), and store the refresh token in `.env`.
 */
export async function publishAuth(platform: PublishPlatform, options: PublishAuthOptions = {}): Promise<string> {
  const print = options.log ?? ((line: string) => console.log(line));
  const open = options.open ?? openBrowser;
  const envPath = options.envPath ?? workspaceEnvPath();
  const state = randomState();

  if (platform === 'youtube') {
    const { clientId, clientSecret } = resolveYouTubeCredentials();
    if (!clientId || !clientSecret) {
      throw new ConfigError('Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env first (docs/publishing.md, "YouTube").');
    }
    const loopback = await startLoopback(options.redirectUri ?? 'http://127.0.0.1:0/');
    try {
      const pkce = pkcePair('base64url');
      const url = youtubeAuthUrl({ clientId, redirectUri: loopback.redirectUri, state, challenge: pkce.challenge });
      print('Open this URL to let coreslopper upload to your YouTube channel and manage its videos and comments (opening the browser):');
      print(url);
      open(url);
      const code = await loopback.waitForCode(state, options.timeoutMs);
      const { refreshToken } = await exchangeYouTubeCode({
        clientId,
        clientSecret,
        code,
        verifier: pkce.verifier,
        redirectUri: loopback.redirectUri,
        fetchImpl: options.fetchImpl,
      });
      await saveEnvValue('YOUTUBE_REFRESH_TOKEN', refreshToken, envPath);
    } finally {
      await loopback.close();
    }
    print(`✔ YOUTUBE_REFRESH_TOKEN saved to ${envPath}`);
    return 'YOUTUBE_REFRESH_TOKEN';
  }

  const { clientKey, clientSecret } = resolveTikTokCredentials();
  if (!clientKey || !clientSecret) {
    throw new ConfigError('Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to .env first (docs/publishing.md, "TikTok").');
  }
  const loopback = await startLoopback(options.redirectUri ?? tiktokRedirectUri());
  try {
    const pkce = pkcePair('hex');
    // Direct posting (an audited app) needs video.publish: asked for when .env or the release schedule turns it on.
    const { loadReleaseSchedule } = await import('@coreslopper/core');
    const schedule = await loadReleaseSchedule(findWorkspaceRoot() ?? repoRoot()).catch(() => undefined);
    const scopes = schedule?.autopilot.tiktok_direct ? tiktokScopes({ ...process.env, TIKTOK_DIRECT_POST: '1' }) : tiktokScopes();
    const url = tiktokAuthUrl({ clientKey, redirectUri: loopback.redirectUri, state, challenge: pkce.challenge, scopes });
    print(
      scopes.includes('video.publish')
        ? 'Open this URL to let coreslopper post videos on your TikTok account (opening the browser):'
        : 'Open this URL to let coreslopper send drafts to your TikTok inbox (opening the browser):',
    );
    print(url);
    open(url);
    const code = await loopback.waitForCode(state, options.timeoutMs);
    const { refreshToken } = await exchangeTikTokCode({
      clientKey,
      clientSecret,
      code,
      verifier: pkce.verifier,
      redirectUri: loopback.redirectUri,
      fetchImpl: options.fetchImpl,
    });
    await saveEnvValue('TIKTOK_REFRESH_TOKEN', refreshToken, envPath);
  } finally {
    await loopback.close();
  }
  print(`✔ TIKTOK_REFRESH_TOKEN saved to ${envPath}`);
  return 'TIKTOK_REFRESH_TOKEN';
}
