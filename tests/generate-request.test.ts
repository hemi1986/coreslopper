import { describe, expect, it } from 'vitest';
import { BatchItemSchema, toRequest, type ResolvedItem } from '../packages/cli/src/generate.js';

describe('generate request', () => {
  it('passes the resolved clip length, so a local lip-sync follows its vocal segment', () => {
    const item = BatchItemSchema.parse({
      operation: 'lipSync',
      role: 'video.lipsync',
      prompt: 'sings the supplied vocal audio',
      references: ['frame.png'],
      audio: 'assets/audio-segments/s01.mp3',
    });
    const resolved: ResolvedItem = {
      item,
      provider: 'comfyui',
      model: 'ltx25-lipsync-flf2v',
      params: {},
      pricing: { unit: 'request', usd: 0 },
      cost: 0,
      references: ['/p/frame.png'],
      audio: '/p/assets/audio-segments/s01.mp3',
      durationSeconds: 3.217,
    };
    const request = toRequest(resolved, { width: 1920, height: 1080 }, '/p/assets/out', '/p');
    expect(request).toMatchObject({
      operation: 'lipSync',
      model: 'ltx25-lipsync-flf2v',
      durationSeconds: 3.217,
      width: 1920,
      height: 1080,
      audio: '/p/assets/audio-segments/s01.mp3',
    });
  });

  it('passes the audio start of a lip-sync cut from the vocal stem', () => {
    const item = BatchItemSchema.parse({
      operation: 'lipSync',
      role: 'video.lipsync',
      prompt: 'Close-up, static camera. She sings the audio with accurate lip sync.',
      references: ['start.png', 'end.png'],
      audio: 'audio/stems/vocals.wav',
      audioStartSeconds: 61.2,
      durationSeconds: 3.4,
    });
    const resolved: ResolvedItem = {
      item,
      provider: 'comfyui',
      model: 'ltx25-lipsync-flf2v',
      params: {},
      pricing: { unit: 'request', usd: 0 },
      cost: 0,
      references: ['/p/start.png', '/p/end.png'],
      audio: '/p/audio/stems/vocals.wav',
      audioStartSeconds: 61.2,
      durationSeconds: 3.4,
    };
    expect(toRequest(resolved, { width: 1920, height: 1080 }, '/p/out', '/p')).toMatchObject({
      audioStartSeconds: 61.2,
      durationSeconds: 3.4,
      references: ['/p/start.png', '/p/end.png'],
    });
  });

  it('needs a duration for a lip-sync cut from the stem, and allows it only for lipSync', () => {
    const base = { role: 'video.lipsync', prompt: 'x', references: ['f.png'], audio: 'audio/stems/vocals.wav' };
    expect(() => BatchItemSchema.parse({ ...base, operation: 'lipSync', audioStartSeconds: 3 })).toThrow(/durationSeconds/);
    expect(() =>
      BatchItemSchema.parse({ ...base, operation: 'imageToVideo', audioStartSeconds: 3, durationSeconds: 2 }),
    ).toThrow(/only for lipSync/);
  });
});
