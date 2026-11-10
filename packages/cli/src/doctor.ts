import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkComfyUI, inspectWorkflowDir, resolveHiggsfieldCredentials } from '@coreslopper/providers';
import { detectTools, type ToolCheck } from './tools.js';
import { isWorkspace, loadWorkspaceEnv } from './workspace.js';

export interface DoctorCheck {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
  group: 'workspace' | 'tool' | 'credentials' | 'local';
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

/** Optional local backend: server reachability and the workflow exports. */
async function comfyUIChecks(root: string): Promise<DoctorCheck[]> {
  const server = await checkComfyUI();
  const dir = process.env.COMFYUI_WORKFLOWS_DIR ? resolve(process.env.COMFYUI_WORKFLOWS_DIR) : join(root, 'comfyui', 'workflows');
  const reports = await inspectWorkflowDir(dir);
  const checks: DoctorCheck[] = [
    {
      id: 'comfyui',
      name: 'ComfyUI (local)',
      ok: server.ok,
      detail: server.ok ? `${server.message} at ${server.url}` : `not reachable at ${server.url} (only needed when a provider is comfyui)`,
      required: false,
      group: 'local',
    },
  ];
  if (reports.length === 0) {
    checks.push({
      id: 'comfyui-workflows',
      name: 'ComfyUI workflows',
      ok: false,
      detail: `none in ${dir} (see comfyui/README.md)`,
      required: false,
      group: 'local',
    });
  }
  for (const report of reports) {
    checks.push({
      id: `comfyui-workflow-${report.name}`,
      name: `ComfyUI workflow ${report.name}`,
      ok: report.ok,
      detail: report.error ?? [report.operations?.join('/'), ...report.warnings].join('; '),
      required: false,
      group: 'local',
    });
  }
  return checks;
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
    ...(await comfyUIChecks(root)),
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
