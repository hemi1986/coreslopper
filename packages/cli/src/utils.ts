import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ZodError } from 'zod';
import { BudgetError, ValidationError, formatZodError } from '@coreslopper/core';

export function printError(error: unknown): void {
  if (error instanceof ValidationError) {
    console.error(`✖ ${error.message}`);
    for (const detail of error.details) console.error(`  - ${detail}`);
    return;
  }
  if (error instanceof ZodError) {
    console.error('✖ Validation failed');
    for (const detail of formatZodError(error)) console.error(`  - ${detail}`);
    return;
  }
  if (error instanceof BudgetError) {
    console.error(`✖ Budget: ${error.message}`);
    return;
  }
  if (error instanceof Error) {
    console.error(`✖ ${error.message}`);
    return;
  }
  console.error(`✖ ${String(error)}`);
}

export async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    printError(error);
    process.exitCode = 1;
  }
}

/**
 * Resolve a project argument. A path to a project directory wins; otherwise a
 * bare slug resolves to `projects/<slug>`.
 */
export function projectDirFromArg(arg: string | undefined, fallback = 'projects/demo'): string {
  const direct = resolve(process.cwd(), arg ?? fallback);
  if (arg && !existsSync(join(direct, 'project.yaml'))) {
    const named = resolve(process.cwd(), 'projects', arg);
    if (existsSync(join(named, 'project.yaml'))) return named;
  }
  return direct;
}

export function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
