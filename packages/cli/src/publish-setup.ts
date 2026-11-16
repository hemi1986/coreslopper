import {
  resolveTikTokCredentials,
  resolveYouTubeCredentials,
  validateTikTokClient,
  validateYouTubeClient,
  type FetchLike,
} from '@coreslopper/providers';

/** OAuth clients for `publish`, as `init` takes them from flags or the environment. */
export interface PublishClientOptions {
  youtubeClientId?: string;
  youtubeClientSecret?: string;
  tiktokClientKey?: string;
  tiktokClientSecret?: string;
}

/** The `.env` entries for the publish clients that are complete (ID and secret). */
export function publishClientEnv(options: PublishClientOptions, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const youtube = resolveYouTubeCredentials(env);
  const tiktok = resolveTikTokCredentials(env);
  const result: Record<string, string> = {};
  const youtubeId = options.youtubeClientId ?? youtube.clientId;
  const youtubeSecret = options.youtubeClientSecret ?? youtube.clientSecret;
  if (youtubeId && youtubeSecret) Object.assign(result, { YOUTUBE_CLIENT_ID: youtubeId.trim(), YOUTUBE_CLIENT_SECRET: youtubeSecret.trim() });
  const tiktokKey = options.tiktokClientKey ?? tiktok.clientKey;
  const tiktokSecret = options.tiktokClientSecret ?? tiktok.clientSecret;
  if (tiktokKey && tiktokSecret) Object.assign(result, { TIKTOK_CLIENT_KEY: tiktokKey.trim(), TIKTOK_CLIENT_SECRET: tiktokSecret.trim() });
  return result;
}

/** Check each complete client against its token endpoint; returns one message per client that is not confirmed. */
export async function checkPublishClients(env: Record<string, string>, fetchImpl?: FetchLike): Promise<string[]> {
  const problems: string[] = [];
  if (env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET) {
    const check = await validateYouTubeClient(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, fetchImpl);
    if (check.status !== 'valid') problems.push(`Could not verify the YouTube OAuth client (${check.message}).`);
  }
  if (env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET) {
    const check = await validateTikTokClient(env.TIKTOK_CLIENT_KEY, env.TIKTOK_CLIENT_SECRET, fetchImpl);
    if (check.status !== 'valid') problems.push(`Could not verify the TikTok client (${check.message}).`);
  }
  return problems;
}

/** The `publish-auth` commands still to run for the configured clients. */
export function pendingPublishAuth(env: Record<string, string>, processEnv: NodeJS.ProcessEnv = process.env): string[] {
  const commands: string[] = [];
  if (env.YOUTUBE_CLIENT_ID && !processEnv.YOUTUBE_REFRESH_TOKEN) commands.push('npm run cli -- publish-auth youtube');
  if (env.TIKTOK_CLIENT_KEY && !processEnv.TIKTOK_REFRESH_TOKEN) commands.push('npm run cli -- publish-auth tiktok');
  return commands;
}
