import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  CharacterBibleSchema,
  BrandKitSchema,
  ModelsConfigSchema,
  ProjectConfigSchema,
  ScriptSchema,
  SeriesSchema,
  SeriesStateSchema,
  SetBibleSchema,
  StateSchema,
  StoryboardSchema,
  StyleBibleSchema,
  TakesSchema,
  TimingOverridesSchema,
  TimingSchema,
} from '../packages/core/src/schema.js';

const schemas = {
  project: ProjectConfigSchema,
  state: StateSchema,
  timing: TimingSchema,
  'timing-overrides': TimingOverridesSchema,
  storyboard: StoryboardSchema,
  style: StyleBibleSchema,
  characters: CharacterBibleSchema,
  brand: BrandKitSchema,
  models: ModelsConfigSchema,
  series: SeriesSchema,
  'series-state': SeriesStateSchema,
  sets: SetBibleSchema,
  script: ScriptSchema,
  takes: TakesSchema,
};

const outputDir = join(process.cwd(), 'schema');
await mkdir(outputDir, { recursive: true });

for (const [name, schema] of Object.entries(schemas)) {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  });
  const path = join(outputDir, `${name}.schema.json`);
  await writeFile(path, `${JSON.stringify(jsonSchema, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path}`);
}
