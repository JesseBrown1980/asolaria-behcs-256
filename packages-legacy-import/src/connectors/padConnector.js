const { spawn } = require('child_process');
const fs = require('fs');
const { resolveToolPaths } = require('./systemPaths');

const VALID_MODES = new Set(['LocalRun', 'Run', 'Debug']);

async function openPadDesktop() {
  const toolPaths = resolveToolPaths();
  if (!toolPaths.padConsolePath) {
    throw new Error('Power Automate Desktop was not found.');
  }

  const child = spawn(toolPaths.padConsolePath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();
  return toolPaths.padConsolePath;
}

function runPadPackage(options, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const toolPaths = resolveToolPaths();
    if (!toolPaths.padRobotPath) {
      return reject(new Error('Power Automate Robot executable was not found.'));
    }

    const packagePath = String(options.packagePath || '').trim();
    if (!packagePath) {
      return reject(new Error('Package path is required.'));
    }
    if (!fs.existsSync(packagePath)) {
      return reject(new Error(`Package not found: ${packagePath}`));
    }

    const modeInput = String(options.mode || 'LocalRun');
    const mode = VALID_MODES.has(modeInput) ? modeInput : 'LocalRun';

    const args = ['--path', packagePath, '--mode', mode, '--trigger', 'Local'];
    if (options.disableScreenshots) {
      args.push('--disablescreenshots');
    }

    const child = spawn(toolPaths.padRobotPath, args, {
      windowsHide: true,
      cwd: process.cwd(),
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('PAD package run timed out.'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start PAD: ${error.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(`PAD exited with code ${code}. ${stderr.trim() || stdout.trim()}`.trim()));
      }

      resolve({
        exitCode: code,
        mode,
        packagePath,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

function manifest() {
  return {
    id: "pad",
    version: "1.0.0",
    description: "Connector for Microsoft Power Automate Desktop, launching the console and executing robot packages locally",
    capabilities: ["desktop-launch", "package-execution"],
    readScopes: [],
    writeScopes: [],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 30000,
    secretRequirements: [],
    sideEffects: ["child-process-spawn", "desktop-ui-launch"],
    failureModes: ["pad-not-found", "package-not-found", "pad-timeout", "pad-nonzero-exit"],
    emittedEvents: []
  };
}

module.exports = {
  openPadDesktop,
  runPadPackage,
  manifest
};
