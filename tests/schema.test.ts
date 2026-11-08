import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { z } from 'zod';
import {
  ProjectConfigSchema,
  StoryboardSchema,
  TimingSchema,
  readJsonFile,
  readYamlFile,
} from '@coreslopper/core';

describe('schemas', () => {
  it('parses the demo project, timing, and storyboard', async () => {
    const project = await readYamlFile(join(process.cwd(), 'projects/demo/project.yaml'), ProjectConfigSchema);
    const timing = await readJsonFile(join(process.cwd(), 'projects/demo/timing.json'), TimingSchema);
    const storyboard = await readYamlFile(join(process.cwd(), 'projects/demo/storyboard.yaml'), StoryboardSchema);
    expect(project.slug).toBe('demo');
    expect(timing.sections).toHaveLength(4);
    expect(storyboard.shots).toHaveLength(6);
  });

  it('generates a draft 2020-12 JSON Schema', () => {
    const json = z.toJSONSchema(StoryboardSchema, { target: 'draft-2020-12', io: 'input' });
    expect(json.$schema).toContain('2020-12');
    expect(json.type).toBe('object');
  });
});
