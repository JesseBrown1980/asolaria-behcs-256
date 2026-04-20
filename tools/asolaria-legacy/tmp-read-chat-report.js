const fs = require('fs');
const d = JSON.parse(fs.readFileSync('reports/ui-chat-test/desktop-chat-fixed-2026-02-21T19-06-23-873Z.json', 'utf8'));
const m = JSON.parse(fs.readFileSync('reports/ui-chat-test/chat-ui-test-2026-02-21T19-05-16-774Z.json', 'utf8'));
const out = {
  desktopMeta: d.result.lastBrain.meta,
  desktopTextPreview: d.result.lastBrain.text.slice(0, 260),
  desktopHasCodeFence: d.result.lastBrain.text.includes('```powershell'),
  mobileStatus: m.mobile.chatStatus,
  mobileMeta: m.mobile.jobMeta,
  mobileHasCodeFence: m.mobile.jobBox.includes('```powershell'),
  desktopScreenshot: d.screenshot,
  mobileScreenshot: m.mobile.screenshot,
  desktopReport: 'reports/ui-chat-test/desktop-chat-fixed-2026-02-21T19-06-23-873Z.json',
  mobileReport: 'reports/ui-chat-test/chat-ui-test-2026-02-21T19-05-16-774Z.json'
};
console.log(JSON.stringify(out, null, 2));
