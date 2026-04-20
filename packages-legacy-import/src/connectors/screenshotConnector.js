const path = require('path');
const fs = require('fs');
const net = require("net");
const { normalizeUrl } = require('./chromeConnector');
const { resolveCapturePath } = require("../runtimePaths");

let chromium = null;
let browserPromise = null;
let contextPromise = null;

function getChromium() {
  if (!chromium) {
    ({ chromium } = require("playwright"));
  }
  return chromium;
}

function safeFileName(raw) {
  const fallback = `capture-${Date.now()}.png`;
  const value = String(raw || '').trim();
  if (!value) return fallback;
  const base = value.endsWith('.png') ? value : `${value}.png`;
  return base.replace(/[^a-zA-Z0-9._-]/g, '-');
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = getChromium().launch({ channel: 'chrome', headless: true }).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

async function getContext() {
  if (!contextPromise) {
    contextPromise = getBrowser()
      .then((browser) => browser.newContext({ viewport: { width: 1366, height: 768 } }))
      .catch((error) => {
        contextPromise = null;
        throw error;
      });
  }
  return contextPromise;
}

async function createBrowserTaskContext(options = {}) {
  const useChromePersistentProfile = Boolean(options.useChromePersistentProfile);
  if (!useChromePersistentProfile) {
    return {
      context: await getContext(),
      ownsContext: false,
      mode: "shared"
    };
  }

  const userDataDir = String(options.chromeUserDataDir || "").trim();
  if (!userDataDir) {
    throw new Error("chromeUserDataDir is required when useChromePersistentProfile=true.");
  }
  if (!fs.existsSync(userDataDir)) {
    throw new Error(`Chrome user data directory does not exist: ${userDataDir}`);
  }
  const profileDirectory = String(options.chromeProfileDirectory || "").trim();
  const viewportWidth = clampInt(options.viewportWidth, 1366, 640, 3840);
  const viewportHeight = clampInt(options.viewportHeight, 768, 480, 2160);
  const args = [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-translate",
    "--disable-features=Translate,TranslateUI"
  ];
  if (profileDirectory) {
    args.push(`--profile-directory=${profileDirectory}`);
  }

  try {
    const context = await getChromium().launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: options.headless !== false,
      viewport: { width: viewportWidth, height: viewportHeight },
      args
    });
    return {
      context,
      ownsContext: true,
      mode: "persistent_profile"
    };
  } catch (error) {
    const detail = String(error?.message || error || "profile_launch_failed");
    throw new Error(
      `Failed to launch Chrome persistent profile context. userDataDir="${userDataDir}", profileDirectory="${profileDirectory || "(default)"}", reason="${detail}".`
    );
  }
}

async function warmScreenshotWorker() {
  await getContext();
}

async function closeScreenshotWorker() {
  try {
    if (contextPromise) {
      const context = await contextPromise;
      await context.close();
    }
  } catch (_error) {
    // Ignore close errors on shutdown.
  } finally {
    contextPromise = null;
  }

  try {
    if (browserPromise) {
      const browser = await browserPromise;
      await browser.close();
    }
  } catch (_error) {
    // Ignore close errors on shutdown.
  } finally {
    browserPromise = null;
  }
}

async function captureScreenshot(options) {
  const normalizedUrl = normalizeUrl(options.url);
  const width = Number(options.width || 1366);
  const height = Number(options.height || 768);
  const waitMs = Number(options.waitMs || 1200);

  const fileName = safeFileName(options.fileName);
  const outputDir = resolveCapturePath();
  const outputPath = path.join(outputDir, fileName);

  fs.mkdirSync(outputDir, { recursive: true });

  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width, height });
    await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(waitMs);
    await page.screenshot({ path: outputPath, fullPage: true });

    return {
      url: normalizedUrl,
      outputPath,
      width,
      height
    };
  } finally {
    await page.close();
  }
}

function collapseWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeHostList(list) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const value = String(item || "").trim().toLowerCase();
    if (!value || !/^[a-z0-9.-]+$/.test(value)) continue;
    out.push(value);
  }
  return Array.from(new Set(out));
}

function isLoopbackHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isPrivateIpv4(hostname) {
  const parts = String(hostname || "").trim().split(".").map((item) => Number(item));
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 127) return true;
  return false;
}

