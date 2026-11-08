#!/usr/bin/env node
/**
 * Generates a deterministic, license-safe 12-second synthwave demo track.
 * No external dependencies: writes a 48 kHz / 16-bit / stereo PCM WAV.
 *
 * Usage: node scripts/fixtures/generate-audio.mjs projects/demo/audio/song.wav
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'projects/demo/audio/song.wav');
const sampleRate = 48_000;
const duration = 12;
const channels = 2;
const bpm = 120;
const beat = 60 / bpm;
const frames = Math.floor(sampleRate * duration);
const data = Buffer.alloc(frames * channels * 2);

function frac(value) {
  return value - Math.floor(value);
}

function noise(index) {
  return frac(Math.sin(index * 12.9898) * 43_758.5453) * 2 - 1;
}

function kick(t) {
  const local = t % beat;
  const env = Math.exp(-local * 18);
  const frequency = 52 + 78 * Math.exp(-local * 24);
  return Math.sin(2 * Math.PI * frequency * local) * env;
}

function hat(t) {
  const local = (t + beat / 2) % beat;
  const env = Math.exp(-local * 60);
  return noise(Math.floor(t * sampleRate)) * env * 0.22;
}

function bass(t) {
  const local = t % (beat * 2);
  const env = Math.exp(-local * 3.2);
  const notes = [55, 55, 65.41, 49];
  const note = notes[Math.floor(t / (beat * 2)) % notes.length];
  return Math.sin(2 * Math.PI * note * t) * env * 0.34;
}

function pad(t) {
  const local = t % beat;
  const duck = 0.35 + 0.65 * Math.min(1, local * 7);
  const chord = [220, 277.18, 329.63, 440];
  const index = Math.floor(t / (beat * 4)) % chord.length;
  const base = chord[index];
  return (
    (Math.sin(2 * Math.PI * base * t) +
      Math.sin(2 * Math.PI * base * 1.005 * t) +
      Math.sin(2 * Math.PI * base * 0.5 * t)) *
    0.055 *
    duck
  );
}

for (let i = 0; i < frames; i += 1) {
  const t = i / sampleRate;
  const beatPhase = t % beat;
  const kickSample = kick(t);
  const hatSample = hat(t);
  const bassSample = bass(t);
  const padSample = pad(t);
  const riser = t > 10 ? (t - 10) / 2 : 0;
  const lead = t > 6 ? Math.sin(2 * Math.PI * 659.25 * t) * 0.045 * Math.sin(Math.PI * ((t - 6) % 2)) : 0;
  const left = kickSample * 0.55 + hatSample * 0.7 + bassSample + padSample + lead + riser * 0.02;
  const right = kickSample * 0.55 + hatSample * 0.3 + bassSample + padSample * 0.92 + lead * 0.8 + riser * 0.02;
  const fade = Math.min(1, t / 0.05) * Math.min(1, (duration - t) / 0.3);
  data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(left * fade * 26000))), i * 4);
  data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(right * fade * 26000))), i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(channels, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * channels * 2, 28);
header.writeUInt16LE(channels * 2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([header, data]));
console.log(`Wrote ${output} (${duration}s, ${sampleRate} Hz, ${channels}ch, ${bpm} BPM)`);
