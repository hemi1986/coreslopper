import { Command } from 'commander';
import { relative, resolve } from 'node:path';
import { runDoctor } from './doctor.js';
import {
  runInitCommand,
  validateChoice,
  type InitCommandOptions,
} from './init-command.js';
import { createProject } from './new-project.js';
import { onboard } from './onboarding.js';
import { printStatus } from './status.js';
import { printUpdateSummary, updateWorkspace } from './update.js';
import { formatSeconds, run } from './utils.js';
import { validateProject } from './validate.js';
import {
  findWorkspaceRoot,
  listProjects,
  loadWorkspaceEnv,
  ownVersion,
  resolveProjectArg,
  requireWorkspaceRoot,
} from './workspace.js';

interface NewCommandOptions {
  budget?: number;
  title?: string;
  visual?: string;
  imageProvider?: string;
  videoProvider?: string;
}

function requireWorkspace(): string {
  const root = requireWorkspaceRoot();
  process.chdir(root);
  loadWorkspaceEnv(root);
  return root;
}

function workspaceSummary(root: string): void {
  const projects = listProjects(root);
  console.log(`coreslopper workspace: ${root}`);
  if (projects.length) {
    console.log(`Projects: ${projects.join(', ')}`);
    try {
      const project = resolveProjectArg(root);
      console.log(`Tip: npx coreslopper status ${relative(root, project)}`);
    } catch {
      // Multiple projects; no single default to suggest.
    }
  } else {
    console.log('No projects yet. Create one with: npx coreslopper new <slug> --budget 50');
  }
  console.log('Commands: init, update, doctor, new, status, validate');
}

const program = new Command();
program
  .name('coreslopper')
  .description('Create and manage a coreslopper music-video workspace.')
  .version(ownVersion())
  .showHelpAfterError();

program
  .command('init [dir]')
  .description('Create a workspace, install tools, and configure fal.ai and Higgsfield.')
  .option('-y, --yes', 'Use defaults and skip prompts')
  .option('--force', 'Merge into a non-empty directory')
  .option('--no-install', 'Skip npm install and uv sync')
  .option('--no-git', 'Do not initialize a git repository')
  .option('--install-tools', 'Install missing uv, Python, ffmpeg, and Claude Code')
  .option('--no-tool-install', 'Do not offer to install system tools')
  .option('--visual <provider>', 'mock | fal | higgsfield', 'mock')
  .option('--image-provider <provider>', 'mock | fal | higgsfield')
  .option('--video-provider <provider>', 'mock | fal | higgsfield | comfyui')
  .option('--budget <usd>', 'First project budget in USD', (value) => Number(value))
  .option('--project <slug>', 'First project slug')
  .option('--title <title>', 'First project title')
  .option('--fal-key <key>', 'fal.ai API key (prefer FAL_KEY in the environment)')
  .option('--higgsfield-key <key>', 'Higgsfield credential (prefer HIGGSFIELD_API_KEY in the environment)')
  .option('--skip-project', 'Create the workspace without a first project')
  .option('--runtime <dir>', 'Runtime directory (development only)')
  .action((dir: string | undefined, options: InitCommandOptions) =>
    run(async () => {
      const visuals = ['mock', 'fal', 'higgsfield'] as const;
      const videoProviders = [...visuals, 'comfyui'] as const;
      if (options.visual) options.visual = validateChoice(options.visual, visuals, 'visual provider');
      if (options.imageProvider) {
        options.imageProvider = validateChoice(options.imageProvider, visuals, 'image provider');
      }
      if (options.videoProvider) {
        options.videoProvider = validateChoice(options.videoProvider, videoProviders, 'video provider');
      }
      await runInitCommand(dir, options);
    }),
  );

program
  .command('update [dir]')
  .description('Update the workflow files of a workspace to this coreslopper version; keeps local changes.')
  .option('--dry-run', 'Show what would change without writing anything')
  .option('--force', 'Overwrite locally changed files and allow a downgrade')
  .option('--no-install', 'Skip npm install and uv sync')
  .option('--runtime <dir>', 'Runtime directory (development only)')
  .action(
    (
      dir: string | undefined,
      options: { dryRun?: boolean; force?: boolean; install: boolean; runtime?: string },
    ) =>
      run(async () => {
        const target = dir ? resolve(dir) : requireWorkspaceRoot();
        const result = await updateWorkspace({
          targetDir: target,
          runtimeDir: options.runtime,
          dryRun: options.dryRun,
          force: options.force,
          install: options.install,
          onProgress: (message) => console.log(message),
        });
        printUpdateSummary(result);
      }),
  );

program
  .command('doctor [dir]')
  .description('Check the workspace, tools, and credentials.')
  .option('--json', 'Print machine-readable JSON')
  .action((dir: string | undefined, options: { json?: boolean }) =>
    run(async () => {
      const root = dir ? resolve(dir) : (findWorkspaceRoot() ?? process.cwd());
      const result = await runDoctor(root, { json: options.json });
      if (!result.ok) process.exitCode = 1;
    }),
  );

program
  .command('new <slug>')
  .description('Create a project inside the current workspace.')
  .option('--budget <usd>', 'Project budget in USD (required)', (value) => Number(value))
  .option('--title <title>')
  .option('--visual <provider>', 'mock | fal | higgsfield', 'mock')
  .option('--image-provider <provider>', 'mock | fal | higgsfield')
  .option('--video-provider <provider>', 'mock | fal | higgsfield | comfyui')
  .action((slug: string, options: NewCommandOptions) =>
    run(async () => {
      const root = requireWorkspace();
      const visuals = ['mock', 'fal', 'higgsfield'] as const;
      const visual = validateChoice(options.visual ?? 'mock', visuals, 'visual provider');
      const image = options.imageProvider
        ? validateChoice(options.imageProvider, visuals, 'image provider')
        : visual;
      const video = options.videoProvider
        ? validateChoice(options.videoProvider, [...visuals, 'comfyui'] as const, 'video provider')
        : visual;
      await createProject({
        slug,
        title: options.title,
        budget: options.budget,
        root,
        imageProvider: image,
        videoProvider: video,
      });
    }),
  );

program
  .command('status [project]')
  .description('Show stage state and budget for a project.')
  .action((project: string | undefined) =>
    run(async () => {
      const root = requireWorkspace();
      await printStatus(resolveProjectArg(root, project));
    }),
  );

program
  .command('validate [project]')
  .description('Validate timing, style, characters, and storyboard coverage.')
  .option('--no-write', 'Do not write timing.effective.json')
  .action((project: string | undefined, options: { write: boolean }) =>
    run(async () => {
      const root = requireWorkspace();
      const projectDir = resolveProjectArg(root, project);
      const { project: loaded, resolved } = await validateProject(projectDir, { write: options.write });
      console.log(
        `✔ ${loaded.config.title}: ${resolved.shots.length} shots, ${formatSeconds(resolved.durationSeconds)}, ${resolved.durationInFrames} frames`,
      );
      for (const warning of resolved.warnings) console.log(`  ! ${warning}`);
    }),
  );

const args = process.argv.slice(2);
if (args.length === 0) {
  const root = findWorkspaceRoot();
  if (root) {
    workspaceSummary(root);
  } else if (!process.stdin.isTTY) {
    console.error('No coreslopper workspace detected.');
    console.error('Run: npx coreslopper init <dir> --yes');
    process.exitCode = 1;
  } else {
    await run(async () => {
      await onboard();
    });
  }
} else {
  await program.parseAsync(process.argv);
}