function isPrivateIpv6(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host || host.includes(".")) {
    return false;
  }
  if (host === "::1") return true;
  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

function isPrivateHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return false;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) return isPrivateIpv6(host);
  if (host.endsWith(".local")) return true;
  return false;
}

function ensureSafeBrowserUrl(rawUrl, options = {}) {
  const normalized = normalizeUrl(rawUrl);
  const parsed = new URL(normalized);
  if (parsed.username || parsed.password) {
    throw new Error("Browser task URL must not contain embedded credentials.");
  }

  const host = String(parsed.hostname || "").trim().toLowerCase();
  if (!host) {
    throw new Error("Browser task URL host is missing.");
  }

  const allowLoopback = options.allowLoopback !== false;
  const allowPrivateNetwork = Boolean(options.allowPrivateNetwork);
  const allowedHosts = normalizeHostList(options.allowedHosts || []);

  if (allowedHosts.length > 0) {
    const matched = allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    if (!matched) {
      throw new Error(`Browser task URL host "${host}" is not in the allowlist.`);
    }
  }

  if (isLoopbackHost(host) && !allowLoopback) {
    throw new Error("Browser task loopback URLs are disabled by policy.");
  }

  if (isPrivateHost(host) && !isLoopbackHost(host) && !allowPrivateNetwork) {
    throw new Error("Browser task private-network URLs are blocked by policy.");
  }

  return normalized;
}

function sanitizeSelector(value, fallback = "body") {
  const selector = String(value || fallback).trim();
  if (!selector) {
    throw new Error("Browser task selector is required.");
  }
  if (selector.length > 240) {
    throw new Error("Browser task selector is too long.");
  }
  return selector;
}

function sanitizeExtractName(value, fallback) {
  const name = String(value || "").trim().toLowerCase();
  if (!name) return fallback;
  if (!/^[a-z0-9._:-]{1,60}$/.test(name)) {
    throw new Error(`Invalid extract name "${value}".`);
  }
  return name;
}

async function findActionableLocator(page, selector, options = {}) {
  const requireVisible = options.requireVisible !== false;
  const requireEnabled = options.requireEnabled !== false;
  const requireEditable = Boolean(options.requireEditable);
  const fallbackToFirst = Boolean(options.fallbackToFirst);
  const maxCandidates = clampInt(options.maxCandidates, 10, 1, 40);
  const locator = page.locator(selector);
  const total = await locator.count();
  if (total < 1) {
    throw new Error(`No elements matched selector "${selector}".`);
  }

  const limit = Math.min(total, maxCandidates);
  let firstError = null;
  for (let idx = 0; idx < limit; idx += 1) {
    const candidate = locator.nth(idx);
    try {
      if (requireVisible) {
        const visible = await candidate.isVisible();
        if (!visible) continue;
      }
      if (requireEnabled) {
        const enabled = await candidate.isEnabled();
        if (!enabled) continue;
      }
      if (requireEditable) {
        const editable = await candidate.isEditable();
        if (!editable) continue;
      }
      return candidate;
    } catch (error) {
      if (!firstError) {
        firstError = error;
      }
    }
  }

  if (firstError) {
    throw firstError;
  }

  if (fallbackToFirst) {
    // Optional compatibility fallback for callers that still want Playwright's native action error.
    return locator.first();
  }

  throw new Error(`No visible/actionable elements matched selector "${selector}" (matches=${total}).`);
}

async function buildPageFailureHint(page) {
  try {
    const currentUrl = String(page.url() || "").trim().slice(0, 220);
    const title = String(await page.title()).trim().slice(0, 120);
    const text = await page.evaluate(() => {
      const raw = document?.body ? String(document.body.innerText || "") : "";
      return raw.slice(0, 320);
    });
    const snippet = collapseWhitespace(text || "").slice(0, 220);
    const parts = [];
    if (currentUrl) {
      parts.push(`pageUrl="${currentUrl}"`);
    }
    if (title) {
      parts.push(`pageTitle="${title}"`);
    }
    if (snippet) {
      parts.push(`pageText="${snippet}"`);
    }
    return parts.join(", ");
  } catch (_error) {
    return "";
  }
}

