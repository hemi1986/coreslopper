import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export type ToolId = 'node' | 'npm' | 'git' | 'uv' | 'python' | 'ffmpeg' | 'claude';

export interface ToolCheck {
  id: ToolId;
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
  purpose: string;
}

export interface SetupResult {
  npm: boolean;
  uv: boolean;
  warning?: string;
}

function refreshPath(): void {
  const additions = [join(homedir(), '.local', 'bin'), join(homedir(), '.cargo', 'bin')];
  const current = process.env.PATH?.split(delimiter) ?? [];
  for (const directory of additions) {
    if (existsSync(directory) && !current.includes(directory)) {
      process.env.PATH = `${directory}${delimiter}${process.env.PATH ?? ''}`;
      current.unshift(directory);
    }
  }
}

function commandVersion(command: string, args: string[] = ['--version']): string | undefined {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      shell: process.platform === 'win32',
    }).trim();
    return output.split('\n').find((line) => line.trim())?.trim();
  } catch {
    return undefined;
  }
}

export function commandExists(command: string): boolean {
  refreshPath();
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(finder, [command], { stdio: 'ignore', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function pythonVersion(): { ok: boolean; detail: string } {
  let fallback: { ok: false; detail: string } | undefined;
  for (const command of ['python3', 'python']) {
    const output = commandVersion(command, ['--version']);
    if (!output) continue;
    const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const detail = `${output} (${command})`;
    if (major === 3 && minor >= 12) return { ok: true, detail };
    fallback ??= { ok: false, detail: `${detail}, but 3.12 or newer is required` };
  }

  if (commandExists('uv')) {
    try {
      const path = execFileSync('uv', ['python', 'find', '3.12'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15_000,
      }).trim();
      if (path) return { ok: true, detail: `${path} (managed by uv)` };
    } catch {
      // Fall through to the missing message.
    }
  }

  return fallback ?? { ok: false, detail: 'missing (3.12 or newer required)' };
}

export function detectTools(root = process.cwd()): ToolCheck[] {
  refreshPath();
  const checks: ToolCheck[] = [];

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    id: 'node',
    name: 'Node.js >= 22',
    ok: nodeMajor >= 22,
    detail: process.version,
    required: true,
    purpose: 'runtime',
  });

  const npm = commandVersion('npm');
  checks.push({
    id: 'npm',
    name: 'npm',
    ok: Boolean(npm),
    detail: npm ?? 'missing',
    required: true,
    purpose: 'dependency installation',
  });

  const git = commandVersion('git');
  checks.push({
    id: 'git',
    name: 'git',
    ok: Boolean(git),
    detail: git ?? 'missing (optional, needed for versioning your workspace)',
    required: false,
    purpose: 'version control',
  });

  const uv = commandVersion('uv');
  checks.push({
    id: 'uv',
    name: 'uv',
    ok: Boolean(uv),
    detail: uv ?? 'missing (needed for audio analysis)',
    required: false,
    purpose: 'audio-analysis',
  });

  const python = pythonVersion();
  checks.push({
    id: 'python',
    name: 'Python >= 3.12',
    ok: python.ok,
    detail: python.detail,
    required: false,
    purpose: 'audio-analysis',
  });

  const localFfmpeg = join(root, '.tools', 'ffmpeg', 'ffmpeg');
  const ffmpeg = existsSync(localFfmpeg) ? localFfmpeg : commandVersion('ffmpeg', ['-version']);
  checks.push({
    id: 'ffmpeg',
    name: 'ffmpeg',
    ok: Boolean(ffmpeg),
    detail: ffmpeg ?? 'missing (optional, needed for footage and loudness normalization)',
    required: false,
    purpose: 'media',
  });

  const claude = commandVersion('claude');
  checks.push({
    id: 'claude',
    name: 'Claude Code',
    ok: Boolean(claude),
    detail: claude ?? 'missing (needed to run /video-next)',
    required: false,
    purpose: 'agent pipeline',
  });

  return checks;
}

export function formatTools(checks: ToolCheck[]): string {
  return checks
    .map((check) => {
      const mark = check.ok ? '✔' : check.required ? '✖' : '○';
      return `${mark} ${check.name}: ${check.detail}`;
    })
    .join('\n');
}

export function missingTools(checks: ToolCheck[]): ToolCheck[] {
  return checks.filter((check) => !check.ok);
}

function spawnStep(label: string, command: string, args: string[], cwd?: string): void {
  console.log(`→ ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit code ${result.status ?? 'unknown'}).`);
  }
}

