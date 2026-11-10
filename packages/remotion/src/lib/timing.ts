import type { Timing } from '@coreslopper/core';

export function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function energyAt(timing: Timing, seconds: number): number {
  if (timing.energy.values.length === 0) return 0;
  const index = Math.floor(seconds * timing.energy.fps);
  return timing.energy.values[Math.max(0, Math.min(timing.energy.values.length - 1, index))] ?? 0;
}

export function beatAt(timing: Timing, seconds: number): { index: number; progress: number; downbeat: boolean } {
  if (timing.beats.length === 0) return { index: 0, progress: 0, downbeat: false };
  let index = 0;
  for (let i = 0; i < timing.beats.length; i += 1) {
    if (timing.beats[i]! <= seconds) index = i;
    else break;
  }
  const current = timing.beats[index] ?? 0;
  // Without a tempo the last beat has no length and its progress stays 0.
  const next = timing.beats[index + 1] ?? (timing.bpm ? current + 60 / timing.bpm : current);
  const progress = next > current ? Math.max(0, Math.min(1, (seconds - current) / (next - current))) : 0;
  const downbeat = timing.downbeats.some((value) => Math.abs(value - current) < 0.02);
  return { index, progress, downbeat };
}

export function sectionAt(timing: Timing, seconds: number) {
  return timing.sections.find((section) => seconds >= section.start && seconds <= section.end);
}

export function lineForText(timing: Timing, sectionId: string, text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return undefined;
  return (
    timing.lines.find(
      (line) => line.section === sectionId && line.text.toLowerCase().includes(normalized),
    ) ??
    timing.lines.find((line) => line.text.toLowerCase() === normalized)
  );
}