function normalizeTaskStep(rawStep, index) {
  const step = rawStep && typeof rawStep === "object" ? rawStep : {};
  const action = String(step.action || "").trim().toLowerCase();
  if (!action) {
    throw new Error(`Step ${index} is missing an action.`);
  }

  if (action === "goto") {
    const url = String(step.url || "").trim();
    if (!url) throw new Error(`Step ${index} goto action requires url.`);
    return { action, url };
  }
  if (action === "click") {
    return {
      action,
      selector: sanitizeSelector(step.selector)
    };
  }
  if (action === "type") {
    const text = String(step.text || "");
    if (text.length > 2000) {
      throw new Error(`Step ${index} type text is too long.`);
    }
    return {
      action,
      selector: sanitizeSelector(step.selector),
      text,
      clear: step.clear !== false,
      delayMs: clampInt(step.delayMs, 0, 0, 120)
    };
  }
  if (action === "press") {
    const key = String(step.key || "").trim();
    if (!key || key.length > 40) {
      throw new Error(`Step ${index} press action requires a valid key.`);
    }
    return { action, key };
  }
  if (action === "wait") {
    return {
      action,
      ms: clampInt(step.ms, 350, 0, 15000)
    };
  }
  if (action === "extract_text") {
    return {
      action,
      selector: sanitizeSelector(step.selector, "body"),
      name: sanitizeExtractName(step.name, `text_${index}`),
      limit: clampInt(step.limit, 8000, 200, 80000)
    };
  }
  if (action === "extract_links") {
    return {
      action,
      selector: sanitizeSelector(step.selector, "a[href]"),
      name: sanitizeExtractName(step.name, `links_${index}`),
      limit: clampInt(step.limit, 30, 1, 150)
    };
  }

  throw new Error(`Step ${index} uses unsupported action "${action}".`);
}

async function inspectPage(options) {
  const normalizedUrl = normalizeUrl(options.url);
  const waitMs = Number(options.waitMs || 1200);
  const maxChars = Math.max(2000, Math.min(120000, Number(options.maxChars || 24000)));
  const maxLinks = Math.max(5, Math.min(80, Number(options.maxLinks || 40)));

  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(waitMs);

    const title = String(await page.title()).trim();
    const description = await page
      .locator('meta[name="description"]')
      .first()
      .getAttribute("content")
      .catch(() => "");

    const content = await page.evaluate(() => {
      const text = document?.body ? document.body.innerText : "";
      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 200)
        .map((anchor) => ({
          text: String(anchor.textContent || "").trim(),
          href: String(anchor.getAttribute("href") || "").trim()
        }))
        .filter((item) => item.href);
      return { text, links };
    });

    const text = collapseWhitespace(content?.text || "").slice(0, maxChars);
    const links = Array.isArray(content?.links)
      ? content.links
        .filter((item) => item && typeof item.href === "string")
        .slice(0, maxLinks)
      : [];

    return {
      url: normalizedUrl,
      title,
      description: collapseWhitespace(description || "").slice(0, 400),
      text,
      links
    };
  } finally {
    await page.close();
  }
}

