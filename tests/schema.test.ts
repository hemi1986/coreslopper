import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { z } from 'zod';
import {
  ProjectConfigSchema,
  StoryboardSchema,
  TimingSchema,
  BrandKitSchema,
  readJsonFile,
  readYamlFile,
} from '@coreslopper/core';

describe('schemas', () => {
  it('parses the demo project, timing, and storyboard', async () => {
    const project = await readYamlFile(join(process.cwd(), 'projects/demo/project.yaml'), ProjectConfigSchema);
    const timing = await readJsonFile(join(process.cwd(), 'projects/demo/timing.json'), TimingSchema);
    const storyboard = await readYamlFile(join(process.cwd(), 'projects/demo/storyboard.yaml'), StoryboardSchema);
    const brand = await readYamlFile(join(process.cwd(), 'brand/example/brand.yaml'), BrandKitSchema);
    expect(project.slug).toBe('demo');
    expect(timing.sections).toHaveLength(4);
    expect(storyboard.shots).toHaveLength(6);
    expect(brand.palette.primary).toBe('#ff2a6d');
  });

  it('accepts a shot focus point and rejects values outside 0–1', () => {
    const shot = {
      id: 'shot-001',
      section: 'intro',
      start: { type: 'section', id: 'intro' },
      end: { type: 'section', id: 'intro', edge: 'end' },
      source: 'ai-clip',
      description: 'mirror shot',
    };
    const parsed = StoryboardSchema.parse({ version: 1, shots: [{ ...shot, focus: { x: 0.2 } }] });
    expect(parsed.shots[0]!.focus).toEqual({ x: 0.2, y: 0.5 });
    expect(StoryboardSchema.parse({ version: 1, shots: [shot] }).shots[0]!.focus).toBeUndefined();
    expect(() => StoryboardSchema.parse({ version: 1, shots: [{ ...shot, focus: { x: 1.5 } }] })).toThrow();
  });

  it('generates a draft 2020-12 JSON Schema', () => {
    const json = z.toJSONSchema(StoryboardSchema, { target: 'draft-2020-12', io: 'input' });
    expect(json.$schema).toContain('2020-12');
    expect(json.type).toBe('object');
  });
});
