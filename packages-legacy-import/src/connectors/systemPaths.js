const fs = require('fs');

function firstExisting(paths) {
  for (const item of paths) {
    if (item && fs.existsSync(item)) {
      return item;
    }
  }
  return null;
}

function resolveToolPaths() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const appData = process.env.APPDATA || '';

  return {
    chromePath: firstExisting([
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ]),
    padConsolePath: firstExisting([
      'C:\\Program Files (x86)\\Power Automate Desktop\\dotnet\\PAD.Console.Host.exe',
      'C:\\Program Files (x86)\\Power Automate Desktop\\PAD.Console.Host.exe'
    ]),
    padRobotPath: firstExisting([
      'C:\\Program Files (x86)\\Power Automate Desktop\\PAD.RobotV2.exe'
    ]),
    codexPath: firstExisting([
      process.env.ASOLARIA_CODEX_PATH || '',
      appData ? `${appData}\\npm\\codex.cmd` : '',
      appData ? `${appData}\\npm\\codex` : '',
      'C:\\nvm4w\\nodejs\\codex.cmd',
      'C:\\nvm4w\\nodejs\\codex'
    ]),
    claudePath: firstExisting([
      process.env.ASOLARIA_CLAUDE_PATH || '',
      appData ? `${appData}\\npm\\claude.cmd` : '',
      'C:\\nvm4w\\nodejs\\claude.cmd',
      'C:\\Users\\acer\\.local\\bin\\claude.exe'
    ]),
    cursorPath: firstExisting([
      'C:\\Program Files\\cursor\\resources\\app\\bin\\cursor.cmd',
      'C:\\Program Files\\cursor\\Cursor.exe',
      appData ? `${appData}\\npm\\cursor.cmd` : ''
    ]),
    cursorAgentPath: firstExisting([
      process.env.ASOLARIA_CURSOR_AGENT_PATH || '',
      'C:\\Program Files\\cursor\\resources\\app\\bin\\cursor-agent.cmd',
      'C:\\Program Files\\cursor\\resources\\app\\bin\\cursor-agent.exe',
      appData ? `${appData}\\npm\\cursor-agent.cmd` : '',
      appData ? `${appData}\\npm\\cursor-agent.exe` : '',
      localAppData ? `${localAppData}\\Programs\\cursor-agent\\cursor-agent.exe` : ''
    ]),
    geminiPath: firstExisting([
      process.env.ASOLARIA_GEMINI_PATH || '',
      'C:\\nvm4w\\nodejs\\gemini.cmd',
      appData ? `${appData}\\npm\\gemini.cmd` : ''
    ]),
    gwsPath: firstExisting([
      process.env.ASOLARIA_GWS_PATH || '',
      appData ? `${appData}\\npm\\gws.cmd` : '',
      'C:\\nvm4w\\nodejs\\gws.cmd'
    ]),
    nvidiaSmiPath: firstExisting([
      process.env.ASOLARIA_NVIDIA_SMI_PATH || '',
      'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'
    ]),
    wslPath: firstExisting([
      'C:\\Windows\\System32\\wsl.exe'
    ]),
    localAppData
  };
}

module.exports = {
  resolveToolPaths
};
