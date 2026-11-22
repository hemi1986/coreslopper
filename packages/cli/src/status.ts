import { existsSync, readFileSync } from 'node:fs';
import {
  effectiveBatchCap,
  formatUsd,
  loadProject,
  nextStage,
  releasedPublicly,
  remainingBudget,
  setupSkill,
  stageDefinition,
  stageTable,
} from '@coreslopper/core';
import { join, relative } from 'node:path';
import { openRoundSummaries } from './board-review.js';
import { listThumbnails } from './thumbnail-files.js';
import { listShorts, shortName, shortPaths } from './release-files.js';

export async function printStatus(projectDir: string): Promise<void> {
  const loaded = await loadProject(projectDir);
  const { config, state } = loaded;
  console.log(`${config.title} (${config.slug})`);
  // The kind decides the stage list; /video-next reads it from this line.
  console.log(
    config.kind === 'episode'
      ? `Kind: episode · series ${config.series} · episode ${config.episode}`
      : `Kind: ${config.kind}`,
  );
  console.log(`Stage: ${state.stage} · Overall: ${state.status}`);
  console.log(stageTable(state).join('\n'));
  console.log(
    `Budget: ${formatUsd(state.budget.spentUsd)} spent / ${formatUsd(state.budget.totalUsd)} total · ${formatUsd(remainingBudget(state))} remaining · batch cap ${formatUsd(effectiveBatchCap(config, state))}`,
  );
  const next = nextStage(state);
  const interactive = next && stageDefinition(next.id, state.kind)?.interactive;
  const thumbnails = await listThumbnails(loaded.paths.renders);
  if (thumbnails.length) {
    console.log(`Thumbnails: ${thumbnails.map((file) => relative(loaded.paths.root, file)).join(', ')}`);
  }
  // The rest of the release package: Shorts with their thumbnails, and the upload text.
  const shorts = await listShorts(loaded.paths.renders);
  if (shorts.length) {
    const entries = shorts.map((video) => {
      const thumb = existsSync(shortPaths(loaded.paths.renders, shortName(video)!).thumbnail) ? ' + thumb' : '';
      return `${relative(loaded.paths.root, video)}${thumb}`;
    });
    console.log(`Shorts: ${entries.join(', ')}`);
  }
  const upload = join(loaded.paths.review, 'upload.md');
  if (existsSync(upload)) console.log(`Upload text: ${relative(loaded.paths.root, upload)}`);
  const releaseManifest = join(loaded.paths.renders, 'release', 'manifest.json');
  // An internal project has no release folder and is finished after qa-export (/video-next reads this line).
  if (!releasedPublicly(config)) console.log('Release: none · distribution: internal, not released publicly');
  else if (existsSync(releaseManifest)) {
    try {
      const manifest = JSON.parse(readFileSync(releaseManifest, 'utf8')) as { files?: unknown[]; todos?: unknown[] };
      console.log(`Release: renders/release/ · ${manifest.files?.length ?? 0} files · ${manifest.todos?.length ?? 0} TODO(s)`);
    } catch {
      console.log('Release: renders/release/manifest.json is unreadable; run release');
    }
  }
  // An open review round is answered before the next stage (/video-next reads this line).
  for (const line of await openRoundSummaries(projectDir)) console.log(`Review: ${line}`);
  // An interactive stage names the setup skill's command, as the board's production view does.
  const command = interactive ? ` · interactive · run /${setupSkill(state.kind)} ${config.slug}` : '';
  console.log(`Next: ${next ? `${next.id} (${next.skills.join(', ')})${command}` : 'done'}`);
  if (!existsSync(loaded.paths.state)) console.log('Note: state.json does not exist yet; showing the initial state.');
}
