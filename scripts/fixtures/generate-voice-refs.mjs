#!/usr/bin/env node
/**
 * Writes deterministic, license-safe placeholder reference voices for a series
 * canon: one WAV per character with `voice.ref` in characters.yaml. The sound
 * is a synthetic, speech-like buzz with syllable envelopes, not a real voice;
 * it only lets the mock pipeline find the files. Real series record or design
 * their reference voices.
 *
 * Usage: node scripts/fixtures/generate-voice-refs.mjs series/demo-series
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';

const seriesDir = resolve(process.argv[2] ?? 'series/demo-series');
const bible = parse(readFileSync(join(seriesDir, 'characters.yaml'), 'utf8'));
const sampleRate = 48_000;

function hashSeed(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

function voiceWav(seed, seconds) {
  const frames = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(frames * 2);
  const pitch = 110 + (seed % 120); // 110–229 Hz fundamental
  const syllable = 0.18 + ((seed >> 8) % 8) / 100; // 0.18–0.25 s per syllable
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate;
    const local = (t % syllable) / syllable;
    const word = Math.floor(t / (syllable * 4)) % 5 === 4 ? 0 : 1; // short gaps between words
    const envelope = Math.sin(Math.PI * local) ** 2 * word;
    const vibrato = 1 + 0.01 * Math.sin(2 * Math.PI * 5 * t);
    let sample = 0;
    for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
      sample += Math.sin(2 * Math.PI * pitch * vibrato * harmonic * t) / harmonic;
    }
    const value = Math.max(-1, Math.min(1, sample * envelope * 0.25));
    data.writeInt16LE(Math.round(value * 32_767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

let written = 0;
for (const character of bible.characters ?? []) {
  if (!character.voice?.ref) continue;
  const output = join(seriesDir, character.voice.ref);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, voiceWav(hashSeed(character.id), 4));
  console.log(`Wrote ${output} (${character.name})`);
  written += 1;
}
console.log(`${written} reference voice(s) for ${seriesDir}`);
