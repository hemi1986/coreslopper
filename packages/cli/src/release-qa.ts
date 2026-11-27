import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ReleaseManifestSchema,
  TODO,
  hashFileStream,
  loadChannel,
  loadProject,
  platformLimits,
  platformTextProblems,
  releaseForm,
  readJsonFile,
  releaseIdentity,
  releaseTodos,
  repoRoot,
  soundLicenceTodos,
  unmarkedPlaceholders,
  type LoadedProject,
  type ReleaseManifest,
  type ReleasePlan,
  withReleaseDefaults,
} from '@coreslopper/core';
import { shortProblems, verticalVersionProblems } from './release-files.js';
import { canvasProblems, probeMedia, videoFacts, videoProblems, wavProblems, type Prober } from './release-media.js';
import { projectFormats, releaseDir, usedLibrarySounds } from './release.js';
import { releaseLabels } from './release-texts.js';
import { jpegInfo, thumbnailProblems } from './thumbnail-files.js';
import { loadUploadData, uploadPaths } from './upload-text.js';

export type CheckResult = 'PASS' | 'FAIL' | 'WARN' | 'TODO' | 'N/A';

export interface ReleaseCheck {
  name: string;
  result: CheckResult;
  evidence: string;
}

/**
 * The texts every release folder has, read from the plan: `spotify.md` only for
 * a music video, `linkedin.md` only when the plan holds a LinkedIn post.
 */
export function expectedTexts(plan: Pick<ReleasePlan, 'kind' | 'posts' | 'shape'> | 'music-video' | 'episode' | 'meme'): string[] {
  const kind = typeof plan === 'string' ? plan : plan.kind;
  if (kind === 'meme') return ['youtube.md', 'tiktok.md', 'instagram.md', 'release-plan.md'];
  if (typeof plan !== 'string' && plan.shape === 'short-episode') return ['youtube.md', 'tiktok.md', 'instagram.md', 'x.md', 'release-plan.md'];
  const linkedin = typeof plan !== 'string' && plan.posts.some((post) => post.id === 'linkedin');
  return ['youtube.md', 'shorts.md', 'instagram.md', 'tiktok.md', ...(kind === 'music-video' ? ['spotify.md'] : []), 'x.md', ...(linkedin ? ['linkedin.md'] : []), 'release-plan.md'];
}

const check = (name: string, result: CheckResult, evidence: string): ReleaseCheck => ({ name, result, evidence });

async function song(project: LoadedProject): Promise<{ duration?: number; artist?: string; title?: string }> {
  try {
    return JSON.parse(await readFile(project.paths.song, 'utf8')) as { duration?: number };
  } catch {
    return {};
  }
}

/**
 * Check `renders/release/` completely: files against the manifest, formats
 * against project.yaml and the current renders, thumbnails, Shorts, WAV,
 * cover, canvas, lyrics, texts, and the release metadata. Gaps the user fills
 * in (metadata, missing texts) are TODO, never FAIL.
 */
