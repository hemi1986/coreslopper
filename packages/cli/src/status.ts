import { existsSync } from 'node:fs';
import {
  effectiveBatchCap,
  formatUsd,
  loadProject,
  nextStage,
  remainingBudget,
  stageTable,
} from '@coreslopper/core';

export async function printStatus(projectDir: string): Promise<void> {
  const loaded = await loadProject(projectDir);
  const state = loaded.state;
  console.log(`${loaded.config.title} (${loaded.config.slug})`);
  console.log(`Stage: ${state.stage} · Overall: ${state.status}`);
  console.log(stageTable(state).join('\n'));
  console.log(
    `Budget: ${formatUsd(state.budget.spentUsd)} spent / ${formatUsd(state.budget.totalUsd)} total · ${formatUsd(remainingBudget(state))} remaining · batch cap ${formatUsd(effectiveBatchCap(loaded.config, state))}`,
  );
  const next = nextStage(state);
  console.log(`Next: ${next ? `${next.id} (${next.skills.join(', ')})` : 'done'}`);
  if (!existsSync(loaded.paths.state)) console.log('Note: state.json does not exist yet; showing the initial state.');
}
