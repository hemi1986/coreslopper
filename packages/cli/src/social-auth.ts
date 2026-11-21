import { createInterface } from 'node:readline/promises';
import { ConfigError } from '@coreslopper/core';
import {
  exchangeLinkedInCode,
  exchangeXCode,
  instagramAccount,
  linkedinAuthUrl,
  linkedinMember,
  linkedinRedirectUri,
  openBrowser,
  pkcePair,
  randomState,
  refreshInstagramToken,
  resolveLinkedInCredentials,
  resolveXCredentials,
  startLoopback,
  xAuthUrl,
  xRedirectUri,
  type FetchLike,
} from '@coreslopper/providers';
import { saveEnvValue, workspaceEnvPath } from './publish-auth.js';

// One-time consent for the release autopilot's social platforms. X and
// LinkedIn use the browser flow with a loopback redirect; Instagram takes the
// token the Meta app dashboard generates for the tester account, since Meta
// redirects only to HTTPS. Every value goes to .env and is never printed.

export type SocialAuthPlatform = 'x' | 'linkedin' | 'instagram';

export interface SocialAuthOptions {
  envPath?: string;
  open?: (url: string) => void;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  log?: (line: string) => void;
  /** Instagram: read the pasted token; defaults to a prompt on the terminal. */
  readToken?: () => Promise<string>;
  now?: () => Date;
}

async function promptToken(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    return (await rl.question('Paste the Instagram access token (it is stored in .env, not shown again): ')).trim();
  } finally {
    rl.close();
  }
}

/** Authorize one platform and store its tokens in `.env`; returns the keys written. */
export async function socialAuth(platform: SocialAuthPlatform, options: SocialAuthOptions = {}): Promise<string[]> {
  const print = options.log ?? ((line: string) => console.log(line));
  const open = options.open ?? openBrowser;
  const envPath = options.envPath ?? workspaceEnvPath();
  const now = options.now ?? (() => new Date());
  const save = async (key: string, value: string) => saveEnvValue(key, value, envPath);

  if (platform === 'x') {
    const { clientId, clientSecret } = resolveXCredentials();
    if (!clientId || !clientSecret) throw new ConfigError('Add X_CLIENT_ID and X_CLIENT_SECRET to .env first (docs/publishing.md, "X").');
    const loopback = await startLoopback(xRedirectUri());
    try {
      const state = randomState();
      const pkce = pkcePair('base64url');
      const url = xAuthUrl({ clientId, redirectUri: loopback.redirectUri, state, challenge: pkce.challenge });
      print('Open this URL to let coreslopper post to your X account (opening the browser):');
      print(url);
      open(url);
      const code = await loopback.waitForCode(state, options.timeoutMs);
      const { refreshToken } = await exchangeXCode({ clientId, clientSecret, code, verifier: pkce.verifier, redirectUri: loopback.redirectUri, fetchImpl: options.fetchImpl });
      await save('X_REFRESH_TOKEN', refreshToken);
    } finally {
      await loopback.close();
    }
    print(`✔ X_REFRESH_TOKEN saved to ${envPath}`);
    return ['X_REFRESH_TOKEN'];
  }

  if (platform === 'linkedin') {
    const { clientId, clientSecret } = resolveLinkedInCredentials();
    if (!clientId || !clientSecret) throw new ConfigError('Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env first (docs/publishing.md, "LinkedIn").');
    const loopback = await startLoopback(linkedinRedirectUri());
    const keys = ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_TOKEN_EXPIRES_AT', 'LINKEDIN_MEMBER_URN'];
    try {
      const state = randomState();
      // LinkedIn compares the redirect URI literally: send the registered one, not the bound 127.0.0.1 address.
      const redirectUri = linkedinRedirectUri();
      const url = linkedinAuthUrl({ clientId, redirectUri, state });
      print('Open this URL to let coreslopper post to your LinkedIn profile (opening the browser):');
      print(url);
      open(url);
      const code = await loopback.waitForCode(state, options.timeoutMs);
      const token = await exchangeLinkedInCode({ clientId, clientSecret, code, redirectUri, fetchImpl: options.fetchImpl, now: now() });
      const member = await linkedinMember(token.accessToken, options.fetchImpl);
      await save('LINKEDIN_ACCESS_TOKEN', token.accessToken);
      await save('LINKEDIN_TOKEN_EXPIRES_AT', token.expiresAt);
      await save('LINKEDIN_MEMBER_URN', member.memberUrn);
      if (token.refreshToken) {
        await save('LINKEDIN_REFRESH_TOKEN', token.refreshToken);
        keys.push('LINKEDIN_REFRESH_TOKEN');
      }
      print(`✔ LinkedIn authorized${member.name ? ` as ${member.name}` : ''}; the token lasts until ${token.expiresAt.slice(0, 10)}.`);
    } finally {
      await loopback.close();
    }
    return keys;
  }

  const token = (await (options.readToken ?? promptToken)()).trim();
  if (!token) throw new ConfigError('No token given. Generate one in the Meta app dashboard (docs/publishing.md, "Instagram").');
  const account = await instagramAccount(token, options.fetchImpl);
  let value = token;
  let expiresAt: string;
  try {
    const refreshed = await refreshInstagramToken(token, options.fetchImpl, now());
    value = refreshed.accessToken;
    expiresAt = refreshed.expiresAt;
  } catch {
    // A token younger than 24 hours cannot be refreshed yet; a dashboard token lasts 60 days.
    expiresAt = new Date(now().getTime() + 60 * 86_400_000).toISOString();
  }
  await save('INSTAGRAM_ACCESS_TOKEN', value);
  await save('INSTAGRAM_USER_ID', account.userId);
  await save('INSTAGRAM_TOKEN_EXPIRES_AT', expiresAt);
  print(`✔ Instagram authorized${account.username ? ` as @${account.username}` : ''}; the autopilot refreshes the token before ${expiresAt.slice(0, 10)}.`);
  return ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_USER_ID', 'INSTAGRAM_TOKEN_EXPIRES_AT'];
}
