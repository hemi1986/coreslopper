import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ValidationError } from '@coreslopper/core';

// The timer that runs the watchdog round (`watch`: `release-run` and the
// production scan) every few minutes, so the release autopilot posts at the
// calendar times and the board sees stalled stages and finished renders.
// The board container runs the same round itself and needs no timer. Under WSL the Windows Task Scheduler
// starts it (WSL itself stops when no terminal is open); on Linux a systemd
// user timer; on macOS a launchd agent. A user command: it changes the
// computer's scheduler only when the user runs `release-timer install`.

export type TimerKind = 'windows-task' | 'systemd' | 'launchd';

export interface TimerPlan {
  kind: TimerKind;
  /** Files to write: the round's script, the systemd units, the launchd plist. */
  files: { path: string; content: string; mode?: number }[];
  /** Commands that install and start it. */
  install: string[][];
  /** Commands that stop and remove it. */
  remove: string[][];
  /** Commands that show whether it is installed. */
  status: string[][];
}

export const TIMER_NAME = 'coreslopper-release-run';

export function detectTimerKind(env: NodeJS.ProcessEnv = process.env, platform = process.platform): TimerKind {
  if (env.WSL_DISTRO_NAME) return 'windows-task';
  if (platform === 'darwin') return 'launchd';
  if (platform === 'linux') return 'systemd';
  throw new ValidationError(`release-timer supports WSL, Linux, and macOS; on ${platform} run "npm run cli -- release-run" from your own scheduler every 5 minutes.`);
}

/** Where the round's script lives: short enough for the Windows Task Scheduler's 261-character command. */
export const scriptPath = (home: string) => join(home, '.coreslopper', 'release-run.sh');

/**
 * The script one timer round runs: `watch` in the workspace, appending to
 * `.cache/watch.log`. PATH starts with the directory of the Node.js that
 * installed the timer, since a timer's shell does not load nvm or a profile;
 * `CORESLOPPER_TIMER_EVERY` tells the board how often a round is due.
 */
export function runScript(root: string, options: { nodeBin: string; every: number }): string {
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  return [
    '#!/bin/bash',
    '# Written by `npm run cli -- release-timer install`; runs one coreslopper watchdog round (release autopilot and production scan).',
    `export PATH=${quote(options.nodeBin)}:"$PATH"`,
    `export CORESLOPPER_TIMER_EVERY=${options.every}`,
    `cd ${quote(root)} || exit 1`,
    'mkdir -p .cache',
    'exec npm run --silent cli -- watch >> .cache/watch.log 2>&1',
    '',
  ].join('\n');
}

/** The longest command `schtasks /TR` takes. */
const SCHTASKS_MAX = 261;

