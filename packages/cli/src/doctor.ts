import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveHiggsfieldCredentials } from '@coreslopper/providers';
import { detectTools, type ToolCheck } from './tools.js';
import { isWorkspace, loadWorkspaceEnv } from './workspace.js';

export interface DoctorCheck {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
  group: 'workspace' | 'tool' | 'credentials';
}

export interface DoctorResult {
  ok: boolean;
  root: string;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  json?: boolean;
}

function fileCheck(
  root: string,
  id: string,
  name: string,
  path: string,
  options: { required?: boolean; detail?: string } = {},
): DoctorCheck {
  const exists = existsSync(join(root, path));
  return {
    id,
    name,
    ok: exists,
    detail: exists ? path : `${path} is missing`,
    required: options.required ?? true,
    group: 'workspace',
  };
}

function toolCheck(tool: ToolCheck): DoctorCheck {
  return {
    id: tool.id,
    name: tool.name,
    ok: tool.ok,
    detail: tool.detail,
    required: tool.required,
    group: 'tool',
  };
}

export async function runDoctor(root: string, options: DoctorOptions = {}): Promise<DoctorResult> {
  loadWorkspaceEnv(root);
  const higgsfield = resolveHiggsfieldCredentials();

  const checks: DoctorCheck[] = [
    {
      id: 'workspace',
      name: 'coreslopper workspace',
      ok: isWorkspace(root),
      detail: isWorkspace(root) ? root : 'not a workspace (run "npx coreslopper init")',
      required: true,
      group: 'workspace',
    },
    fileCheck(root, 'templates', 'Project template', 'templates/project/README.md'),
    fileCheck(root, 'config', 'Defaults', 'config/defaults.yaml'),
    fileCheck(root, 'models', 'Model roles and pricing', 'config/models.yaml'),
    fileCheck(root, 'remotion', 'Remotion entry', 'packages/remotion/src/index.ts'),
    fileCheck(root, 'skills', 'Claude Code skills', '.claude/skills/video-brief/SKILL.md'),
    fileCheck(root, 'audio-analysis', 'Audio analysis scripts', 'scripts/audio-analysis/analyze.py'),
    fileCheck(root, 'fonts', 'Example fonts', 'brand/example/fonts/SpaceGrotesk.ttf'),
    {
      id: 'fal-key',
      name: 'FAL_KEY',
      ok: Boolean(process.env.FAL_KEY),
      detail: process.env.FAL_KEY ? 'set (from environment or .env)' : 'not set (mock works without it)',
      required: false,
      group: 'credentials',
    },
    {
      id: 'higgsfield-key',
      name: 'HIGGSFIELD_API_KEY',
      ok: Boolean(higgsfield),
      detail: higgsfield ? 'set (from environment or .env)' : 'not set (mock works without it)',
      required: false,
      group: 'credentials',
    },
    ...detectTools(root).map(toolCheck),
  ];

  const ok = checks.every((check) => check.ok || !check.required);

  if (options.json) {
    console.log(JSON.stringify({ ok, root, checks }, null, 2));
  } else {
    console.log(`Workspace: ${root}`);
    for (const check of checks) {
      const mark = check.ok ? '✔' : check.required ? '✖' : '○';
      console.log(`${mark} ${check.name}: ${check.detail}`);
    }
    if (!ok) {
      console.log('\nSome required checks failed. Fix them and run "coreslopper doctor" again.');
    }
  }

  return { ok, root, checks };
}
