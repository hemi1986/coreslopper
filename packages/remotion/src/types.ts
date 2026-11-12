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

/** A chat line of an episode script, timed by the effective timing, for ChatWindow. */
export interface ChatMessage {
  id: string;
  /** The sender's display name from the character bible. */
  sender: string;
  /** The message as shown on screen. */
  text: string;
  start: number;
  end: number;
}

/** A burned-in subtitle cue (seconds on the episode timeline). */
export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
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
  /** Episode only: the chat lines and the typing speed. */
  chat?: { cps: number; hold: number; messages: ChatMessage[] };
  /** Burned-in subtitles; absent for a render without them. */
  subtitles?: SubtitleCue[];
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
  refs: { style: [], characters: [], sets: [] },
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

/** Props of the Thumbnail composition (one still); colours are resolved by the CLI. */
export interface ThumbnailProps extends Record<string, unknown> {
  /** `16x9` (1280x720, main video) or `9x16` (1080x1920, Short); default `16x9`. */
  format?: '16x9' | '9x16';
  /** Public path of the source still; empty renders the background colour only. */
  still: string;
  /** Hook lines, already in capitals. */
  lines: string[];
  tag?: string;
  layout: 'left' | 'right' | 'bottom';
  /** The point of the still (fractions 0–1) that lands on the face side. */
  focus: { x: number; y: number };
  zoom: number;
  hookFont: { family: string; weight: number };
  tagFont: { family: string; weight: number };
  colors: {
    /** Frame fill behind the still and the scrim towards the text side. */
    background: string;
    /** First line: slab and text. */
    slab: string;
    slabText: string;
    /** Further lines and the tag: slab and text. */
    accent: string;
    accentText: string;
  };
  fonts: BrandFont[];
}

export const defaultThumbnailProps: ThumbnailProps = {
  format: '16x9',
  still: '',
  lines: ['CORESLOPPER'],
  tag: 'DEMO',
  layout: 'left',
  focus: { x: 0.5, y: 0.4 },
  zoom: 1,
  hookFont: { family: 'Space Grotesk', weight: 700 },
  tagFont: { family: 'JetBrains Mono', weight: 700 },
  colors: { background: '#050510', slab: '#0d0d24', slabText: '#f8f8ff', accent: '#f9f002', accentText: '#050510' },
  fonts: [],
};
