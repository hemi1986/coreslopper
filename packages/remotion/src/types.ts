import type { CharacterBible, ResolvedShot, StyleBible, Timing } from '@coreslopper/core';

export type FormatId = '16x9' | '9x16' | '1x1' | '4x5';

/** A brand font served from the public dir. */
export interface BrandFont {
  family: string;
  url: string;
  /** CSS font-weight value or range, e.g. "400" or "100 900". */
  weight: string;
  style: 'normal' | 'italic';
}

export interface VideoProps extends Record<string, unknown> {
  project: {
    slug: string;
    title: string;
  };
  format: FormatId;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  audioSrc?: string;
  style: StyleBible;
  characters: CharacterBible;
  timing: Timing;
  shots: ResolvedShot[];
  /** Brand fonts to load; when empty the example brand fonts are loaded. */
  fonts?: BrandFont[];
}

const fixtureTiming: Timing = {
  version: 1,
  audio: { path: '', duration: 2, sampleRate: 48_000 },
  bpm: 120,
  beats: [0, 0.5, 1, 1.5, 2],
  downbeats: [0, 1, 2],
  onsets: [0, 0.5, 1, 1.5, 2],
  energy: { hop: 512, fps: 100, values: [0.2, 0.35, 0.5, 0.7, 0.9, 0.7, 0.5, 0.4] },
  sections: [{ id: 'intro', label: 'Intro', start: 0, end: 2, confidence: 1, sources: ['fixture'] }],
  lines: [],
  meta: { fixture: true },
};

const fixtureShot: ResolvedShot = {
  id: 'shot-001',
  section: 'intro',
  start: { type: 'section', id: 'intro', edge: 'start', offset: 0 },
  end: { type: 'section', id: 'intro', edge: 'end', offset: 0 },
  source: 'motion',
  description: 'A minimal fixture shot.',
  camera: 'static',
  text: 'CORESLOPPER',
  highlights: ['CORESLOPPER'],
  transition: { type: 'cut', duration: 0 },
  refs: { style: [], characters: [] },
  motion: { component: 'TitleCard', props: {} },
  startSeconds: 0,
  endSeconds: 2,
  startFrame: 0,
  endFrame: 60,
  durationInFrames: 60,
};

export const defaultVideoProps: VideoProps = {
  project: { slug: 'fixture', title: 'Coreslopper fixture' },
  format: '16x9',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 60,
  style: {
    version: 1,
    name: 'Example',
    palette: {
      background: '#050510',
      surface: '#0d0d24',
      primary: '#ff2a6d',
      secondary: '#05d9e8',
      accent: '#f9f002',
      text: '#f8f8ff',
      muted: '#8b8ba7',
    },
    typography: {
      display: { family: 'Space Grotesk', weight: 700 },
      body: { family: 'Space Grotesk', weight: 400 },
      mono: { family: 'JetBrains Mono', weight: 400 },
    },
    look: { keywords: ['neon', 'rain', 'synthwave'], negative: [], references: [] },
    motion: { easing: 'easeOut', grain: 0.08 },
  },
  characters: { version: 1, characters: [] },
  timing: fixtureTiming,
  shots: [fixtureShot],
};