export function timerPlan(options: { root: string; everyMinutes?: number; kind?: TimerKind; env?: NodeJS.ProcessEnv; home?: string; nodeBin?: string }): TimerPlan {
  const every = options.everyMinutes ?? 5;
  if (!Number.isInteger(every) || every < 1 || every > 60) throw new ValidationError('--every takes whole minutes from 1 to 60');
  const env = options.env ?? process.env;
  const kind = options.kind ?? detectTimerKind(env);
  const home = options.home ?? homedir();
  const script = scriptPath(home);
  const scriptFile = { path: script, content: runScript(options.root, { nodeBin: options.nodeBin ?? dirname(process.execPath), every }), mode: 0o755 };

  if (kind === 'windows-task') {
    const distro = env.WSL_DISTRO_NAME ?? 'Ubuntu';
    // conhost --headless keeps a console window from flashing up on every round (Windows 10 22H2 and later).
    const command = `conhost.exe --headless wsl.exe -d ${distro} -- /bin/bash ${script}`;
    if (command.length > SCHTASKS_MAX) throw new ValidationError(`The task command is ${command.length} characters; schtasks takes ${SCHTASKS_MAX}. Use a shorter home directory path.`);
    return {
      kind,
      files: [scriptFile],
      install: [['schtasks.exe', '/Create', '/F', '/SC', 'MINUTE', '/MO', String(every), '/TN', TIMER_NAME, '/TR', command]],
      remove: [['schtasks.exe', '/Delete', '/F', '/TN', TIMER_NAME]],
      status: [['schtasks.exe', '/Query', '/TN', TIMER_NAME]],
    };
  }
  if (kind === 'systemd') {
    const dir = join(home, '.config', 'systemd', 'user');
    const service = `[Unit]\nDescription=coreslopper watchdog (release autopilot and production scan)\n\n[Service]\nType=oneshot\nExecStart=/bin/bash ${script}\n`;
    const timer = `[Unit]\nDescription=Run the coreslopper watchdog every ${every} minutes\n\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=${every}min\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`;
    return {
      kind,
      files: [scriptFile, { path: join(dir, `${TIMER_NAME}.service`), content: service }, { path: join(dir, `${TIMER_NAME}.timer`), content: timer }],
      install: [
        ['systemctl', '--user', 'daemon-reload'],
        ['systemctl', '--user', 'enable', '--now', `${TIMER_NAME}.timer`],
      ],
      remove: [
        ['systemctl', '--user', 'disable', '--now', `${TIMER_NAME}.timer`],
        ['systemctl', '--user', 'daemon-reload'],
      ],
      status: [['systemctl', '--user', 'list-timers', `${TIMER_NAME}.timer`]],
    };
  }
  const plist = join(home, 'Library', 'LaunchAgents', `com.coreslopper.release-run.plist`);
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.coreslopper.release-run</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>${escape(script)}</string></array>
  <key>StartInterval</key><integer>${every * 60}</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`;
  return {
    kind,
    files: [scriptFile, { path: plist, content }],
    install: [['launchctl', 'load', '-w', plist]],
    remove: [['launchctl', 'unload', '-w', plist]],
    status: [['launchctl', 'list', 'com.coreslopper.release-run']],
  };
}

const show = (command: string[]) => command.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(' ');

/** `release-timer show|install|remove`. */
export async function releaseTimer(action: 'show' | 'install' | 'remove' | 'status', options: { root: string; everyMinutes?: number; log?: (line: string) => void }): Promise<TimerPlan> {
  const log = options.log ?? ((line: string) => console.log(line));
  const plan = timerPlan({ root: options.root, everyMinutes: options.everyMinutes });
  const exec = (command: string[]) => execFileSync(command[0]!, command.slice(1), { stdio: 'inherit' });
  if (action === 'show') {
    log(`Timer (${plan.kind}):`);
    for (const file of plan.files) log(`\n# ${file.path}\n${file.content}`);
    log('Install with:');
    for (const command of plan.install) log(`  ${show(command)}`);
    log('Remove with: npm run cli -- release-timer remove');
    return plan;
  }
  if (action === 'install') {
    for (const file of plan.files) {
      await mkdir(dirname(file.path), { recursive: true });
      await writeFile(file.path, file.content, file.mode ? { mode: file.mode } : {});
      if (file.mode) await chmod(file.path, file.mode);
    }
    for (const command of plan.install) exec(command);
    log(`✔ The watchdog round (release-run and the production scan) runs every ${options.everyMinutes ?? 5} minutes (${plan.kind}); its output goes to .cache/watch.log`);
    return plan;
  }
  if (action === 'remove') {
    for (const command of plan.remove) {
      try {
        exec(command);
      } catch {
        // Not installed: nothing to stop.
      }
    }
    for (const file of plan.files) if (existsSync(file.path)) await rm(file.path);
    log('✔ The watchdog timer is removed; approved releases no longer post by themselves.');
    return plan;
  }
  for (const command of plan.status) {
    try {
      exec(command);
    } catch {
      log('The watchdog timer is not installed.');
    }
  }
  return plan;
}
