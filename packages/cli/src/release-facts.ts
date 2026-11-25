import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ReleaseManifestSchema,
  buildReleasePlan,
  chaptersFromSections,
  formatId,
  loadChannel,
  loadProject,
  loadReleaseSchedule,
  platformLimits,
  readJsonFile,
  releaseIdentity,
  withReleaseDefaults,
  withUrls,
  type LoadedProject,
  type ReleaseCalendar,
  type ReleaseManifest,
  type ReleasePlan,
  type ReleaseStatus,
  type UploadData,
} from '@coreslopper/core';
import { loadCalendar } from './release-calendar.js';
import { loadStatus } from './release-records.js';
import { DERIVED_PATHS } from './release-images.js';
import { releaseLabels, type ReleaseTextInput } from './release-texts.js';
import { loadUploadData, uploadPaths } from './upload-text.js';
import { releaseDir, songJson, usedSoundCredits } from './release.js';

// The facts of one project's release: what the release folder, the board and
// the autopilot are made from. The board builds its posts on them, and one
// autopilot round reads them once instead of rebuilding the view per step.

export interface ReleaseFacts {
  /** The workspace root the project lives in, passed in, never re-derived from a project path. */
  root: string;
  project: LoadedProject;
  music: boolean;
  channel: Awaited<ReturnType<typeof loadChannel>>;
  limits: ReturnType<typeof platformLimits>;
  identity: ReturnType<typeof releaseIdentity>;
  data: UploadData | undefined;
  language: string;
  l: ReturnType<typeof releaseLabels>;
  /** The release folder of the project. */
  dir: string;
  manifest: ReleaseManifest | undefined;
  files: ReleaseTextInput['files'];
  calendar: ReleaseCalendar | undefined;
  status: ReleaseStatus;
  schedule: Awaited<ReturnType<typeof loadReleaseSchedule>>;
  input: ReleaseTextInput;
  /** The texts without live URLs; `releasePlan` fills them from a status. */
  planBase: ReleasePlan;
  /** The plan for the status read with the facts. */
  plan: ReleasePlan;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Project directories of the workspace that have a release folder or a calendar: the release routes and the autopilot. */
export async function releaseProjectDirs(root: string): Promise<string[]> {
  const dir = join(root, 'projects');
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && SLUG.test(entry.name) && existsSync(join(dir, entry.name, 'project.yaml')))
    .map((entry) => join(dir, entry.name))
    .filter((path) => existsSync(join(releaseDir(path), 'manifest.json')) || existsSync(join(path, 'review', 'calendar.yaml')))
    .sort();
}

