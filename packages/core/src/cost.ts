import { BudgetError } from './errors.js';
import type { ModelPricing, ProjectConfig, State } from './schema.js';
import { remainingBudget } from './state.js';

export function estimateCost(units: number, pricing: ModelPricing): number {
  if (!Number.isFinite(units) || units < 0) throw new BudgetError('Cost units must be a non-negative number.');
  if (!Number.isFinite(pricing.usd) || pricing.usd < 0) {
    throw new BudgetError('Model pricing must be a known non-negative number.');
  }
  return Number((units * pricing.usd).toFixed(6));
}

export function effectiveBatchCap(config: Pick<ProjectConfig, 'batch_cap_usd'>, state: Pick<State, 'budget'>): number {
  const remaining = remainingBudget(state);
  const ratioCap = remaining * 0.3;
  const configured = config.batch_cap_usd ?? ratioCap;
  return Math.min(configured, remaining);
}

export function assertAffordable(
  config: Pick<ProjectConfig, 'batch_cap_usd'>,
  state: Pick<State, 'budget'>,
  estimatedUsd: number,
  label = 'batch',
): void {
  const remaining = remainingBudget(state);
  if (estimatedUsd > remaining + 1e-9) {
    throw new BudgetError(
      `${label} estimate $${estimatedUsd.toFixed(2)} exceeds the remaining project budget $${remaining.toFixed(2)}.`,
    );
  }
  const cap = effectiveBatchCap(config, state);
  if (estimatedUsd > cap + 1e-9) {
    throw new BudgetError(
      `${label} estimate $${estimatedUsd.toFixed(2)} exceeds the batch cap $${cap.toFixed(2)}. Raise batch_cap_usd or reduce the batch.`,
    );
  }
}

export function formatUsd(value: number): string {
  const absolute = Math.abs(value);
  const digits = absolute > 0 && absolute < 0.01 ? 4 : absolute < 1 ? 3 : 2;
  const fixed = value.toFixed(digits);
  const [whole, fraction = ''] = fixed.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return `$${whole}.${trimmed.padEnd(2, '0')}`;
}
