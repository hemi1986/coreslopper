import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planRuntime, runtimePath } from '../scripts/runtime-files.mjs';

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--cached'], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

describe('runtimePath', () => {
  it('ships the workspace payload at the workspace root', () => {
    expect(runtimePath('workspace/.claude/skills/new-video/SKILL.md')).toBe('.claude/skills/new-video/SKILL.md');
    expect(runtimePath('workspace/AGENTS.md')).toBe('AGENTS.md');
    expect(runtimePath('workspace/CLAUDE.md')).toBe('CLAUDE.md');
  });

  it('keeps the engineering layer out of the runtime', () => {
    for (const path of [
      '.claude/skills/adopt/SKILL.md',
      '.claude/settings.json',
      '.opencode/opencode.jsonc',
      'AGENTS.md',
      'CLAUDE.md',
      'CONTEXT.md',
      'docs/stories/ST-001-example.md',
      'docs/architecture/boundaries.yaml',
      'packages/cli/AGENTS.md',
      'packages/cli/CLAUDE.md',
      'scripts/build-runtime.mjs',
    ]) {
      expect(runtimePath(path), path).toBeNull();
    }
  });

  it('ships product files at their own path', () => {
    expect(runtimePath('packages/cli/src/index.ts')).toBe('packages/cli/src/index.ts');
    expect(runtimePath('docs/architecture.md')).toBe('docs/architecture.md');
    expect(runtimePath('docs/adr/0001-example.md')).toBe('docs/adr/0001-example.md');
  });

  // Characterization from the adoption of the workspace slice (2026-11-22): it pins what ships today, not what
  // should ship – the upstream CI runs a build the workspace does not have.
  it('ships the upstream CI and the issue templates into a workspace, but not the release workflow', () => {
    expect(runtimePath('.github/workflows/ci.yml')).toBe('.github/workflows/ci.yml');
    expect(runtimePath('.github/PULL_REQUEST_TEMPLATE.md')).toBe('.github/PULL_REQUEST_TEMPLATE.md');
    expect(runtimePath('.github/workflows/release.yml')).toBeNull();
  });

  it('leaves a path no list covers unclassified', () => {
    expect(runtimePath('docs/new-page.md')).toBeUndefined();
    expect(runtimePath('new-top-level-file.md')).toBeUndefined();
  });
});

describe('planRuntime', () => {
  it('refuses unclassified files and two sources for one path', () => {
    expect(() => planRuntime(['docs/new-page.md'])).toThrow(/Unclassified[\s\S]*docs\/new-page\.md/);
    expect(() => planRuntime(['workspace/README.md', 'README.md'])).toThrow(/Two files would ship at one runtime path/);
  });
});

describe('the runtime of this repository', () => {
  const plan = planRuntime(trackedFiles());
  const shipped = new Set(plan.keys());

  it('carries the media workflow and none of the engineering layer', () => {
    for (const path of [
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/settings.json',
      '.claude/skills/grilling/SKILL.md',
      '.claude/skills/new-video/SKILL.md',
      '.claude/agents/stage-runner.md',
      '.claude/commands/video-next.md',
    ]) {
      expect(shipped.has(path), path).toBe(true);
    }
    expect(plan.get('AGENTS.md')).toBe('workspace/AGENTS.md');
    for (const path of shipped) {
      expect(plan.get(path)?.startsWith('.claude/'), path).toBe(false);
    }
  });

  it('ships the workspace ignore rules and keeps each of them in the repository', () => {
    expect(plan.get('.gitignore')).toBe('workspace/.gitignore');
    const rules = (file: string) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    const repository = new Set(rules('.gitignore'));
    for (const rule of rules('workspace/.gitignore')) {
      expect(repository.has(rule), `.gitignore lacks ${rule}`).toBe(true);
    }
    // A library set's entry stays tracked; its media do not.
    expect(rules('workspace/.gitignore')).toEqual(expect.arrayContaining(['library/sets/*/*', '!library/sets/*/set.yaml', 'library/sets/.removing-*/']));
  });

  it('ships every file a shipped hook runs', () => {
    const settings = JSON.parse(readFileSync('workspace/.claude/settings.json', 'utf8')) as {
      hooks?: Record<string, { hooks?: { command?: string }[] }[]>;
    };
    const commands = Object.values(settings.hooks ?? {})
      .flat()
      .flatMap((entry) => entry.hooks ?? [])
      .map((hook) => hook.command ?? '');
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      for (const [file] of command.matchAll(/\.claude\/[\w./-]+/g)) {
        expect(shipped.has(file), `${command} → ${file}`).toBe(true);
      }
    }
  });

  it('ships every skill a shipped skill, command, or agent names', () => {
    const skills = new Set(
      [...shipped].map((path) => /^\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1]).filter(Boolean),
    );
    for (const path of shipped) {
      if (!/^\.claude\/(skills|commands|agents)\/.*\.md$/.test(path)) continue;
      const text = readFileSync(plan.get(path) as string, 'utf8');
      for (const [, name] of text.matchAll(/\.claude\/skills\/([\w-]+)\//g)) {
        expect(skills.has(name), `${path} → ${name}`).toBe(true);
      }
    }
  });
});