async function runBrowserTask(options = {}) {
  const normalizedUrl = ensureSafeBrowserUrl(options.url, options);
  const waitMs = clampInt(options.waitMs, 900, 0, 12000);
  const maxChars = clampInt(options.maxChars, 24000, 2000, 120000);
  const maxLinks = clampInt(options.maxLinks, 40, 5, 120);
  const actionTimeoutMs = clampInt(options.actionTimeoutMs, 12000, 1000, 45000);
  const rawSteps = Array.isArray(options.steps) ? options.steps : [];
  const maxSteps = clampInt(options.maxSteps, 20, 1, 40);
  if (rawSteps.length > maxSteps) {
    throw new Error(`Browser task has too many steps (${rawSteps.length}); limit is ${maxSteps}.`);
  }
  const steps = rawSteps.map((step, idx) => normalizeTaskStep(step, idx + 1));

  const contextState = await createBrowserTaskContext(options);
  const context = contextState.context;
  const page = await context.newPage();
  const stepResults = [];
  const extracts = {};
  try {
    await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const stepNumber = index + 1;
      const report = {
        index: stepNumber,
        action: step.action,
        ok: true
      };
      try {
        if (step.action === "goto") {
          const nextUrl = ensureSafeBrowserUrl(step.url, options);
          await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        } else if (step.action === "click") {
          const locator = await findActionableLocator(page, step.selector, {
            requireVisible: true,
            requireEnabled: true
          });
          await locator.click({ timeout: actionTimeoutMs });
        } else if (step.action === "type") {
          const locator = await findActionableLocator(page, step.selector, {
            requireVisible: true,
            requireEnabled: true,
            requireEditable: true
          });
          if (step.clear) {
            await locator.fill("", { timeout: actionTimeoutMs });
          }
          if (step.delayMs > 0) {
            await locator.type(step.text, { timeout: actionTimeoutMs, delay: step.delayMs });
          } else {
            await locator.type(step.text, { timeout: actionTimeoutMs });
          }
          report.typedChars = step.text.length;
        } else if (step.action === "press") {
          await page.keyboard.press(step.key);
        } else if (step.action === "wait") {
          await page.waitForTimeout(step.ms);
          report.waitMs = step.ms;
        } else if (step.action === "extract_text") {
          const text = await page.locator(step.selector).first().innerText({ timeout: actionTimeoutMs });
          const collapsed = collapseWhitespace(text || "").slice(0, step.limit);
          extracts[step.name] = collapsed;
          report.extract = step.name;
          report.chars = collapsed.length;
        } else if (step.action === "extract_links") {
          const links = await page.$$eval(
            step.selector,
            (nodes, limit) => {
              const max = Math.max(1, Math.min(200, Number(limit) || 20));
              return nodes
                .slice(0, max)
                .map((node) => {
                  const rawHref = String(node.getAttribute("href") || "").trim();
                  if (!rawHref) return null;
                  let href = rawHref;
                  try {
                    href = new URL(rawHref, window.location.href).toString();
                  } catch (_error) {
                    // keep raw href
                  }
                  return {
                    text: String(node.textContent || "").trim().slice(0, 160),
                    href: String(href || "").slice(0, 500)
                  };
                })
                .filter(Boolean);
            },
            step.limit
          );
          extracts[step.name] = links;
          report.extract = step.name;
          report.count = links.length;
        }
      } catch (error) {
        report.ok = false;
        report.error = String(error?.message || error || "step_failed");
        stepResults.push(report);
        const hint = await buildPageFailureHint(page);
        throw new Error(
          `Browser task step ${stepNumber} failed: ${report.error}${hint ? ` (${hint})` : ""}`
        );
      }
      stepResults.push(report);
    }

    const title = String(await page.title()).trim();
    const description = await page
      .locator('meta[name="description"]')
      .first()
      .getAttribute("content")
      .catch(() => "");
    const summary = await page.evaluate(({ maxTextChars, maxAnchorCount }) => {
      const text = document?.body ? String(document.body.innerText || "") : "";
      const anchors = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, Math.max(1, Math.min(200, Number(maxAnchorCount) || 40)))
        .map((anchor) => {
          const href = String(anchor.getAttribute("href") || "").trim();
          if (!href) return null;
          let fullHref = href;
          try {
            fullHref = new URL(href, window.location.href).toString();
          } catch (_error) {
            // keep raw href
          }
          return {
            text: String(anchor.textContent || "").trim().slice(0, 160),
            href: String(fullHref || "").slice(0, 500)
          };
        })
        .filter(Boolean);
      return {
        text: text.slice(0, Math.max(2000, Math.min(140000, Number(maxTextChars) || 24000))),
        links: anchors
      };
    }, {
      maxTextChars: maxChars,
      maxAnchorCount: maxLinks
    });

    return {
      url: page.url(),
      contextMode: contextState.mode,
      title,
      description: collapseWhitespace(description || "").slice(0, 400),
      text: collapseWhitespace(summary?.text || "").slice(0, maxChars),
      links: Array.isArray(summary?.links) ? summary.links.slice(0, maxLinks) : [],
      steps: stepResults,
      extracts
    };
  } finally {
    try {
      await page.close();
    } catch (_error) {
      // best effort close
    }
    if (contextState.ownsContext) {
      try {
        await context.close();
      } catch (_error) {
        // best effort close
      }
    }
  }
}

process.once('exit', () => {
  closeScreenshotWorker();
});

module.exports = {
  captureScreenshot,
  inspectPage,
  runBrowserTask,
  warmScreenshotWorker,
  closeScreenshotWorker
};
