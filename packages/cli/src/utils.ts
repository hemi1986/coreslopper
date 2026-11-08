import { resolve } from 'node:path';
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

export function projectDirFromArg(arg: string | undefined, fallback = 'projects/demo'): string {
  return resolve(process.cwd(), arg ?? fallback);
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
