import { PALETTE_ROLES, type StyleBible } from './schema.js';

export type PaletteRole = (typeof PALETTE_ROLES)[number];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Neutral fallback colours used only when a role cannot be resolved at all. */
export const DEFAULT_ROLE_COLORS: Record<PaletteRole, string> = {
  background: '#050510',
  surface: '#16171c',
  primary: '#ff2a6d',
  secondary: '#05d9e8',
  accent: '#f9f002',
  text: '#f8f8ff',
  muted: '#8b8ba7',
};

/**
 * Name fragments tried in order when a palette neither uses a role name nor
 * maps it in `roles`. The first palette key that contains a fragment wins.
 */
const ROLE_HINTS: Record<PaletteRole, string[]> = {
  background: ['background', 'bg', 'night', 'base', 'black', 'dark', 'shadow'],
  surface: ['surface', 'card', 'panel', 'graphite'],
  primary: ['primary', 'brand', 'magenta', 'pink', 'main'],
  secondary: ['secondary', 'cyan', 'blue'],
  accent: ['accent', 'highlight', 'green', 'yellow'],
  text: ['text', 'foreground', 'fg', 'white', 'ink'],
  muted: ['muted', 'subtle', 'grey', 'gray'],
};

function hinted(palette: Record<string, string>, role: PaletteRole): string | undefined {
  const keys = Object.keys(palette);
  for (const hint of ROLE_HINTS[role]) {
    const key = keys.find((candidate) => candidate.toLowerCase().includes(hint));
    if (key) return palette[key];
  }
  return undefined;
}

function mapped(style: Pick<StyleBible, 'palette' | 'roles'>, role: string): string | undefined {
  const target = style.roles?.[role];
  if (!target) return undefined;
  if (HEX.test(target)) return target;
  return style.palette[target];
}

/** Resolve one renderer role: explicit `roles` mapping, palette key, name hints, default. */
export function resolveRole(style: Pick<StyleBible, 'palette' | 'roles'>, role: PaletteRole): string {
  return (
    mapped(style, role) ?? style.palette[role] ?? hinted(style.palette, role) ?? DEFAULT_ROLE_COLORS[role]
  );
}

/** All standard roles plus any custom roles declared in `roles`. */
export function resolvePalette(style: Pick<StyleBible, 'palette' | 'roles'>): Record<string, string> {
  const resolved: Record<string, string> = { ...style.palette };
  for (const role of PALETTE_ROLES) {
    resolved[role] = resolveRole(style, role);
  }
  for (const role of Object.keys(style.roles ?? {})) {
    if (!(PALETTE_ROLES as readonly string[]).includes(role)) {
      const value = mapped(style, role);
      if (value) resolved[role] = value;
    }
  }
  return resolved;
}

/**
 * Return a style whose palette always has the standard role keys, so renderer
 * code can read `palette.background` etc. A palette that already defines every
 * role (and has no `roles` map) comes back unchanged.
 */
export function withResolvedPalette<T extends Pick<StyleBible, 'palette' | 'roles'>>(style: T): T {
  return { ...style, palette: resolvePalette(style) };
}

/**
 * Resolve a colour token used in motion props: a #rrggbb colour, a palette key,
 * a role, a kebab-case palette key (`acid-green`), or `white`/`black` (text/background roles).
 */
export function resolveColorToken(
  style: Pick<StyleBible, 'palette' | 'roles'>,
  token: string | undefined,
  fallback: string,
): string {
  if (!token) return fallback;
  if (HEX.test(token)) return token;
  const palette = resolvePalette(style);
  if (palette[token]) return palette[token]!;
  const snake = token.replace(/-/g, '_');
  if (palette[snake]) return palette[snake]!;
  if (token === 'white') return palette.text ?? fallback;
  if (token === 'black') return palette.background ?? fallback;
  return fallback;
}
