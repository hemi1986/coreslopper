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
      model: 'ltx-av',
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
      model: 'ltx-av',
      durationSeconds: 3.217,
      width: 1920,
      height: 1080,
      audio: '/p/assets/audio-segments/s01.mp3',
    });
  });
});
