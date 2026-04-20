const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(process.cwd(), 'reports', 'ui-chat-test');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prompt = 'Explain how to check disk usage on Windows in a practical way.';
  const token = process.env.ASOLARIA_TOKEN || '';

  const browser = await chromium.launch({ headless: true });

  const results = {
    stamp,
    prompt,
    desktop: {},
    mobile: {}
  };

  // Desktop UI test
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4781/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#chatInput', { timeout: 30000 });
    await page.fill('#chatInput', prompt);
    await page.click('#chatSend');

    // Wait for brain completion text (job message replaced with final result)
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('#messages .message.brain'));
      if (!rows.length) return false;
      const last = rows[rows.length - 1];
      const body = last.querySelector('div:last-child');
      if (!body) return false;
      const text = String(body.textContent || '').trim();
      return text.length > 0 && !text.includes('Waiting for job completion...') && !text.includes('status: running');
    }, null, { timeout: 180000 });

    const desktopData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#messages .message'));
      const last = rows[rows.length - 1];
      const metaEl = last ? last.querySelector('.meta') : null;
      const bodyEl = last ? last.querySelector('div:last-child') : null;
      const text = String(bodyEl?.textContent || '').trim();
      const meta = String(metaEl?.textContent || '').trim();
      return { totalMessages: rows.length, meta, text };
    });

    const desktopShot = path.join(outDir, `desktop-chat-${stamp}.png`);
    await page.screenshot({ path: desktopShot, fullPage: true });
    results.desktop = { ...desktopData, screenshot: desktopShot };
    await context.close();
  }

  // Mobile console UI test (emulated phone viewport)
  {
    const context = await browser.newContext({ ...devices['Galaxy S9+'] });
    const page = await context.newPage();
    const url = `http://127.0.0.1:4781/mobile-console.html?token=${encodeURIComponent(token)}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('#chatInput', { timeout: 30000 });
    await page.fill('#chatInput', prompt);
    await page.click('#sendBtn');

    await page.waitForFunction(() => {
      const meta = document.querySelector('#jobResultMeta');
      const box = document.querySelector('#jobResultBox');
      const metaText = String(meta?.textContent || '').toLowerCase();
      const boxText = String(box?.textContent || '').trim();
      return (metaText.includes('status:completed') || metaText.includes('status=completed') || metaText.includes('status: completed') || metaText.includes('status= completed')) && boxText.length > 0;
    }, null, { timeout: 180000 });

    const mobileData = await page.evaluate(() => {
      const chatStatus = String(document.querySelector('#chatStatus')?.textContent || '').trim();
      const jobMeta = String(document.querySelector('#jobResultMeta')?.textContent || '').trim();
      const jobBox = String(document.querySelector('#jobResultBox')?.textContent || '').trim();
      return { chatStatus, jobMeta, jobBox };
    });

    const mobileShot = path.join(outDir, `mobile-chat-${stamp}.png`);
    await page.screenshot({ path: mobileShot, fullPage: true });
    results.mobile = { ...mobileData, screenshot: mobileShot };
    await context.close();
  }

  await browser.close();

  const reportPath = path.join(outDir, `chat-ui-test-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  const latestPath = path.join(outDir, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(results, null, 2));

  console.log(JSON.stringify({ ok: true, reportPath, latestPath, results }, null, 2));
})();
