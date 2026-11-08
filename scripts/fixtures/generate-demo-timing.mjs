#!/usr/bin/env node
/**
 * Writes a deterministic timing fixture for the motion-only demo.
 * It models what the audio-analysis stage produces, without requiring
 * Demucs/WhisperX on a machine that only wants to run the render smoke test.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'projects/demo/timing.json');
const duration = 12;
const bpm = 120;
const beat = 60 / bpm;
const fps = 10;

const beats = Array.from({ length: Math.floor(duration / beat) + 1 }, (_, index) => Number((index * beat).toFixed(3)));
const downbeats = beats.filter((_, index) => index % 4 === 0);
const sections = [
  { id: 'intro', label: 'Intro', start: 0, end: 2, confidence: 0.99, sources: ['tag', 'energy'] },
  { id: 'verse_1', label: 'Verse 1', start: 2, end: 5, confidence: 0.98, sources: ['tag', 'energy'] },
  { id: 'chorus_1', label: 'Chorus 1', start: 5, end: 9, confidence: 0.99, sources: ['tag', 'energy'] },
  { id: 'outro', label: 'Outro', start: 9, end: 12, confidence: 0.97, sources: ['tag', 'energy'] },
];

const lines = [
  {
    id: 'l1',
    section: 'intro',
    start: 0.5,
    end: 1.6,
    text: 'Neon rain',
    words: [
      { text: 'Neon', start: 0.5, end: 0.9 },
      { text: 'rain', start: 1.0, end: 1.6 },
    ],
  },
  {
    id: 'l2',
    section: 'verse_1',
    start: 2.5,
    end: 4.6,
    text: 'City lights are calling',
    words: [
      { text: 'City', start: 2.5, end: 2.9 },
      { text: 'lights', start: 3.0, end: 3.4 },
      { text: 'are', start: 3.5, end: 3.9 },
      { text: 'calling', start: 4.0, end: 4.6 },
    ],
  },
  {
    id: 'l3',
    section: 'chorus_1',
    start: 5.5,
    end: 7.2,
    text: 'We are electric',
    words: [
      { text: 'We', start: 5.5, end: 5.9 },
      { text: 'are', start: 6.0, end: 6.4 },
      { text: 'electric', start: 6.5, end: 7.2 },
    ],
  },
  {
    id: 'l4',
    section: 'chorus_1',
    start: 7.4,
    end: 8.8,
    text: 'Run through the rain',
    words: [
      { text: 'Run', start: 7.4, end: 7.8 },
      { text: 'through', start: 7.9, end: 8.3 },
      { text: 'the', start: 8.4, end: 8.6 },
      { text: 'rain', start: 8.6, end: 8.8 },
    ],
  },
  {
    id: 'l5',
    section: 'outro',
    start: 9.5,
    end: 10.6,
    text: 'Neon hearts',
    words: [
      { text: 'Neon', start: 9.5, end: 9.9 },
      { text: 'hearts', start: 10.0, end: 10.6 },
    ],
  },
];

const energy = Array.from({ length: Math.floor(duration * fps) }, (_, index) => {
  const t = index / fps;
  const pulse = Math.max(0, 1 - ((t % beat) / beat) * 2);
  const base = t < 2 ? 0.22 : t < 5 ? 0.42 : t < 9 ? 0.78 : 0.3;
  const value = base + pulse * 0.16 + Math.sin(t * 1.7) * 0.04;
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
});

const timing = {
  version: 1,
  audio: { path: 'audio/song.wav', duration, sampleRate: 48_000 },
  bpm,
  beats,
  downbeats,
  onsets: beats,
  energy: { hop: 512, fps, values: energy },
  sections,
  lines,
  meta: {
    fixture: true,
    generatedBy: 'scripts/fixtures/generate-demo-timing.mjs',
    note: 'Synthetic demo timing; the real audio-analysis stage writes this shape from Demucs + WhisperX + librosa.',
  },
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(timing, null, 2)}\n`);
console.log(`Wrote ${output} (${duration}s, ${bpm} BPM, ${sections.length} sections, ${lines.length} lines)`);
