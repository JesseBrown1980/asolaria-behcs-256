// Unit test table for resolveSpawnCommand — 6 cases from the audit.
// Plain node, no test runner dependency. Exits non-zero on any failure.

import { resolveSpawnCommand } from '../src/index.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push({ label, actual, expected });
    console.log(`  FAIL  ${label}`);
    console.log(`        expected: ${e}`);
    console.log(`        actual:   ${a}`);
  }
}

console.log('resolveSpawnCommand — audit test table');
console.log('---------------------------------------');

// Case 1: Windows .cmd → cmd.exe /c rewrite
{
  const r = resolveSpawnCommand('C:\\tools\\opencode.cmd', ['run', '--flag'], 'win32');
  eq(
    r,
    {
      cmd: 'cmd.exe',
      args: ['/c', 'C:\\tools\\opencode.cmd', 'run', '--flag'],
      opts: { windowsVerbatimArguments: false },
    },
    'Case 1: C:\\tools\\opencode.cmd + win32 → cmd.exe /c rewrite',
  );
}

// Case 2: Windows .exe → direct spawn
{
  const r = resolveSpawnCommand('C:\\tools\\opencode.exe', ['run'], 'win32');
  eq(
    r,
    { cmd: 'C:\\tools\\opencode.exe', args: ['run'], opts: {} },
    'Case 2: C:\\tools\\opencode.exe + win32 → direct',
  );
}

// Case 3: Linux bare binary → direct spawn
{
  const r = resolveSpawnCommand('/usr/local/bin/opencode', ['--help'], 'linux');
  eq(
    r,
    { cmd: '/usr/local/bin/opencode', args: ['--help'], opts: {} },
    'Case 3: /usr/local/bin/opencode + linux → direct',
  );
}

// Case 4: macOS .sh script → direct (no Windows rewrite)
{
  const r = resolveSpawnCommand('/usr/local/bin/opencode.sh', ['--v'], 'darwin');
  eq(
    r,
    { cmd: '/usr/local/bin/opencode.sh', args: ['--v'], opts: {} },
    'Case 4: /usr/local/bin/opencode.sh + darwin → direct',
  );
}

// Case 5: Uppercase .BAT — case-insensitive match
{
  const r = resolveSpawnCommand('C:\\tools\\opencode.BAT', ['x'], 'win32');
  eq(
    r,
    {
      cmd: 'cmd.exe',
      args: ['/c', 'C:\\tools\\opencode.BAT', 'x'],
      opts: { windowsVerbatimArguments: false },
    },
    'Case 5: .BAT uppercase + win32 → cmd.exe /c rewrite',
  );
}

// Case 6: Space-in-path still works (no shell-escaping we have to do;
// spawn passes argv through cleanly — that's the whole point vs `exec`)
{
  const r = resolveSpawnCommand(
    'C:\\Program Files\\oc\\opencode.cmd',
    ['worker', '--id=42'],
    'win32',
  );
  eq(
    r,
    {
      cmd: 'cmd.exe',
      args: ['/c', 'C:\\Program Files\\oc\\opencode.cmd', 'worker', '--id=42'],
      opts: { windowsVerbatimArguments: false },
    },
    'Case 6: space-in-path .cmd + win32 → cmd.exe /c rewrite (spawn-safe)',
  );
}

console.log('---------------------------------------');
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('FAILURES:');
  for (const f of failures) {
    console.error(JSON.stringify(f, null, 2));
  }
  process.exit(1);
}

process.exit(0);
