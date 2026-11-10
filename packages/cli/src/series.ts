import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CharacterBibleSchema,
  ProjectConfigSchema,
  SeriesSchema,
  SetBibleSchema,
  ValidationError,
  formatUsd,
  loadProject,
  nextStage,
  readYamlFile,
  repoRoot,
  type Series,
} from '@coreslopper/core';
import { formatSeconds } from './utils.js';

export interface EpisodeStatus {
  episode: number;
  title: string;
  slug?: string;
  stage?: string;
  status?: string;
  next?: string;
  spentUsd?: number;
  budgetUsd?: number;
  durationSeconds?: number;
  error?: string;
}

export interface SeriesStatus {
  series: Series;
  dir: string;
  characters: { id: string; face: string; voice: 'ok' | 'missing' | 'none'; refs: number }[];
  sets: { id: string; refs: number }[];
  episodes: EpisodeStatus[];
}

/** The series folder for a slug or a path. */
export function seriesDirFromArg(arg: string, root = repoRoot()): string {
  const direct = resolve(process.cwd(), arg);
  if (existsSync(join(direct, 'series.yaml'))) return direct;
  const named = join(root, 'series', arg);
  if (existsSync(join(named, 'series.yaml'))) return named;
  throw new ValidationError(`Series "${arg}" not found: neither ${direct} nor ${named} has a series.yaml.`);
}

/**
 * Collect the state of a series: its canon (characters with reference voice
 * and references, sets with references) and every episode, planned or not,
 * with its stage, spend, and length. Episodes are found in `projects/` next to
 * `series/`.
 */
export async function collectSeriesStatus(seriesDir: string): Promise<SeriesStatus> {
  const series = await readYamlFile(join(seriesDir, 'series.yaml'), SeriesSchema);
  const charactersPath = join(seriesDir, 'characters.yaml');
  const setsPath = join(seriesDir, 'sets.yaml');
  const characters = existsSync(charactersPath)
    ? (await readYamlFile(charactersPath, CharacterBibleSchema)).characters.map((character) => ({
        id: character.id,
        face: character.face,
        voice: (character.voice
          ? existsSync(resolve(seriesDir, character.voice.ref))
            ? 'ok'
            : 'missing'
          : 'none') as 'ok' | 'missing' | 'none',
        refs: character.refs.filter((ref) => existsSync(resolve(seriesDir, ref))).length,
      }))
    : [];
  const sets = existsSync(setsPath)
    ? (await readYamlFile(setsPath, SetBibleSchema)).sets.map((set) => ({
        id: set.id,
        refs: set.refs.filter((ref) => existsSync(resolve(seriesDir, ref))).length,
      }))
    : [];

  const projectsDir = join(seriesDir, '..', '..', 'projects');
  const found = new Map<number, EpisodeStatus>();
  for (const entry of existsSync(projectsDir) ? readdirSync(projectsDir, { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) continue;
    const dir = join(projectsDir, entry.name);
    if (!existsSync(join(dir, 'project.yaml'))) continue;
    let config;
    try {
      config = await readYamlFile(join(dir, 'project.yaml'), ProjectConfigSchema);
    } catch {
      continue;
    }
    if (config.kind !== 'episode' || config.series !== series.slug || config.episode === undefined) continue;
    const status: EpisodeStatus = { episode: config.episode, title: config.title, slug: config.slug, budgetUsd: config.budget_usd };
    try {
      const project = await loadProject(dir);
      status.stage = project.state.stage;
      status.status = project.state.status;
      status.next = nextStage(project.state)?.id ?? 'done';
      status.spentUsd = project.state.budget.spentUsd;
      status.durationSeconds = project.timing?.audio.duration;
    } catch (error) {
      status.error = (error as Error).message;
    }
    if (found.has(config.episode)) {
      status.error = `episode ${config.episode} also in projects/${found.get(config.episode)!.slug}`;
    }
    found.set(config.episode, status);
  }

  const episodes: EpisodeStatus[] = series.episodes.map(
    (planned) => found.get(planned.episode) ?? { episode: planned.episode, title: planned.title },
  );
  for (const [episode, status] of found) {
    if (!series.episodes.some((planned) => planned.episode === episode)) episodes.push(status);
  }
  episodes.sort((a, b) => a.episode - b.episode);
  return { series, dir: seriesDir, characters, sets, episodes };
}

export async function printSeriesStatus(seriesArg: string): Promise<void> {
  const status = await collectSeriesStatus(seriesDirFromArg(seriesArg));
  const { series } = status;
  console.log(`${series.title} (${series.slug})`);
  const master = series.formats.master;
  console.log(`Master: ${master.aspect} ${master.width}x${master.height} @ ${master.fps}fps`);
  const limits = series.limits;
  console.log(
    `Limits: ${limits.episode_seconds ? `episode ${limits.episode_seconds.min}–${limits.episode_seconds.max}s` : 'no episode length'}` +
      ` · ${limits.lipsync_seconds_max ? `lip-sync ≤ ${limits.lipsync_seconds_max}s` : 'no lip-sync limit'}`,
  );
  console.log(
    `Canon: ${status.characters.length} character(s), ${status.sets.length} set(s)` +
      (status.characters.length
        ? ` · ${status.characters.map((c) => `${c.id} [${c.face}, voice ${c.voice}, ${c.refs} ref(s)]`).join('; ')}`
        : ''),
  );
  if (status.sets.length) console.log(`Sets: ${status.sets.map((set) => `${set.id} [${set.refs} ref(s)]`).join('; ')}`);

  console.log('Ep  Slug                  Stage           Status    Spent / Budget     Length   Next');
  for (const episode of status.episodes) {
    const number = String(episode.episode).padEnd(3);
    if (!episode.slug) {
      console.log(`${number} ${'-'.padEnd(21)} not created: ${episode.title}`);
      continue;
    }
    if (episode.error) {
      console.log(`${number} ${episode.slug.padEnd(21)} error: ${episode.error}`);
      continue;
    }
    const money = `${formatUsd(episode.spentUsd ?? 0)} / ${formatUsd(episode.budgetUsd ?? 0)}`;
    const length = episode.durationSeconds !== undefined ? formatSeconds(episode.durationSeconds) : '-';
    console.log(
      `${number} ${episode.slug.padEnd(21)} ${(episode.stage ?? '-').padEnd(15)} ${(episode.status ?? '-').padEnd(9)} ${money.padEnd(18)} ${length.padEnd(8)} ${episode.next ?? '-'}`,
    );
  }
  const created = status.episodes.filter((episode) => episode.slug && !episode.error);
  const spent = created.reduce((sum, episode) => sum + (episode.spentUsd ?? 0), 0);
  const budget = created.reduce((sum, episode) => sum + (episode.budgetUsd ?? 0), 0);
  console.log(
    `Episodes: ${created.length} created of ${status.episodes.length} · ${formatUsd(spent)} spent / ${formatUsd(budget)} budgeted`,
  );
}
