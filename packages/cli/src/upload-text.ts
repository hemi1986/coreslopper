import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  UploadDataSchema,
  readYamlFile,
  writeTextAtomic,
  type UploadData,
  type UploadMain,
  type UploadShort,
} from '@coreslopper/core';

// `review/upload.md` is rendered from `review/upload.yaml`; the bold labels
// are ones `parseUploadText` in release-files.ts reads.

/** The upload data and text of a project. */
export function uploadPaths(projectDir: string): { data: string; text: string; log: string } {
  const review = join(resolve(projectDir), 'review');
  return { data: join(review, 'upload.yaml'), text: join(review, 'upload.md'), log: join(review, 'publish.json') };
}

export async function loadUploadData(projectDir: string): Promise<UploadData> {
  return readYamlFile(uploadPaths(projectDir).data, UploadDataSchema);
}

interface Labels {
  heading: string;
  main: string;
  shorts: string;
  file: string;
  title: string;
  thumbnail: string;
  thumbnails: string;
  description: string;
  tags: string;
  platforms: string;
  related: string;
  synthetic: (yes: boolean) => string;
  kids: (yes: boolean) => string;
  pasted: string;
  pointer: string;
}

const LABELS: Record<string, Labels> = {
  en: {
    heading: 'Upload package',
    main: 'Main video',
    shorts: 'Shorts',
    file: 'File',
    title: 'Title',
    thumbnail: 'Thumbnail',
    thumbnails: 'Thumbnails',
    description: 'Description',
    tags: 'Tags',
    platforms: 'Platforms',
    related: 'Related video = main video',
    synthetic: (yes) => `"Altered or synthetic content": ${yes ? 'Yes' : 'No'}`,
    kids: (yes) => (yes ? 'Made for kids' : 'Not made for kids'),
    pasted: 'Description, hashtags, and tags pasted',
    pointer: 'The complete package, with texts for every platform, is in `renders/release/` (`npm run cli -- release`); start with its README.md.',
  },
  de: {
    heading: 'Upload-Paket',
    main: 'Hauptvideo',
    shorts: 'Shorts',
    file: 'Datei',
    title: 'Titel',
    thumbnail: 'Thumbnail',
    thumbnails: 'Thumbnails',
    description: 'Beschreibung',
    tags: 'Tags',
    platforms: 'Plattformen',
    related: 'Verwandtes Video = Hauptvideo',
    synthetic: (yes) => `„Veränderte oder synthetische Inhalte“: ${yes ? 'Ja' : 'Nein'}`,
    kids: (yes) => (yes ? 'Speziell für Kinder' : 'Nicht speziell für Kinder'),
    pasted: 'Beschreibung, Hashtags und Tags eingefügt',
    pointer: 'Das vollständige Paket mit den Texten für jede Plattform liegt in `renders/release/` (`npm run cli -- release`); am besten mit dessen README.md beginnen.',
  },
};

/** Labels for a BCP-47 language; languages without a set fall back to English, which `qa` reads too. */
export function uploadLabels(language: string): Labels {
  return LABELS[language.toLowerCase().split(/[-_]/)[0] ?? 'en'] ?? LABELS.en!;
}

/** The path the user uploads from: the real path when it lies behind a media-drive symlink, else the project path. */
function displayPath(projectDir: string, file: string): string {
  const absolute = isAbsolute(file) ? file : join(projectDir, file);
  if (!existsSync(absolute)) return file;
  const real = realpathSync(absolute);
  const root = realpathSync(projectDir);
  return real.startsWith(`${root}/`) || real === root ? relative(root, real) : real;
}

function itemBlock(
  projectDir: string,
  item: UploadMain | UploadShort,
  labels: Labels,
  extra: { thumbnails?: string[]; related: boolean },
): string[] {
  const lines = [`**${labels.file}:** \`${displayPath(projectDir, item.file)}\``];
  if (extra.thumbnails?.length) {
    lines.push(`**${labels.thumbnails}:** ${extra.thumbnails.map((thumb) => `\`${thumb}\``).join(', ')}`);
  } else if (item.thumbnail) {
    lines.push(`**${labels.thumbnail}:** \`${item.thumbnail}\``);
  }
  lines.push(`**${labels.title}:** ${item.title}`, `**${labels.platforms}:** ${item.platforms.join(', ')}`, '');
  lines.push(`**${labels.description}:**`, '', item.description.trim(), '', item.hashtags.join(' '), '');
  if (item.tags.length) lines.push(`**${labels.tags}:** ${item.tags.join(', ')}`, '');
  if (extra.related) lines.push(`- [ ] ${labels.related}`);
  lines.push(`- [ ] ${labels.synthetic(item.synthetic_media)}`, `- [ ] ${labels.kids(item.made_for_kids)}`, `- [ ] ${labels.pasted}`, '');
  return lines;
}

/** Render `review/upload.md` from the upload data. `seconds` adds a Short's length to its heading. */
export function renderUploadText(
  projectDir: string,
  data: UploadData,
  seconds: (file: string) => number | undefined = () => undefined,
): string {
  const labels = uploadLabels(data.language);
  const main = data.main;
  const lines = [
    `# ${labels.heading} — ${main.title}`,
    '',
    `> ${labels.pointer}`,
    '',
    `## ${labels.main}`,
    '',
    ...itemBlock(projectDir, main, labels, {
      thumbnails: [...(main.thumbnail ? [main.thumbnail] : []), ...main.alternate_thumbnails],
      related: false,
    }),
  ];
  if (data.shorts.length) {
    lines.push(`## ${labels.shorts}`, '');
    for (const short of data.shorts) {
      const length = seconds(isAbsolute(short.file) ? short.file : join(projectDir, short.file));
      const heading = [short.name, short.moment ? `— ${short.moment}` : '', length ? `(${Math.round(length)} s)` : '']
        .filter(Boolean)
        .join(' ');
      lines.push(`### ${heading}`, '', ...itemBlock(projectDir, short, labels, { related: true }));
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Read `review/upload.yaml`, write `review/upload.md`, and return its path. */
export async function writeUploadText(
  projectDir: string,
  seconds?: (file: string) => number | undefined,
): Promise<string> {
  const data = await loadUploadData(projectDir);
  const { text } = uploadPaths(projectDir);
  await writeTextAtomic(text, renderUploadText(resolve(projectDir), data, seconds));
  return text;
}
