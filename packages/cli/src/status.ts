import { existsSync } from 'node:fs';
import {
  effectiveBatchCap,
  formatUsd,
  loadProject,
  nextStage,
  remainingBudget,
  stageDefinition,
  stageTable,
} from '@coreslopper/core';
import { join, relative } from 'node:path';
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
      : 'Kind: music-video',
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
  console.log(`Next: ${next ? `${next.id} (${next.skills.join(', ')})${interactive ? ' · interactive' : ''}` : 'done'}`);
  if (!existsSync(loaded.paths.state)) console.log('Note: state.json does not exist yet; showing the initial state.');
}
