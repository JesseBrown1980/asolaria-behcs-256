const fs = require('fs');
const { chromium } = require('playwright');

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function dedupe(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const RISKY_CONTROL_PATTERNS = [
  /shutdown/i,
  /restart/i,
  /reboot/i,
  /power\b/i,
  /wake-?on-?lan/i,
  /\bwol\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bformat\b/i,
  /\bfactory\b/i
];

function shouldSkipRiskyControl(control = {}) {
  const probe = [
    String(control.label || ""),
    String(control.id || ""),
    String(control.href || "")
  ].join(" ");
  return RISKY_CONTROL_PATTERNS.some((pattern) => pattern.test(probe));
}

(async () => {
  const urls = String(arg('urls', '')).split('|').map((s) => s.trim()).filter(Boolean);
  const outPath = arg('out', 'live-control-sweep.json');
  if (!urls.length) {
    throw new Error('No URLs provided.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const report = {
    startedAt: new Date().toISOString(),
    urls,
    pages: []
  };

  for (const baseUrl of urls) {
    const pageReport = {
      url: baseUrl,
      controlCount: 0,
      tested: 0,
      skipped: 0,
      failures: [],
      apiErrors: [],
      consoleErrors: [],
      jsErrors: []
    };

    let activeControl = '(none)';

    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
    page.removeAllListeners('response');
    page.removeAllListeners('requestfailed');

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        pageReport.consoleErrors.push({
          control: activeControl,
          message: String(msg.text() || '').slice(0, 600)
        });
      }
    });

    page.on('pageerror', (err) => {
      pageReport.jsErrors.push({
        control: activeControl,
        message: String(err && err.message ? err.message : err).slice(0, 600)
      });
    });

    page.on('response', (res) => {
      try {
        const url = res.url();
        if (url.includes('/api/') && res.status() >= 400) {
          pageReport.apiErrors.push({
            control: activeControl,
            status: res.status(),
            url: String(url).slice(0, 500)
          });
        }
      } catch (_err) {}
    });

    page.on('requestfailed', (req) => {
      try {
        const url = req.url();
        if (url.includes('/api/')) {
          const failure = req.failure();
          pageReport.apiErrors.push({
            control: activeControl,
            status: 'failed',
            url: String(url).slice(0, 500),
            error: String(failure && failure.errorText ? failure.errorText : '').slice(0, 240)
          });
        }
      } catch (_err) {}
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);

    const controls = await page.evaluate(() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width < 4 || rect.height < 4) return false;
        const cs = window.getComputedStyle(el);
        if (!cs) return true;
        if (cs.visibility === 'hidden' || cs.display === 'none') return false;
        if (Number(cs.opacity || '1') === 0) return false;
        return true;
      };

      const safeEscape = (value) => {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
        return String(value).replace(/([ #;?%&,.+*~\':"!^$\[\]()=>|/])/g, '\\$1');
      };

      const textFor = (el) => {
        const direct = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        const aria = (el.getAttribute('aria-label') || '').trim();
        const title = (el.getAttribute('title') || '').trim();
        const value = (el.getAttribute('value') || '').trim();
        return direct || aria || title || value || '';
      };

      const xpathFor = (el) => {
        if (!el || el.nodeType !== 1) return '';
        if (el.id) {
          const id = String(el.id).replace(/"/g, '\\"');
          return `//*[@id="${id}"]`;
        }
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && node !== document.body) {
          const tag = node.nodeName.toLowerCase();
          let index = 1;
          let sib = node.previousElementSibling;
          while (sib) {
            if (sib.nodeName.toLowerCase() === tag) index += 1;
            sib = sib.previousElementSibling;
          }
          parts.unshift(`${tag}[${index}]`);
          node = node.parentElement;
        }
        return '/html/body/' + parts.join('/');
      };

      const selectors = [
        'button',
        '[role="button"]',
        'input[type="button"]',
        'input[type="submit"]',
        'a[href]',
        'summary'
      ].join(',');

      const nodes = Array.from(document.querySelectorAll(selectors));
      const seen = new Set();
      const out = [];
      let index = 0;

      for (const el of nodes) {
        if (!isVisible(el)) continue;
        const labelCore = textFor(el).slice(0, 140);
        const href = (el.getAttribute('href') || '').trim();
        const tag = el.tagName.toLowerCase();
        const id = (el.id || '').trim();
        const role = (el.getAttribute('role') || '').trim();
        const key = [tag, id, role, labelCore, href].join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        const idSelector = id ? `#${safeEscape(id)}` : '';
        const xpath = xpathFor(el);
        out.push({
          index: index += 1,
          tag,
          id,
          role,
          href: href.slice(0, 400),
          label: labelCore || `(no-label ${tag})`,
          idSelector,
          xpath
        });
      }

      return out.slice(0, 120);
    });

    pageReport.controlCount = controls.length;

    for (const control of controls) {
      activeControl = `${control.tag}:${control.label}`.slice(0, 220);
      try {
        if (page.url() !== baseUrl) {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForTimeout(600);
        }

        let locator = null;
        if (control.idSelector) {
          locator = page.locator(control.idSelector).first();
        } else if (control.xpath) {
          locator = page.locator(`xpath=${control.xpath}`).first();
        }

        if (!locator || (await locator.count()) < 1) {
          pageReport.failures.push({ control: activeControl, reason: 'locator_not_found' });
          continue;
        }

        const visible = await locator.isVisible().catch(() => false);
        if (!visible) {
          pageReport.skipped += 1;
          continue;
        }

        const enabled = await locator.isEnabled().catch(() => true);
        if (!enabled) {
          pageReport.skipped += 1;
          continue;
        }

        if (shouldSkipRiskyControl(control)) {
          pageReport.skipped += 1;
          continue;
        }

        await locator.click({ timeout: 5000 });
        await page.waitForTimeout(350);
        await page.keyboard.press('Escape').catch(() => {});
        pageReport.tested += 1;
      } catch (err) {
        pageReport.failures.push({
          control: activeControl,
          reason: String(err && err.message ? err.message : err).slice(0, 700)
        });
      }
    }

    pageReport.apiErrors = dedupe(pageReport.apiErrors, (x) => `${x.status}|${x.url}|${x.control}`);
    pageReport.consoleErrors = dedupe(pageReport.consoleErrors, (x) => `${x.message}|${x.control}`);
    pageReport.jsErrors = dedupe(pageReport.jsErrors, (x) => `${x.message}|${x.control}`);

    report.pages.push(pageReport);
  }

  report.finishedAt = new Date().toISOString();
  await browser.close();

  fs.mkdirSync(require('path').dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  const summary = report.pages.map((p) => ({
    url: p.url,
    controls: p.controlCount,
    tested: p.tested,
    skipped: p.skipped,
    failures: p.failures.length,
    apiErrors: p.apiErrors.length,
    consoleErrors: p.consoleErrors.length,
    jsErrors: p.jsErrors.length
  }));

  console.log(JSON.stringify({ ok: true, outPath, summary }, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }, null, 2));
  process.exit(1);
});
