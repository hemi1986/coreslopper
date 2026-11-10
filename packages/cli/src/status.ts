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
  console.log(`Next: ${next ? `${next.id} (${next.skills.join(', ')})${interactive ? ' · interactive' : ''}` : 'done'}`);
  if (!existsSync(loaded.paths.state)) console.log('Note: state.json does not exist yet; showing the initial state.');
}
