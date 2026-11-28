import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  CharacterBibleSchema,
  ChannelConfigSchema,
  BrandKitSchema,
  MicrositeSongSchema,
  ModelsConfigSchema,
  ProjectConfigSchema,
  PublishLogSchema,
  ReleaseManifestSchema,
  ReleaseCalendarSchema,
  ReleaseScheduleSchema,
  ReleaseStatusSchema,
  ReferencesSchema,
  ReviewNotesSchema,
  ReviewRepliesSchema,
  ReviewRoundSchema,
  AutopilotLogSchema,
  ScriptSchema,
  SeriesSchema,
  SeriesStateSchema,
  SetBibleSchema,
  StateSchema,
  StoryboardSchema,
  StyleBibleSchema,
  LibraryCharacterSchema,
  LibrarySetSchema,
  TakesSchema,
  TimingOverridesSchema,
  TimingSchema,
  UploadDataSchema,
} from '../packages/core/src/schema.js';
import { BenchCaseSchema, BenchConfigSchema, BenchTargetsFileSchema } from '../packages/core/src/bench.js';
import { PoseTrackSchema } from '../packages/core/src/pose.js';

const schemas = {
  project: ProjectConfigSchema,
  state: StateSchema,
  timing: TimingSchema,
  'timing-overrides': TimingOverridesSchema,
  storyboard: StoryboardSchema,
  style: StyleBibleSchema,
  characters: CharacterBibleSchema,
  'library-character': LibraryCharacterSchema,
  'library-set': LibrarySetSchema,
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
  'microsite-song': MicrositeSongSchema,
  'autopilot-log': AutopilotLogSchema,
  references: ReferencesSchema,
  'review-notes': ReviewNotesSchema,
  'review-round': ReviewRoundSchema,
  'review-replies': ReviewRepliesSchema,
  'bench-case': BenchCaseSchema,
  'bench-targets': BenchTargetsFileSchema,
  'bench-config': BenchConfigSchema,
  'pose-track': PoseTrackSchema,
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
