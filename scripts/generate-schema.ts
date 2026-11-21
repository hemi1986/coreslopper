import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  CharacterBibleSchema,
  ChannelConfigSchema,
  BrandKitSchema,
  ModelsConfigSchema,
  ProjectConfigSchema,
  PublishLogSchema,
  ReleaseManifestSchema,
  ReleaseCalendarSchema,
  ReleaseScheduleSchema,
  ReleaseStatusSchema,
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
  UploadDataSchema,
} from '../packages/core/src/schema.js';
import { BenchCaseSchema, BenchConfigSchema, BenchTargetsFileSchema } from '../packages/core/src/bench.js';

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
  upload: UploadDataSchema,
  'publish-log': PublishLogSchema,
  channel: ChannelConfigSchema,
  'release-manifest': ReleaseManifestSchema,
  'release-schedule': ReleaseScheduleSchema,
  'release-calendar': ReleaseCalendarSchema,
  'release-status': ReleaseStatusSchema,
  'bench-case': BenchCaseSchema,
  'bench-targets': BenchTargetsFileSchema,
  'bench-config': BenchConfigSchema,
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
