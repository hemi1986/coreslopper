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
  readJsonFile,
  releaseIdentity,
  releaseTodos,
  repoRoot,
  unmarkedPlaceholders,
  type LoadedProject,
  type ReleaseManifest,
} from '@coreslopper/core';
import { shortProblems } from './release-files.js';
import { canvasProblems, probeMedia, videoFacts, videoProblems, wavProblems, type Prober } from './release-media.js';
import { projectFormats, releaseDir } from './release.js';
import { jpegInfo, thumbnailProblems } from './thumbnail-files.js';
import { loadUploadData, uploadPaths } from './upload-text.js';

export type CheckResult = 'PASS' | 'FAIL' | 'WARN' | 'TODO' | 'N/A';

export interface ReleaseCheck {
  name: string;
  result: CheckResult;
  evidence: string;
}

/** The texts every release folder has; `spotify.md` only for a music video. */
export function expectedTexts(music: boolean): string[] {
  return ['youtube.md', 'shorts.md', 'instagram.md', 'tiktok.md', ...(music ? ['spotify.md'] : []), 'release-plan.md'];
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
export async function releaseChecks(projectDir: string, probe: Prober = probeMedia): Promise<ReleaseCheck[]> {
  const project = await loadProject(projectDir);
  const music = project.config.kind !== 'episode';
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

  // thumbnails/ and shorts/.
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
    const problems = shortProblems({ name: file.path, ...facts });
    const thumb = file.path.replace(/-9x16\.mp4$/, '-thumb.jpg');
    if (!existsSync(at(thumb))) problems.push('no thumbnail');
    else problems.push(...(await thumbnailProblems(at(thumb), '9x16')).map((problem) => `thumbnail ${problem}`));
    if (problems.length) badShorts.push(`${file.path}: ${problems.join(', ')}`);
  }
  checks.push(
    badShorts.length
      ? check('Release Shorts', 'FAIL', badShorts.join('; '))
      : shorts.length < 3
        ? check('Release Shorts', 'TODO', `${shorts.length} of 3`)
        : check('Release Shorts', 'PASS', '3 Shorts, 9:16, at most 60 s, 1080x1920 thumbnails'),
  );

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
  const missingTexts = expectedTexts(music).filter((name) => !existsSync(at(`texts/${name}`)));
  const unmarked: string[] = [];
  let todoMarks = 0;
  for (const name of expectedTexts(music)) {
    if (!existsSync(at(`texts/${name}`))) continue;
    const text = await readFile(at(`texts/${name}`), 'utf8');
    unmarked.push(...unmarkedPlaceholders(text).map((line) => `${name}: ${line.trim()}`));
    todoMarks += text.split('\n').filter((line) => line.includes(`${TODO}:`)).length;
  }
  const textErrors: string[] = [];
  let textTodos = 0;
  if (existsSync(uploadPaths(project.paths.root).data)) {
    const problems = platformTextProblems(await loadUploadData(project.paths.root), platformLimits(await loadChannel(repoRoot())), { music });
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
        : check('Release texts', 'PASS', `${expectedTexts(music).length} files, limits kept`),
  );

  if (music) {
    const meta = await song(project);
    const todos = releaseTodos(project.config.release, await loadChannel(repoRoot()), releaseIdentity(project.config, meta));
    checks.push(todos.length ? check('Release metadata', 'TODO', todos.join('; ')) : check('Release metadata', 'PASS', 'release: block complete'));
  }
  return checks;
}