/** The release-folder files the texts refer to, read back from manifest.json. */
export function filesFromManifest(manifest: ReleaseManifest | undefined, masterFormat: string): ReleaseTextInput['files'] {
  const files: ReleaseTextInput['files'] = { thumbnails: [], shorts: [] };
  if (!manifest) return files;
  const short = (name: string) => {
    let entry = files.shorts.find((item) => item.name === name);
    if (!entry) files.shorts.push((entry = { name, video: `shorts/${name}-9x16.mp4` }));
    return entry;
  };
  for (const file of manifest.files) {
    const name = /^shorts\/(.+?)-(9x16\.mp4|thumb\.jpg|tiktok\.jpg)$/.exec(file.path)?.[1];
    const format = file.kind === 'video' ? /-(\d+x\d+)\.mp4$/.exec(file.path)?.[1] : undefined;
    if (format) files.videos = { ...files.videos, [format]: file.path };
    if (file.kind === 'video' && file.path.endsWith(`-${masterFormat}.mp4`)) files.master = file.path;
    else if (file.kind === 'subtitles') files.subtitles = file.path;
    else if (file.kind === 'thumbnail') files.thumbnails.push(file.path);
    else if (file.kind === 'short' && name) short(name).video = file.path;
    else if (file.kind === 'short-thumbnail' && name) short(name).thumbnail = file.path;
    else if (file.kind === 'tiktok-cover' && name) short(name).tiktokCover = file.path;
    else if (file.kind === 'audio') files.audio = file.path;
    else if (file.kind === 'cover') files.cover = file.path;
    else if (file.kind === 'canvas') files.canvas = file.path;
    else if (file.kind === 'lyrics' && file.path.endsWith('.txt')) files.lyricsTxt = file.path;
    else if (file.kind === 'lyrics' && file.path.endsWith('.lrc')) files.lyricsLrc = file.path;
    else if (file.path === DERIVED_PATHS.announceStory) files.announceStory = file.path;
    else if (file.path === DERIVED_PATHS.announcePost) files.announcePost = file.path;
    else if (file.path === DERIVED_PATHS.teaser) files.teaser = file.path;
    else if (file.path === DERIVED_PATHS.story) files.story = file.path;
    else if (file.path === DERIVED_PATHS.feedImage) files.feedImage = file.path;
  }
  files.thumbnails.sort();
  files.shorts.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

/** The release plan of the facts with a status's live URLs; only the status is read again when it changes. */
export function releasePlan(facts: Pick<ReleaseFacts, 'planBase'>, status: Pick<ReleaseStatus, 'items'>): ReleasePlan {
  return withUrls(facts.planBase, { youtube: status.items.youtube?.url, spotify: status.items.song?.url });
}

/** Everything the release texts of a project are made from: the board and the autopilot read the same. */
export async function loadReleaseFacts(projectRoot: string, root: string): Promise<ReleaseFacts> {
  const project = await loadProject(projectRoot);
  const kind = project.config.kind;
  const music = kind === 'music-video';
  const channel = await loadChannel(root);
  const limits = platformLimits(channel);
  const song = await songJson(project);
  const releaseFacts = withReleaseDefaults(project.config.release, channel);
  const identity = releaseIdentity({ ...project.config, release: releaseFacts }, song);
  const data: UploadData | undefined = existsSync(uploadPaths(project.paths.root).data) ? await loadUploadData(project.paths.root).catch(() => undefined) : undefined;
  const language = project.config.release?.language ?? (typeof song.language === 'string' ? song.language : undefined) ?? data?.language ?? channel?.language ?? 'en';
  const l = releaseLabels(language);
  const dir = releaseDir(project.paths.root);
  const manifestPath = join(dir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? await readJsonFile(manifestPath, ReleaseManifestSchema).catch(() => undefined) : undefined;
  const files = filesFromManifest(manifest, formatId(project.config.formats.master.aspect));
  const calendar: ReleaseCalendar | undefined = await loadCalendar(project.paths.root).catch(() => undefined);
  const status = await loadStatus(project.paths.root);
  const schedule = await loadReleaseSchedule(root);
  const timing = project.effectiveTiming ?? project.timing;
  const meme = kind === 'meme';
  const input: ReleaseTextInput = {
    kind,
    language,
    slug: project.config.slug,
    artist: identity.artist,
    title: identity.title,
    data,
    release: releaseFacts,
    channel,
    limits,
    chapters: meme ? [] : (data?.main.chapters ?? (timing ? chaptersFromSections(timing) : [])),
    credits: meme ? await usedSoundCredits(project, root) : [],
    files,
    calendar,
    // A meme is a Short, never a Premiere.
    premiere: !meme && schedule.release.premiere,
    durationSeconds: timing?.audio.duration,
  };
  const handle = channel?.links.youtube?.handle;
  const planBase = buildReleasePlan({
    ...input,
    tiktokPointer: l.tt.overlayDefault(handle && !/<ID>/.test(handle) ? handle : 'YouTube'),
  });
  return { root, project, music, channel, limits, identity, data, language, l, dir, manifest, files, calendar, status, schedule, input, planBase, plan: releasePlan({ planBase }, status) };
}
