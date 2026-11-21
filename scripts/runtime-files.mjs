/**
 * Which tracked file of this repository ships in the runtime, and at which path.
 *
 * The repository has two layers. The engineering layer (root `AGENTS.md`,
 * `CLAUDE.md`, `.claude/`, and the engineering workflow's docs) is for working
 * on coreslopper and never ships. The workspace payload is everything a
 * workspace gets: the product code and docs at their own paths, and
 * `workspace/`, which becomes the workspace root (`workspace/.claude/` →
 * `.claude/`, `workspace/AGENTS.md` → `AGENTS.md`).
 *
 * Every tracked file must match one of the lists below. A file that matches
 * none is unclassified and fails the runtime build, so a new path never ships
 * or goes missing by accident. Entries ending in `/` match a directory, the
 * others one exact path.
 */

/** The workspace root inside this repository. */
export const PAYLOAD_DIR = 'workspace/';

/** Tracked paths that never ship. */
export const NOT_SHIPPED = [
  // The engineering layer: agent instructions and tooling for working on this repository.
  '.claude/',
  '.opencode/',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTEXT.md',
  // The repository's ignore rules: the workspace's (workspace/.gitignore) plus the engineering layer's.
  '.gitignore',
  'skills-lock.json',
  // The engineering workflow's documents (Kataster).
  'docs/workflow.md',
  'docs/architecture/',
  'docs/domain/',
  'docs/engineering/',
  'docs/product/',
  'docs/prototypes/',
  'docs/research/',
  'docs/reviews/',
  'docs/stories/',
  // Building the runtime and the sandbox workspace.
  'scripts/build-runtime.mjs',
  'scripts/dev-workspace.mjs',
  'scripts/runtime-files.mjs',
  'scripts/runtime-files.d.mts',
  'tests/runtime-files.test.ts',
  'tsup.config.ts',
  // Upstream release automation: in a workspace it would open release PRs and
  // try to publish the coreslopper package from the user's repository.
  '.github/workflows/release.yml',
  'release-please-config.json',
  '.release-please-manifest.json',
  // A workspace's own channel; init and update never create or replace it.
  'config/channel.yaml',
];

/** Tracked paths that ship at the same path. */
export const SHIPPED = [
  '.editorconfig',
  '.env.example',
  '.gitattributes',
  '.github/',
  '.nvmrc',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'bench/',
  'brand/',
  'comfyui/',
  'compose.yaml',
  'config/',
  'docker/',
  'docs/THIRD_PARTY.md',
  'docs/adr/',
  'docs/architecture.md',
  'docs/assets/',
  'docs/board.md',
  'docs/glossary.md',
  'docs/mcp.md',
  'docs/onboarding.md',
  'docs/pipeline.md',
  'docs/providers.md',
  'docs/publishing.md',
  'docs/release-platforms.md',
  'library/',
  'package.json',
  'package-lock.json',
  'packages/',
  'projects/',
  'schema/',
  'scripts/',
  'templates/',
  'tests/',
  'tsconfig.json',
  'vitest.config.ts',
];

/** Top-level directories that are local state or build output, never workflow files. */
const SKIPPED_DIRECTORIES = new Set(['.git', '.cache', '.tools', '.vitest', 'node_modules', 'dist', 'runtime', 'tmp']);

/** Agent instructions outside `workspace/` belong to the engineering layer, at any depth. */
const AGENT_DOCS = new Set(['AGENTS.md', 'CLAUDE.md']);

function matches(path, entries) {
  return entries.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry));
}

/**
 * Classify one tracked path.
 * Returns the runtime path it ships at, `null` when it does not ship, or
 * `undefined` when no list covers it.
 */
export function runtimePath(path) {
  const segments = path.split('/');
  if (segments.length > 1 && SKIPPED_DIRECTORIES.has(segments[0])) return null;
  if (path === '.env' || (path.startsWith('.env.') && path !== '.env.example')) return null;
  if (path.startsWith(PAYLOAD_DIR)) return path.slice(PAYLOAD_DIR.length);
  if (matches(path, NOT_SHIPPED) || AGENT_DOCS.has(segments.at(-1))) return null;
  if (matches(path, SHIPPED)) return path;
  return undefined;
}

/**
 * Plan the runtime from the tracked files: a map from runtime path to source path.
 * Throws when a file is unclassified or two sources would ship at one path.
 */
export function planRuntime(trackedFiles) {
  const plan = new Map();
  const unclassified = [];
  const collisions = [];
  for (const source of trackedFiles) {
    const target = runtimePath(source);
    if (target === undefined) unclassified.push(source);
    if (!target) continue;
    if (plan.has(target)) collisions.push(`${target} (from ${plan.get(target)} and ${source})`);
    else plan.set(target, source);
  }
  const problems = [];
  if (unclassified.length) {
    problems.push(
      `Unclassified tracked files; add each to SHIPPED or NOT_SHIPPED in scripts/runtime-files.mjs:\n  ${unclassified.join('\n  ')}`,
    );
  }
  if (collisions.length) problems.push(`Two files would ship at one runtime path:\n  ${collisions.join('\n  ')}`);
  if (problems.length) throw new Error(problems.join('\n\n'));
  return plan;
}
