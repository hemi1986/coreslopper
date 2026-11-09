import { describe, expect, it } from 'vitest';
import {
  ModelRoleSchema,
  ProjectConfigSchema,
  loadModelsConfig,
  providerForRole,
  resolveModelRole,
} from '@coreslopper/core';

const role = ModelRoleSchema.parse({
  provider: 'fal',
  model: 'fal-ai/flux-2-pro',
  params: { resolution: '1080p' },
  pricing: { unit: 'image', usd: 0.05 },
  alternatives: {
    higgsfield: {
      model: 'higgsfield-ai/soul/v2/standard',
      params: { resolution: '720p', send_seed: true },
      pricing: { unit: 'image', usd: 0.0032 },
    },
  },
});

const project = ProjectConfigSchema.parse({
  version: 1,
  slug: 'test',
  title: 'Test',
  created: '2026-11-08',
  workflow: { version: '0.1.0' },
  budget_usd: 50,
  providers: { image: 'higgsfield', video: 'fal', lipsync: 'fal', song: 'import' },
  formats: {
    master: { aspect: '16:9', width: 1920, height: 1080, fps: 30 },
    derivatives: [],
  },
});

describe('provider-specific model roles', () => {
  it('uses the base role for its configured provider', () => {
    const resolved = resolveModelRole(role, 'fal');
    expect(resolved.model).toBe('fal-ai/flux-2-pro');
    expect(resolved.params).toEqual({ resolution: '1080p' });
    expect(resolved.pricing?.usd).toBe(0.05);
  });

  it('uses the alternative slug, params, and price for another provider', () => {
    const resolved = resolveModelRole(role, 'higgsfield');
    expect(resolved.model).toBe('higgsfield-ai/soul/v2/standard');
    expect(resolved.params).toEqual({ resolution: '720p', send_seed: true });
    expect(resolved.pricing?.usd).toBe(0.0032);
  });

  it('allows a project override without an alternative when pricing is explicit', () => {
    const resolved = resolveModelRole(role, 'higgsfield', {
      model: 'custom/model',
      pricing: { unit: 'image', usd: 0.02 },
      params: { aspect_ratio: '9:16' },
    });
    expect(resolved.model).toBe('custom/model');
    expect(resolved.params).toEqual({ resolution: '720p', send_seed: true, aspect_ratio: '9:16' });
    expect(resolved.pricing?.usd).toBe(0.02);
  });

  it('refuses a provider without a model or price', () => {
    expect(() => resolveModelRole(role, 'unknown')).toThrow(/alternatives\.unknown/);
  });

  it('lets the mock provider run any role', () => {
    const resolved = resolveModelRole(role, 'mock');
    expect(resolved.model).toBe('fal-ai/flux-2-pro');
    expect(resolved.pricing?.usd).toBe(0.05);
  });

  it('routes roles and lip-sync to the configured providers', () => {
    expect(providerForRole(project, 'image.keyframe')).toBe('higgsfield');
    expect(providerForRole(project, 'video.image_to_video.quality')).toBe('fal');
    expect(providerForRole(project, 'video.lipsync')).toBe('fal');
  });

  it('ships Higgsfield alternatives with pricing for the default roles', async () => {
    const models = await loadModelsConfig();
    expect(models.roles['image.keyframe']?.alternatives.higgsfield?.model).toBe(
      'higgsfield-ai/soul/v2/standard',
    );
    expect(models.roles['video.image_to_video.quality']?.alternatives.higgsfield?.pricing?.unit).toBe(
      'second',
    );
    expect(models.roles['video.lipsync']?.alternatives.higgsfield).toBeUndefined();
  });
});

describe('ComfyUI model roles', () => {
  it('resolves the comfyui alternative of every video role without pricing', async () => {
    const models = await loadModelsConfig();
    for (const [name, videoRole] of Object.entries(models.roles)) {
      if (!name.startsWith('video.') || name === 'video.lipsync') continue;
      const resolved = resolveModelRole(videoRole, 'comfyui', {}, name);
      expect(resolved.model, name).toMatch(/^ltx-/);
      expect(resolved.params, name).not.toHaveProperty('reference_field');
    }
  });

  it('lets a project point a role at its own workflow without a price', () => {
    const resolved = resolveModelRole(role, 'comfyui', { model: 'my-wan-i2v' });
    expect(resolved.model).toBe('my-wan-i2v');
    expect(resolved.pricing).toBeUndefined();
  });
});
