import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initWorkspace, sanitizeSlug, upsertEnv, writeMcpConfig } from '../packages/cli/src/init.ts';
import { validateFalKey } from '../packages/cli/src/tools.ts';
import { findWorkspaceRoot } from '../packages/cli/src/workspace.ts';

const temporary: string[] = [];

async function temporaryDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporary.push(directory);
  return directory;
}

async function runtimeFixture(): Promise<string> {
  const runtime = await temporaryDir('coreslopper-runtime-');
  await mkdir(join(runtime, 'config'), { recursive: true });
  await cp(join(process.cwd(), 'config', 'defaults.yaml'), join(runtime, 'config', 'defaults.yaml'));
  await cp(join(process.cwd(), 'templates', 'project'), join(runtime, 'templates', 'project'), {
    recursive: true,
  });
  await writeFile(
    join(runtime, 'package.json'),
    `${JSON.stringify({ name: 'coreslopper', version: '9.9.9', private: true }, null, 2)}\n`,
  );
  await writeFile(join(runtime, '.env.example'), '# example\nFAL_KEY=\n');
  await writeFile(join(runtime, '.mcp.json'), '{"mcpServers":{"other":{"url":"https://example.test"}}}\n');
  await writeFile(join(runtime, '.gitignore'), '.env\n');
  return runtime;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('workspace init', () => {
  it('creates a self-contained workspace and first project', async () => {
    const runtimeDir = await runtimeFixture();
    const target = await temporaryDir('coreslopper-workspace-');

    const result = await initWorkspace({
      targetDir: target,
      runtimeDir,
      install: false,
      git: false,
      falKey: 'test-fal-key',
      project: {
        slug: 'test-video',
        budget: 25,
        song: 'import',
        image: 'mock',
        video: 'mock',
      },
    });

    expect(result.installed).toBe(false);
    expect(result.projectSlug).toBe('test-video');

    const packageJson = JSON.parse(await readFile(join(target, 'package.json'), 'utf8')) as { name: string };
    expect(packageJson.name).toBe('coreslopper');

    const project = await readFile(join(target, 'projects', 'test-video', 'project.yaml'), 'utf8');
    expect(project).toContain('slug: test-video');
    expect(project).toContain('budget_usd: 25');
    expect(existsSync(join(target, 'projects', 'test-video', 'characters', '.gitkeep'))).toBe(true);

    const env = await readFile(join(target, '.env'), 'utf8');
    expect(env).toContain('FAL_KEY=test-fal-key');

    const mcp = JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { url: string }>;
    };
    expect(mcp.mcpServers.suno?.url).toBe('https://api.suno.com/mcp');
    expect(mcp.mcpServers.other?.url).toBe('https://example.test');

    const marker = JSON.parse(await readFile(join(target, 'coreslopper.workspace.json'), 'utf8')) as {
      version: number;
      project: string;
    };
    expect(marker.version).toBe(1);
    expect(marker.project).toBe('test-video');

    const gettingStarted = await readFile(join(target, 'GETTING_STARTED.md'), 'utf8');
    expect(gettingStarted).toContain('/video-next test-video');
    expect(findWorkspaceRoot(join(target, 'projects', 'test-video'))).toBe(target);
  });

  it('refuses a non-empty target without force', async () => {
    const runtimeDir = await runtimeFixture();
    const target = await temporaryDir('coreslopper-nonempty-');
    await writeFile(join(target, 'keep.txt'), 'do not delete\n');

    await expect(
      initWorkspace({ targetDir: target, runtimeDir, install: false, git: false }),
    ).rejects.toThrow(/not empty/);
  });
});

describe('onboarding helpers', () => {
  it('replaces and appends env keys without duplicates', () => {
    const input = '# comment\nFAL_KEY=old\nOTHER=1\n';
    const replaced = upsertEnv(input, 'FAL_KEY', 'new');
    expect(replaced).toContain('FAL_KEY=new');
    expect(replaced).not.toContain('FAL_KEY=old');
    expect(replaced.match(/FAL_KEY=/g)).toHaveLength(1);

    const appended = upsertEnv(replaced, 'OPENAI_API_KEY', 'abc');
    expect(appended).toContain('OPENAI_API_KEY=abc');
  });

  it('sanitizes project slugs', () => {
    expect(sanitizeSlug('My Video!')).toBe('my-video');
    expect(sanitizeSlug('---')).toBe('my-video');
    expect(sanitizeSlug('already-ok-2')).toBe('already-ok-2');
  });

  it('merges the Suno server into an existing MCP config', async () => {
    const directory = await temporaryDir('coreslopper-mcp-');
    await writeFile(
      join(directory, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { url: 'https://example.test' } } }),
    );
    writeMcpConfig(directory, true);
    const config = JSON.parse(await readFile(join(directory, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { url: string }>;
    };
    expect(config.mcpServers.suno?.url).toBe('https://api.suno.com/mcp');
    expect(config.mcpServers.other?.url).toBe('https://example.test');
  });

  it('validates a fal key and treats network failures as unknown', async () => {
    const ok = await validateFalKey('key', async () => new Response('{}', { status: 200 }));
    expect(ok.status).toBe('valid');

    const rejected = await validateFalKey('key', async () => new Response('{}', { status: 401 }));
    expect(rejected.status).toBe('invalid');

    const offline = await validateFalKey('key', async () => {
      throw new Error('offline');
    });
    expect(offline.status).toBe('unknown');
  });
});
