const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const outDir = path.join(process.cwd(), 'reports', 'ui-chat-test');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prompt = 'Explain how to check disk usage on Windows in a practical way.';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4781/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#chatInput', { timeout: 30000 });

  const initial = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#messages .message'));
    return rows.map((row) => ({
      meta: String(row.querySelector('.meta')?.textContent || '').trim(),
      text: String(row.querySelector('div:last-child')?.textContent || '').trim()
    }));
  });

  await page.fill('#chatInput', prompt);
  await page.click('#chatSend');

  await page.waitForFunction((initialLen) => {
    const rows = Array.from(document.querySelectorAll('#messages .message'));
    if (rows.length <= initialLen) return false;
    const newer = rows.slice(initialLen);
    const brainRows = newer.filter((row) => String(row.className || '').includes('brain'));
    if (!brainRows.length) return false;
    const lastBrain = brainRows[brainRows.length - 1];
    const text = String(lastBrain.querySelector('div:last-child')?.textContent || '').trim();
    const meta = String(lastBrain.querySelector('.meta')?.textContent || '').trim();
    const hasJobMeta = /Asolaria Brain/i.test(meta);
    const done = text.length > 0 && !/Waiting for job completion|status:\s*running/i.test(text);
    return hasJobMeta && done;
  }, initial.length, { timeout: 180000 });

  const result = await page.evaluate((initialLen) => {
    const rows = Array.from(document.querySelectorAll('#messages .message'));
    const newer = rows.slice(initialLen).map((row) => ({
      cls: String(row.className || ''),
      meta: String(row.querySelector('.meta')?.textContent || '').trim(),
      text: String(row.querySelector('div:last-child')?.textContent || '').trim()
    }));
    const brain = newer.filter((r) => r.cls.includes('brain'));
    const lastBrain = brain[brain.length - 1] || null;
    return { totalMessages: rows.length, newMessages: newer, lastBrain };
  }, initial.length);

  const screenshot = path.join(outDir, `desktop-chat-fixed-${stamp}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await browser.close();

  const out = { stamp, prompt, initialCount: initial.length, result, screenshot };
  const reportPath = path.join(outDir, `desktop-chat-fixed-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(outDir, 'desktop-latest.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: true, reportPath, screenshot, out }, null, 2));
})();
