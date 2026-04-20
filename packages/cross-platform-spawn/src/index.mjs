// @asolaria/cross-platform-spawn
//
// Fixes the classic Windows child_process.spawn ENOENT bug:
// on win32, spawn() can only launch *.exe directly — *.cmd and *.bat
// shim files must be launched through cmd.exe /c.
//
// Typical failure mode:
//   spawn('C:\\tools\\opencode.cmd', [...])  →  ENOENT
//
// Fix:
//   spawn('cmd.exe', ['/c', 'C:\\tools\\opencode.cmd', ...], { windowsVerbatimArguments: false })
//
// Usage:
//   import { resolveSpawnCommand, spawnCross } from '@asolaria/cross-platform-spawn';
//   const { cmd, args, opts } = resolveSpawnCommand(openCodePath, workerArgs);
//   const child = spawn(cmd, args, { ...opts, ...userOpts });
//
// Or just:
//   const child = spawnCross(openCodePath, workerArgs, userOpts);

import { spawn } from 'node:child_process';

const CMD_BAT_RE = /\.(cmd|bat)$/i;

/**
 * Resolve a cross-platform spawn command.
 *
 * On win32, if `path` ends in `.cmd` or `.bat` (case-insensitive),
 * rewrites the call through `cmd.exe /c` so Node's spawn() can find it.
 * Otherwise returns the original command unchanged.
 *
 * @param {string}   path     Executable path (e.g. "C:\\tools\\opencode.cmd").
 * @param {string[]} args     Arguments to pass to the executable.
 * @param {string}   [platform=process.platform] Platform override for testing.
 * @returns {{cmd: string, args: string[], opts: object}}
 */
export function resolveSpawnCommand(path, args = [], platform = process.platform) {
  if (platform === 'win32' && CMD_BAT_RE.test(path)) {
    return {
      cmd: 'cmd.exe',
      args: ['/c', path, ...args],
      opts: { windowsVerbatimArguments: false },
    };
  }
  return {
    cmd: path,
    args: [...args],
    opts: {},
  };
}

/**
 * Convenience wrapper: resolves, then calls child_process.spawn.
 * Caller opts override our opts (except we always preserve the cmd/args rewrite).
 *
 * @param {string}   path
 * @param {string[]} args
 * @param {object}   [opts={}]  Passed through to child_process.spawn, merged over resolver opts.
 * @returns {import('node:child_process').ChildProcess}
 */
export function spawnCross(path, args = [], opts = {}) {
  const resolved = resolveSpawnCommand(path, args);
  const mergedOpts = { ...resolved.opts, ...opts };
  return spawn(resolved.cmd, resolved.args, mergedOpts);
}

export default { resolveSpawnCommand, spawnCross };