export function installUv(): boolean {
  refreshPath();
  if (commandExists('uv')) return true;

  console.log('→ Installing uv (official installer)');
  const result =
    process.platform === 'win32'
      ? spawnSync(
          'powershell',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://astral.sh/uv/install.ps1 | iex'],
          { stdio: 'inherit' },
        )
      : spawnSync('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], { stdio: 'inherit' });

  refreshPath();
  if (result.error) console.error(`uv installer: ${result.error.message}`);
  return commandExists('uv');
}

export function installPython(): boolean {
  if (!commandExists('uv')) return false;
  spawnStep('Installing Python 3.12 with uv', 'uv', ['python', 'install', '3.12']);
  return pythonVersion().ok;
}

export function installFfmpeg(root = process.cwd()): boolean {
  const local = join(root, '.tools', 'ffmpeg', 'ffmpeg');
  if (existsSync(local) || commandExists('ffmpeg')) return true;

  const script = join(root, 'scripts', 'install-ffmpeg.sh');
  if (process.platform === 'darwin' && commandExists('brew')) {
    spawnStep('Installing ffmpeg with Homebrew', 'brew', ['install', 'ffmpeg']);
    return commandExists('ffmpeg');
  }

  if (process.platform === 'linux' && process.arch === 'x64' && existsSync(script)) {
    spawnStep('Installing local ffmpeg (Linux x86_64)', 'bash', [script]);
    return existsSync(local) || commandExists('ffmpeg');
  }

  if (process.platform === 'linux' && commandExists('apt-get')) {
    if (process.getuid?.() === 0) {
      spawnStep('Updating apt package lists', 'apt-get', ['update']);
      spawnStep('Installing ffmpeg with apt', 'apt-get', ['install', '-y', 'ffmpeg']);
    } else {
      spawnStep('Updating apt package lists (sudo)', 'sudo', ['apt-get', 'update']);
      spawnStep('Installing ffmpeg with apt (sudo)', 'sudo', ['apt-get', 'install', '-y', 'ffmpeg']);
    }
    return commandExists('ffmpeg');
  }

  if (process.platform === 'win32' && commandExists('winget')) {
    spawnStep('Installing ffmpeg with winget', 'winget', [
      'install',
      '--id',
      'Gyan.FFmpeg',
      '-e',
      '--accept-source-agreements',
      '--accept-package-agreements',
    ]);
    return commandExists('ffmpeg');
  }

  console.error('Could not install ffmpeg automatically. Install it with your package manager.');
  return false;
}

export function installClaudeCode(): boolean {
  if (commandExists('claude')) return true;
  spawnStep('Installing Claude Code globally', 'npm', ['install', '-g', '@anthropic-ai/claude-code']);
  return commandExists('claude');
}

export function runSetup(root: string): SetupResult {
  spawnStep('Installing Node dependencies (npm install)', 'npm', ['install'], root);

  if (!commandExists('uv')) {
    return {
      npm: true,
      uv: false,
      warning: 'uv is not installed, so the Python audio-analysis environment was skipped.',
    };
  }

  try {
    spawnStep('Syncing audio-analysis dependencies (uv sync)', 'uv', ['sync', '--group', 'dev'], join(root, 'scripts', 'audio-analysis'));
  } catch (error) {
    return {
      npm: true,
      uv: false,
      warning: `Node dependencies are installed, but "uv sync" failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { npm: true, uv: true };
}

export type FalKeyStatus = 'valid' | 'invalid' | 'unknown';

export interface FalKeyResult {
  status: FalKeyStatus;
  message: string;
}

/**
 * Check a fal.ai key against the model-list endpoint. A network failure is
 * reported as unknown so onboarding never blocks on connectivity.
 */
export async function validateFalKey(
  key: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<FalKeyResult> {
  const trimmed = key.trim();
  if (!trimmed) return { status: 'invalid', message: 'empty key' };

  try {
    const response = await fetchImpl('https://api.fal.ai/v1/models?limit=1', {
      headers: { Authorization: `Key ${trimmed}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return { status: 'valid', message: `HTTP ${response.status}` };
    if (response.status === 401) return { status: 'invalid', message: 'HTTP 401 (key rejected)' };
    if (response.status === 403) return { status: 'unknown', message: 'HTTP 403 (key may lack API permission)' };
    return { status: 'unknown', message: `HTTP ${response.status}` };
  } catch (error) {
    return {
      status: 'unknown',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