export async function releaseChecks(projectDir: string, probe: Prober = probeMedia, options: { root?: string } = {}): Promise<ReleaseCheck[]> {
  const project = await loadProject(projectDir);
  const root = options.root ?? repoRoot();
  const kind = project.config.kind;
  const music = kind === 'music-video';
  const meme = kind === 'meme';
  const sounds = meme ? await usedLibrarySounds(project, root) : [];
  const credits = sounds.map((sound) => sound.credit).filter((credit): credit is string => Boolean(credit));
  const dir = releaseDir(project.paths.root);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return [check('Release package', 'TODO', 'renders/release/ is missing; run npm run cli -- release')];
  }
  let manifest: ReleaseManifest;
  try {
    manifest = await readJsonFile(manifestPath, ReleaseManifestSchema);
  } catch (error) {
    return [check('Release package', 'FAIL', `manifest.json is invalid: ${(error as Error).message}`)];
  }
  const checks: ReleaseCheck[] = [];
  const plan = manifest.plan;
  const at = (path: string) => join(dir, path);
  const byKind = (kind: string) => manifest.files.filter((file) => file.kind === kind);

  // Every manifest entry is on disk with its recorded hash.
  const changed: string[] = [];
  for (const file of manifest.files) {
    if (!existsSync(at(file.path))) changed.push(`${file.path} missing`);
    else if ((await hashFileStream(at(file.path))) !== file.sha256) changed.push(`${file.path} changed`);
  }
  checks.push(
    changed.length
      ? check('Release files', 'FAIL', `${changed.join('; ')}; run release again`)
      : check('Release files', 'PASS', `${manifest.files.length} files match manifest.json`),
  );

  // video/: each format with the project's size, frame rate, and length, and the bytes of the current render.
  const duration = project.effectiveTiming?.audio.duration ?? project.timing?.audio.duration;
  const form = releaseForm({ kind, master: project.config.formats.master, durationSeconds: (project.effectiveTiming ?? project.timing)?.audio.duration });
  const formatIssues: string[] = [];
  const formatTodos: string[] = [];
  for (const format of projectFormats(project)) {
    const path = `video/${project.config.slug}-${format.id}.mp4`;
    if (!existsSync(at(path))) {
      formatTodos.push(`${path} missing`);
      continue;
    }
    const problems = videoProblems(probe(at(path)), { ...format, duration });
    const render = join(project.paths.root, 'renders', `${format.id}.mp4`);
    const hash = await hashFileStream(at(path));
    if (!existsSync(render) || (await hashFileStream(render)) !== hash) problems.push(`not the current renders/${format.id}.mp4`);
    const recorded = project.state.artifacts[`render:renders/${format.id}.mp4:sha256`];
    if (recorded && recorded !== hash) problems.push('differs from the render recorded in state.json');
    if (problems.length) formatIssues.push(`${path}: ${problems.join(', ')}`);
  }
  checks.push(
    formatIssues.length
      ? check('Release formats', 'FAIL', formatIssues.join('; '))
      : formatTodos.length
        ? check('Release formats', 'TODO', `${formatTodos.join('; ')}; run release`)
        : check('Release formats', 'PASS', `${projectFormats(project).map((format) => format.id).join(', ')}: size, fps, length, current render`),
  );

  // thumbnails/ and shorts/; a meme has one 9:16 cover and no Shorts.
  if (meme) {
    const cover = byKind('cover')[0];
    if (!cover) checks.push(check('Release cover', 'TODO', 'cover/<slug>-1080x1920.jpg is missing'));
    else {
      const info = jpegInfo(await readFile(at(cover.path)));
      const problems = !info
        ? ['not a JPEG']
        : [...(info.width !== 1080 || info.height !== 1920 ? [`${info.width}x${info.height}, expected 1080x1920`] : []), ...(info.components !== 3 ? [`${info.components} colour components, expected RGB`] : [])];
      checks.push(problems.length ? check('Release cover', 'FAIL', problems.join(', ')) : check('Release cover', 'PASS', '1080x1920 RGB JPEG'));
    }
    const licenceTodos = soundLicenceTodos(sounds);
    checks.push(
      licenceTodos.length
        ? check('Release sounds', 'TODO', licenceTodos.join('; '))
        : check('Release sounds', 'PASS', `${sounds.length} library sound(s), licence and credit cleared`),
    );
  } else {
    const thumbs = byKind('thumbnail');
    const badThumbs: string[] = [];
    for (const file of thumbs) {
      const problems = await thumbnailProblems(at(file.path), '16x9');
      if (problems.length) badThumbs.push(`${file.path}: ${problems.join(', ')}`);
    }
    checks.push(
      badThumbs.length
        ? check('Release thumbnails', 'FAIL', badThumbs.join('; '))
        : thumbs.length < 3
          ? check('Release thumbnails', 'TODO', `${thumbs.length} of 3`)
          : check('Release thumbnails', 'PASS', '3 JPEGs, 1280x720, under 2 MB'),
    );
    const shorts = byKind('short');
    const badShorts: string[] = [];
    for (const file of shorts) {
      const facts = videoFacts(probe(at(file.path)));
      // The vertical version is the whole episode, up to 3 minutes; a cut Short at most 60 s.
      const problems = file.spec.wholeEpisode === true ? verticalVersionProblems({ name: file.path, ...facts }) : shortProblems({ name: file.path, ...facts });
      const thumb = file.path.replace(/-9x16\.mp4$/, '-thumb.jpg');
      if (!existsSync(at(thumb))) problems.push('no thumbnail');
      else problems.push(...(await thumbnailProblems(at(thumb), '9x16')).map((problem) => `thumbnail ${problem}`));
      const tiktok = file.path.replace(/-9x16\.mp4$/, '-tiktok.jpg');
      if (existsSync(at(tiktok))) problems.push(...(await thumbnailProblems(at(tiktok), '3x4')).map((problem) => `TikTok cover ${problem}`));
      if (problems.length) badShorts.push(`${file.path}: ${problems.join(', ')}`);
    }
    // A horizontal episode up to 3 minutes has exactly one Short: its vertical version (ADR 0057).
    const verticalVersion = form.shorts === 'vertical-version';
    const strays = verticalVersion ? shorts.filter((file) => file.spec.wholeEpisode !== true).map((file) => file.path) : [];
    if (strays.length) badShorts.push(`${strays.join(', ')}: a cut Short beside the vertical version; run release again`);
    const expected = verticalVersion ? 1 : 3;
    checks.push(
      badShorts.length
        ? check('Release Shorts', 'FAIL', badShorts.join('; '))
        : shorts.length < expected
          ? check('Release Shorts', 'TODO', verticalVersion ? `the vertical version shorts/${project.config.slug}-9x16.mp4 is missing; run release` : `${shorts.length} of 3`)
          : check('Release Shorts', 'PASS', verticalVersion ? 'the vertical version, 9:16, at most 180 s, 1080x1920 thumbnail' : '3 Shorts, 9:16, at most 60 s, 1080x1920 thumbnails'),
    );
  }

  if (music) {
    const meta = await song(project);
    const wav = byKind('audio')[0];
    if (!wav) checks.push(check('Release audio', existsSync(join(project.paths.root, 'audio', 'song.wav')) ? 'FAIL' : 'TODO', 'no WAV in audio/'));
    else {
      const problems = wavProblems(probe(at(wav.path)), typeof meta.duration === 'number' ? meta.duration : undefined);
      checks.push(problems.length ? check('Release audio', 'FAIL', `${wav.path}: ${problems.join(', ')}`) : check('Release audio', 'PASS', `${wav.path}: PCM, ≥ 44.1 kHz, stereo, length = song.json`));
    }

    const cover = byKind('cover')[0];
    if (!cover) checks.push(check('Release cover', 'TODO', 'streaming/cover-3000x3000.jpg is missing'));
    else {
      const info = jpegInfo(await readFile(at(cover.path)));
      const problems = !info
        ? ['not a JPEG']
        : [
            ...(info.width !== 3000 || info.height !== 3000 ? [`${info.width}x${info.height}, expected 3000x3000`] : []),
            ...(info.components !== 3 ? [`${info.components} colour components, expected RGB`] : []),
          ];
      checks.push(problems.length ? check('Release cover', 'FAIL', problems.join(', ')) : check('Release cover', 'PASS', '3000x3000 RGB JPEG (art director reviews it with the thumbnails)'));
    }

    const canvas = byKind('canvas')[0];
    if (!canvas) checks.push(check('Release canvas', 'TODO', 'streaming/canvas-9x16.mp4 is missing'));
    else {
      const problems = canvasProblems(probe(at(canvas.path)));
      const lyricsOnScreen = manifest.todos.find((todo) => todo.includes('canvas window'));
      checks.push(
        problems.length
          ? check('Release canvas', 'FAIL', problems.join(', '))
          : lyricsOnScreen
            ? check('Release canvas', 'TODO', `meets the spec, but ${lyricsOnScreen}`)
            : check('Release canvas', 'PASS', '3–8 s, 9:16, ≥ 720 px, silent, no lyrics in the window'),
      );
    }

    const lyrics = manifest.files.filter((file) => file.kind === 'lyrics');
    const txt = lyrics.find((file) => file.path.endsWith('.txt'));
    const tagged = txt ? (await readFile(at(txt.path), 'utf8')).split('\n').some((line) => /^\s*\[[^\]]*\]\s*$/.test(line)) : false;
    checks.push(
      !txt
        ? check('Release lyrics', 'TODO', 'streaming/lyrics.txt is missing')
        : tagged
          ? check('Release lyrics', 'FAIL', 'lyrics.txt still has section tags')
          : check('Release lyrics', 'PASS', lyrics.map((file) => file.path).join(', ')),
    );
  }

  // texts/: every file present, limits kept, placeholders marked.
  const texts = expectedTexts(plan ?? kind);
  const missingTexts = texts.filter((name) => !existsSync(at(`texts/${name}`)));
  const unmarked: string[] = [];
  let todoMarks = 0;
  for (const name of texts) {
    if (!existsSync(at(`texts/${name}`))) continue;
    const text = await readFile(at(`texts/${name}`), 'utf8');
    unmarked.push(...unmarkedPlaceholders(text).map((line) => `${name}: ${line.trim()}`));
    todoMarks += text.split('\n').filter((line) => line.includes(`${TODO}:`)).length;
  }
  const textErrors: string[] = [];
  let textTodos = 0;
  if (existsSync(uploadPaths(project.paths.root).data)) {
    const data = await loadUploadData(project.paths.root);
    const channel = await loadChannel(root);
    const handle = channel?.links.youtube?.handle;
    const durationSeconds = (project.effectiveTiming ?? project.timing)?.audio.duration;
    const problems = platformTextProblems(data, platformLimits(channel), {
      shape: form.shape,
      shorts: form.shorts,
      slug: project.config.slug,
      credits,
      durationSeconds,
      tiktokPointer: releaseLabels(data.language).tt.overlayDefault(handle && !/<ID>/.test(handle) ? handle : 'YouTube'),
    });
    textErrors.push(...problems.errors);
    textTodos = problems.missing.length;
  } else textTodos += 1;
  checks.push(
    missingTexts.length || textErrors.length || unmarked.length
      ? check('Release texts', 'FAIL', [
          ...missingTexts.map((name) => `texts/${name} missing`),
          ...textErrors,
          ...unmarked.map((line) => `<ID> without TODO: ${line}`),
        ].join('; '))
      : textTodos || todoMarks
        ? check('Release texts', 'TODO', `${todoMarks} TODO line(s) in texts/; ${textTodos} text(s) still to write in review/upload.yaml`)
        : check('Release texts', 'PASS', `${texts.length} files, limits kept`),
  );

  if (music) {
    const meta = await song(project);
    const channel = await loadChannel(root);
    const facts = withReleaseDefaults(project.config.release, channel);
    const todos = releaseTodos(facts, channel, releaseIdentity({ ...project.config, release: facts }, meta));
    checks.push(todos.length ? check('Release metadata', 'TODO', todos.join('; ')) : check('Release metadata', 'PASS', 'release: block complete'));
  }
  return checks;
}
