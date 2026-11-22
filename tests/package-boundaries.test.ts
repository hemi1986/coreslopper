// The import direction between the packages: core imports no other package; providers and remotion import only
// core; only the CLI wires everything. Relative imports are also checked by docs/architecture/boundaries.yaml;
// this test covers the package-name imports (`@coreslopper/...`), which resolve through tsconfig paths.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

function forbiddenImports(pkg: string, forbidden: string[]): string[] {
  const pattern = new RegExp(`(?:from\\s+|import\\s*\\(\\s*)['"]@coreslopper/(${forbidden.join('|')})(?:/[^'"]*)?['"]`);
  return sourceFiles(join(root, 'packages', pkg, 'src')).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => (pattern.test(line) ? [`${relative(root, file)}:${index + 1}`] : [])),
  );
}

describe('package boundaries', () => {
  it('core imports no other package', () => {
    expect(forbiddenImports('core', ['cli', 'providers', 'remotion'])).toEqual([]);
  });

  it('providers import only core', () => {
    expect(forbiddenImports('providers', ['cli', 'remotion'])).toEqual([]);
  });

  it('remotion imports only core', () => {
    expect(forbiddenImports('remotion', ['cli', 'providers'])).toEqual([]);
  });
});
