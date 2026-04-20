#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BASE_URL = String(process.env.ASOLARIA_UI_BASE_URL || "http://127.0.0.1:4781").trim();
const TIMEOUT_MS = 45_000;
const API_TIMEOUT_MS = 25_000;
const WAIT_AFTER_LOAD_MS = 900;
const OVERFLOW_THRESHOLD_PX = 4;
const MAX_OVERFLOW_ROWS = 20;
const MAX_OVERLAP_ROWS = 20;
const MAX_SMALL_CONTROL_ROWS = 20;
const MAX_LOCAL_WINDOW_ERRORS = 20;
const LOCAL_WINDOW_CAPTURE_LIMIT = 6;
const ONE_FINGER_SCROLL_MIN_DELTA_PX = 24;
const INCLUDE_PINCH_ZOOM = readEnvBool(process.env.ASOLARIA_UI_AUDIT_INCLUDE_PINCH_ZOOM, true);
const INCLUDE_LOCAL_WINDOWS = readEnvBool(process.env.ASOLARIA_UI_AUDIT_INCLUDE_LOCAL_WINDOWS, true);
const CLEANUP_BEFORE_RUN = readEnvBool(process.env.ASOLARIA_UI_AUDIT_CLEANUP_BEFORE, true);
const CLEANUP_AFTER_RUN = readEnvBool(process.env.ASOLARIA_UI_AUDIT_CLEANUP_AFTER, true);
const CLEANUP_GRACE_MS = Math.max(0, Math.min(3000, Number(process.env.ASOLARIA_UI_AUDIT_CLEANUP_GRACE_MS || 220)));

const PAGES = [
  { id: "dashboard", label: "Asolaria Dashboard", route: "/" },
  { id: "phone_mode", label: "Asolaria Phone Mode", route: "/phone-mode.html" },
  { id: "mobile_console", label: "Mobile Console", route: "/mobile-console.html", mobileToken: true },
  { id: "mobile_approvals", label: "Mobile Approvals", route: "/mobile-approvals.html", mobileToken: true }
];

const VIEWPORTS = [
  { id: "full_hd", label: "Full HD", width: 1920, height: 1080, class: "full" },
  { id: "half_hd", label: "Half HD", width: 960, height: 1080, class: "half" },
  { id: "quarter_hd", label: "Quarter HD", width: 960, height: 540, class: "quarter" },
  { id: "laptop", label: "Laptop", width: 1366, height: 768, class: "full" },
  { id: "tablet_portrait", label: "Tablet Portrait", width: 768, height: 1024, class: "half" },
  { id: "mobile_portrait", label: "Mobile Portrait", width: 390, height: 844, class: "quarter" },
  { id: "mobile_landscape", label: "Mobile Landscape", width: 844, height: 390, class: "quarter" }
];

const ZOOM_VIEWPORT_IDS = new Set(["mobile_portrait", "mobile_landscape"]);
const LOCAL_WINDOW_TITLE_PATTERNS = [
  /asolaria/i,
  /phone mode/i,
  /mobile console/i,
  /mobile approvals/i,
  /127\.0\.0\.1:4781/i,
  /localhost:4781/i
];

const CLEANUP_TARGETS = Object.freeze([
  "local_ui",
  "phone_mode",
  "local_console",
  "local_approvals",
  "remote_console",
  "remote_approvals"
]);

function readEnvBool(raw, fallback) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return Boolean(fallback);
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return Boolean(fallback);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function makeTimestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ];
  return parts.join("");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function clipText(text, maxChars = 300) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function slugify(value, fallback = "item") {
  const text = String(value || "").trim();
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function buildUrl(pageDef, token) {
  const url = new URL(pageDef.route, `${BASE_URL}/`);
  if (pageDef.mobileToken && token) {
    url.searchParams.set("token", token);
    url.searchParams.set("channel", "usb");
  }
  return url.toString();
}

function withoutToken(urlText) {
  try {
    const url = new URL(urlText);
    url.searchParams.delete("token");
    return url.toString();
  } catch (_error) {
    return String(urlText || "");
  }
}

function buildRequestHeaders(options = {}) {
  const headers = {
    Accept: "application/json"
  };
  const token = String(options.token || "").trim();
  if (token) {
    headers["x-asolaria-mobile-token"] = token;
  }
  const channel = String(options.channel || "").trim();
  if (channel) {
    headers["x-asolaria-channel"] = channel;
  }
  return headers;
}

async function apiFetchJson(route, options = {}) {
  const url = new URL(route, `${BASE_URL}/`).toString();
  const method = String(options.method || "GET").trim().toUpperCase();
  const headers = buildRequestHeaders(options);
  const request = {
    method,
    headers
  };
  if (options.body !== undefined && options.body !== null) {
    headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }

  const timeoutMs = Math.max(2000, Math.min(120000, Number(options.timeoutMs || API_TIMEOUT_MS)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  request.signal = controller.signal;

  try {
    const response = await fetch(url, request);
    const raw = await response.text();
    const parsed = readJsonSafe(raw);
    if (!response.ok) {
      const detail = clipText(parsed?.error || raw || "unknown_error", 260);
      throw new Error(`${method} ${new URL(url).pathname} failed (${response.status}): ${detail}`);
    }
    return parsed || {};
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetchBinary(route, options = {}) {
  const url = new URL(route, `${BASE_URL}/`).toString();
  const method = String(options.method || "GET").trim().toUpperCase();
  const headers = buildRequestHeaders(options);
  const request = {
    method,
    headers
  };
  const timeoutMs = Math.max(2000, Math.min(120000, Number(options.timeoutMs || API_TIMEOUT_MS)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  request.signal = controller.signal;
  try {
    const response = await fetch(url, request);
    if (!response.ok) {
      const raw = await response.text();
      const detail = clipText(raw || "unknown_error", 260);
      throw new Error(`${method} ${new URL(url).pathname} failed (${response.status}): ${detail}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

async function tryGetMobileBootstrap() {
  try {
    const response = await fetch(`${BASE_URL}/api/mobile/bootstrap`, { method: "GET" });
    if (!response.ok) {
      return {
        token: "",
        payload: null,
        error: `bootstrap_http_${response.status}`
      };
    }
    const payload = readJsonSafe(await response.text());
    return {
      token: String(payload?.token || "").trim(),
      payload: payload || null,
      error: ""
    };
  } catch (error) {
    return {
      token: "",
      payload: null,
      error: String(error?.message || error || "bootstrap_failed")
    };
  }
}

async function runManagedWindowCleanup(mobileToken, options = {}) {
  if (!mobileToken) {
    return {
      attempted: false,
      status: "skipped",
      reason: "mobile_token_unavailable",
      profileKilled: 0,
      trackedClosed: 0,
      error: ""
    };
  }

  const enabled = options.enabled !== false;
  if (!enabled) {
    return {
      attempted: false,
      status: "skipped",
      reason: "cleanup_disabled",
      profileKilled: 0,
      trackedClosed: 0,
      error: ""
    };
  }

  try {
    const payload = await apiFetchJson("/api/mobile/ui/cleanup", {
      method: "POST",
      token: mobileToken,
      channel: "usb",
      body: {
        closeTracked: true,
        graceMs: Math.max(0, Math.min(3000, Number(options.graceMs ?? CLEANUP_GRACE_MS))),
        targets: CLEANUP_TARGETS
      }
    });
    return {
      attempted: true,
      status: "ok",
      reason: "",
      profileKilled: Number(payload?.profileKilled || 0),
      trackedClosed: Number(payload?.tracked?.closedCount || 0),
      payload
    };
  } catch (error) {
    return {
      attempted: true,
      status: "issue",
      reason: "cleanup_failed",
      profileKilled: 0,
      trackedClosed: 0,
      error: String(error?.message || error || "cleanup_failed")
    };
  }
}

function summarizeStatus(result) {
  const metrics = result.metrics || {};
  const horizontalOverflowPx = Number(metrics.horizontalOverflowPx || 0);
  const overlapCount = Number(metrics.overlapCount || 0);
  const oneFingerStatus = String(result.oneFinger?.status || "");
  const zoomStatus = String(result.zoom?.status || "");
  if (horizontalOverflowPx > OVERFLOW_THRESHOLD_PX || overlapCount > 0) {
    return "issue";
  }
  if (oneFingerStatus === "issue" || oneFingerStatus === "error") {
    return "issue";
  }
  if (zoomStatus === "issue" || zoomStatus === "error") {
    return "issue";
  }
  return "ok";
}

function toMarkdown(results, meta) {
  const lines = [];
  lines.push("# Asolaria UI Visual Audit");
  lines.push("");
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Base URL: ${BASE_URL}`);
  lines.push(`- Pages: ${PAGES.length}`);
  lines.push(`- Viewports: ${VIEWPORTS.length}`);
  lines.push(`- Total web checks: ${results.length}`);
  lines.push(`- Web issues: ${meta.webIssueCount}`);
  lines.push(`- Local window audit: ${meta.localWindowAudit?.status || "skipped"}`);
  lines.push(`- Pre cleanup: ${meta.preCleanup?.status || "not_run"}`);
  lines.push(`- Post cleanup: ${meta.postCleanup?.status || "not_run"}`);
  lines.push(`- Total issues: ${meta.issueCount}`);
  lines.push(`- Pinch zoom checks enabled: ${INCLUDE_PINCH_ZOOM ? "yes" : "no"}`);
  lines.push(`- Local window checks enabled: ${INCLUDE_LOCAL_WINDOWS ? "yes" : "no"}`);
  lines.push(`- Cleanup before run: ${CLEANUP_BEFORE_RUN ? "yes" : "no"}`);
  lines.push(`- Cleanup after run: ${CLEANUP_AFTER_RUN ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Web Summary");
  lines.push("");
  lines.push("| Page | Viewport | Status | Overflow Px | Overlap Pairs | One-Finger | Two-Finger Pinch | Screenshot |");
  lines.push("| --- | --- | --- | ---: | ---: | --- | --- | --- |");
  for (const row of results) {
    const metrics = row.metrics || {};
    const overflowPx = Number(metrics.horizontalOverflowPx || 0);
    const overlapCount = Number(metrics.overlapCount || 0);
    const screenshotRel = String(row.screenshotRel || "").replace(/\\/g, "/");
    const oneFingerStatus = row.oneFinger && row.oneFinger.attempted ? row.oneFinger.status : "-";
    const zoomStatus = row.zoom && row.zoom.attempted ? row.zoom.status : "-";
    lines.push(`| ${row.pageLabel} | ${row.viewportLabel} (${row.viewport.width}x${row.viewport.height}) | ${row.status} | ${overflowPx} | ${overlapCount} | ${oneFingerStatus} | ${zoomStatus} | \`${screenshotRel}\` |`);
  }

  lines.push("");
  lines.push("## Detailed Issues");
  lines.push("");
  const withIssues = results.filter((row) => row.status !== "ok");
  if (withIssues.length < 1) {
    lines.push("- No web layout defects detected by automated checks.");
  } else {
    for (const row of withIssues) {
      const metrics = row.metrics || {};
      lines.push(`### ${row.pageLabel} - ${row.viewportLabel} (${row.viewport.width}x${row.viewport.height})`);
      lines.push(`- URL: ${row.urlWithoutToken}`);
      lines.push(`- Screenshot: \`${String(row.screenshotRel || "").replace(/\\/g, "/")}\``);
      lines.push(`- Horizontal overflow px: ${Number(metrics.horizontalOverflowPx || 0)}`);
      lines.push(`- Overflow elements: ${Number(metrics.overflowElementCount || 0)}`);
      lines.push(`- Overlap pairs: ${Number(metrics.overlapCount || 0)}`);
      lines.push(`- Small controls: ${Number(metrics.smallControlCount || 0)}`);
      if (row.error) {
        lines.push(`- Error: ${clipText(row.error, 340)}`);
      }
      if (row.oneFinger && row.oneFinger.attempted) {
        lines.push(`- One-finger status: ${row.oneFinger.status}`);
        lines.push(`- One-finger notes: ${clipText(row.oneFinger.note || "", 260) || "-"}`);
      }
      if (row.zoom && row.zoom.attempted) {
        lines.push(`- Pinch zoom status: ${row.zoom.status}`);
        lines.push(`- Pinch zoom notes: ${clipText(row.zoom.note || "", 260) || "-"}`);
      }
      const overflowRows = Array.isArray(metrics.overflowElements) ? metrics.overflowElements : [];
      if (overflowRows.length > 0) {
        lines.push("- Overflow samples:");
        for (const item of overflowRows.slice(0, MAX_OVERFLOW_ROWS)) {
          lines.push(`  - ${item.tag}#${item.id || "-"}.${item.className || "-"} (${item.left}, ${item.top}) -> (${item.right}, ${item.bottom})`);
        }
      }
      const overlapRows = Array.isArray(metrics.overlapPairs) ? metrics.overlapPairs : [];
      if (overlapRows.length > 0) {
        lines.push("- Overlap samples:");
        for (const item of overlapRows.slice(0, MAX_OVERLAP_ROWS)) {
          lines.push(`  - ${item.a.selector} vs ${item.b.selector} overlap=${item.area}`);
        }
      }
      const smallRows = Array.isArray(metrics.smallControls) ? metrics.smallControls : [];
      if (smallRows.length > 0) {
        lines.push("- Small control samples:");
        for (const item of smallRows.slice(0, MAX_SMALL_CONTROL_ROWS)) {
          lines.push(`  - ${item.selector} (${item.width}x${item.height})`);
        }
      }
      lines.push("");
    }
  }

  lines.push("## One-Finger Scroll Checks");
  lines.push("");
  const oneFingerRows = results.filter((row) => row.oneFinger && row.oneFinger.attempted);
  if (oneFingerRows.length < 1) {
    lines.push("- No one-finger scroll checks were attempted.");
  } else {
    lines.push("| Page | Viewport | Status | Before Y | After Swipe Y | After Reverse Y | Swipe Shot | Reverse Shot |");
    lines.push("| --- | --- | --- | ---: | ---: | ---: | --- | --- |");
    for (const row of oneFingerRows) {
      const oneFinger = row.oneFinger || {};
      const before = Number(oneFinger.beforeY || 0);
      const afterSwipe = Number(oneFinger.afterSwipeY || 0);
      const afterReverse = Number(oneFinger.afterReverseY || 0);
      const swipeShot = String(oneFinger.swipeScreenshotRel || "").replace(/\\/g, "/");
      const reverseShot = String(oneFinger.reverseScreenshotRel || "").replace(/\\/g, "/");
      lines.push(`| ${row.pageLabel} | ${row.viewportLabel} | ${oneFinger.status} | ${before} | ${afterSwipe} | ${afterReverse} | \`${swipeShot || "-"}\` | \`${reverseShot || "-"}\` |`);
    }
  }

  lines.push("");
  lines.push("## Two-Finger Pinch Checks");
  lines.push("");
  const zoomRows = results.filter((row) => row.zoom && row.zoom.attempted);
  if (zoomRows.length < 1) {
    lines.push("- No pinch zoom checks were attempted.");
  } else {
    lines.push("| Page | Viewport | Status | Before | After In | After Out | Zoom In Shot | Zoom Out Shot |");
    lines.push("| --- | --- | --- | ---: | ---: | ---: | --- | --- |");
    for (const row of zoomRows) {
      const zoom = row.zoom || {};
      const before = Number(zoom.beforeScale || 0).toFixed(3);
      const afterIn = Number(zoom.afterZoomInScale || 0).toFixed(3);
      const afterOut = Number(zoom.afterZoomOutScale || 0).toFixed(3);
      const inShot = String(zoom.zoomInScreenshotRel || "").replace(/\\/g, "/");
      const outShot = String(zoom.zoomOutScreenshotRel || "").replace(/\\/g, "/");
      lines.push(`| ${row.pageLabel} | ${row.viewportLabel} | ${zoom.status} | ${before} | ${afterIn} | ${afterOut} | \`${inShot || "-"}\` | \`${outShot || "-"}\` |`);
    }
  }

  lines.push("");
  lines.push("## Local Window Audit");
  lines.push("");
  const local = meta.localWindowAudit || null;
  if (!local) {
    lines.push("- Local window audit did not run.");
  } else {
    lines.push(`- Status: ${local.status}`);
    lines.push(`- Reason: ${local.reason || "-"}`);
    lines.push(`- Matched windows: ${Number(local.matchCount || 0)} / ${Number(local.totalWindows || 0)}`);
    lines.push(`- Checks run: ${Array.isArray(local.checks) ? local.checks.length : 0}`);
    if (Array.isArray(local.openedTargets) && local.openedTargets.length > 0) {
      lines.push("- Opened UI targets (best effort):");
      for (const row of local.openedTargets) {
        const state = row.ok ? "ok" : "issue";
        lines.push(`  - ${row.target}: ${state}${row.error ? ` (${clipText(row.error, 160)})` : ""}`);
      }
    }
    if (Array.isArray(local.checks) && local.checks.length > 0) {
      lines.push("");
      lines.push("| Window | Status | Actions | Screenshot | Error |");
      lines.push("| --- | --- | --- | --- | --- |");
      for (const row of local.checks) {
        const title = clipText(row.title || `window_${row.windowId || "na"}`, 90);
        const actions = Array.isArray(row.actions)
          ? row.actions.map((a) => `${a.action}:${a.ok ? "ok" : "issue"}`).join(", ")
          : "-";
        const shot = String(row.screenshotRel || "").replace(/\\/g, "/");
        lines.push(`| ${title} | ${row.status} | ${actions || "-"} | \`${shot || "-"}\` | ${clipText(row.error || "", 140) || "-"} |`);
      }
    }
    if (Array.isArray(local.errors) && local.errors.length > 0) {
      lines.push("");
      lines.push("- Errors:");
      for (const error of local.errors.slice(0, MAX_LOCAL_WINDOW_ERRORS)) {
        lines.push(`  - ${clipText(error, 220)}`);
      }
    }
  }

  lines.push("");
  lines.push("## Managed Window Cleanup");
  lines.push("");
  for (const row of [
    { label: "Pre cleanup", data: meta.preCleanup || null },
    { label: "Post cleanup", data: meta.postCleanup || null }
  ]) {
    const entry = row.data;
    if (!entry) {
      lines.push(`- ${row.label}: not_run`);
      continue;
    }
    lines.push(
      `- ${row.label}: status=${entry.status || "unknown"} trackedClosed=${Number(entry.trackedClosed || 0)} profileKilled=${Number(entry.profileKilled || 0)}${entry.error ? ` error=${clipText(entry.error, 180)}` : ""}`
    );
  }

  return lines.join("\n");
}

async function evaluateLayout(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const doc = document.documentElement;
    const horizontalOverflowPx = Math.max(0, Math.round(doc.scrollWidth - viewportWidth));
    const interactiveSelector = "button, input, select, textarea, a, [role='button']";
    const relevantSelector = `${interactiveSelector}, .card, .row, .topbar, .panel, .status, .mode-chip, .stealth-chip`;
    const all = Array.from(document.querySelectorAll(relevantSelector));

    function isVisible(el) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function selectorFor(el) {
      const tag = String(el.tagName || "").toLowerCase();
      const id = String(el.id || "").trim();
      const classes = String(el.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      return `${tag}${id ? `#${id}` : ""}${classes ? `.${classes}` : ""}`;
    }

    const visibleRelevant = all.filter(isVisible);
    const overflowElements = [];
    for (const el of visibleRelevant) {
      const rect = el.getBoundingClientRect();
      const overflowLeft = rect.left < -1;
      const overflowRight = rect.right > (viewportWidth + 1);
      if (!overflowLeft && !overflowRight) {
        continue;
      }
      overflowElements.push({
        tag: String(el.tagName || "").toLowerCase(),
        id: String(el.id || ""),
        className: String(el.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join("."),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom)
      });
    }

    const controls = Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible);
    const overlapPairs = [];
    for (let i = 0; i < controls.length; i += 1) {
      const a = controls[i];
      const ra = a.getBoundingClientRect();
      for (let j = i + 1; j < controls.length; j += 1) {
        const b = controls[j];
        if (a.contains(b) || b.contains(a)) {
          continue;
        }
        const rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w <= 1 || h <= 1) {
          continue;
        }
        const area = Math.round(w * h);
        if (area < 64) {
          continue;
        }
        overlapPairs.push({
          a: { selector: selectorFor(a) },
          b: { selector: selectorFor(b) },
          area
        });
      }
    }

    const smallControls = [];
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 30) {
        smallControls.push({
          selector: selectorFor(el),
          width: Math.round(r.width),
          height: Math.round(r.height)
        });
      }
    }

    return {
      viewportWidth,
      viewportHeight,
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      horizontalOverflowPx,
      overflowElementCount: overflowElements.length,
      overlapCount: overlapPairs.length,
      smallControlCount: smallControls.length,
      overflowElements,
      overlapPairs,
      smallControls
    };
  });
}

async function readZoomScale(page) {
  return page.evaluate(() => {
    const visualScale = window.visualViewport && Number.isFinite(window.visualViewport.scale)
      ? Number(window.visualViewport.scale)
      : 1;
    const innerWidth = Number(window.innerWidth || 0);
    const outerWidth = Number(window.outerWidth || 0);
    const inferredScale = innerWidth > 0 && outerWidth > 0
      ? (outerWidth / innerWidth)
      : 1;
    const effectiveScale = Number.isFinite(visualScale) && visualScale > 0
      ? visualScale
      : inferredScale;
    return {
      visualScale: Number(visualScale.toFixed(4)),
      inferredScale: Number(inferredScale.toFixed(4)),
      scale: Number(effectiveScale.toFixed(4))
    };
  });
}

async function readPageScrollState(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement || document.body;
    const pageScrollTop = Number(root?.scrollTop ?? window.scrollY ?? 0);
    const pageScrollLeft = Number(root?.scrollLeft ?? window.scrollX ?? 0);
    const pageScrollHeight = Number(root?.scrollHeight ?? document.documentElement?.scrollHeight ?? 0);
    const pageScrollWidth = Number(root?.scrollWidth ?? document.documentElement?.scrollWidth ?? 0);
    const viewportHeight = Number(window.innerHeight || 0);
    const viewportWidth = Number(window.innerWidth || 0);
    let target = root;
    let source = "page";

    const desktopImage = document.getElementById("desktopImage");
    if (desktopImage instanceof HTMLElement) {
      const wrap = desktopImage.closest(".screen-wrap");
      if (wrap instanceof HTMLElement) {
        const wrapMaxY = Math.max(0, Number(wrap.scrollHeight || 0) - Number(wrap.clientHeight || 0));
        const wrapMaxX = Math.max(0, Number(wrap.scrollWidth || 0) - Number(wrap.clientWidth || 0));
        if (wrapMaxX > 1 || wrapMaxY > 1) {
          target = wrap;
          source = "screen_wrap";
        }
      }
    }

    const scrollTop = Number(target?.scrollTop ?? pageScrollTop ?? 0);
    const scrollLeft = Number(target?.scrollLeft ?? pageScrollLeft ?? 0);
    const maxY = target === root
      ? Math.max(0, Math.round(pageScrollHeight - viewportHeight))
      : Math.max(0, Math.round(Number(target?.scrollHeight || 0) - Number(target?.clientHeight || 0)));
    const maxX = target === root
      ? Math.max(0, Math.round(pageScrollWidth - viewportWidth))
      : Math.max(0, Math.round(Number(target?.scrollWidth || 0) - Number(target?.clientWidth || 0)));

    return {
      x: Math.round(scrollLeft),
      y: Math.round(scrollTop),
      maxX,
      maxY,
      source,
      pageY: Math.round(pageScrollTop),
      pageMaxY: Math.max(0, Math.round(pageScrollHeight - viewportHeight))
    };
  });
}

async function runOneFingerScrollAudit(page, viewport, shotsDir, shotBaseName) {
  if (!ZOOM_VIEWPORT_IDS.has(viewport.id)) {
    return {
      attempted: false,
      status: "skipped",
      note: "non_mobile_viewport"
    };
  }

  const result = {
    attempted: true,
    status: "ok",
    note: "",
    beforeY: 0,
    afterSwipeY: 0,
    afterReverseY: 0,
    movedOnSwipe: false,
    movedOnReverse: false,
    restoredTowardBaseline: false,
    swipeScreenshotRel: "",
    reverseScreenshotRel: "",
    error: ""
  };

  let session = null;
  try {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(180);

    let targetTouchZone = await page.evaluate(() => {
      const image = document.getElementById("desktopImage");
      if (!(image instanceof HTMLElement)) {
        return null;
      }
      image.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = image.getBoundingClientRect();
      if (!rect || rect.width < 24 || rect.height < 24) {
        return null;
      }
      return {
        centerX: Math.round(rect.left + (rect.width / 2)),
        leftX: Math.round(rect.left + Math.max(10, rect.width * 0.2)),
        rightX: Math.round(rect.right - Math.max(10, rect.width * 0.2)),
        centerY: Math.round(rect.top + (rect.height / 2))
      };
    });
    await page.waitForTimeout(180);

    const before = await readPageScrollState(page);
    result.beforeY = Number(before.y || 0);
    if (Number(before.maxY || 0) < 80) {
      result.status = "skipped";
      result.note = "page_not_scrollable";
      return result;
    }

    session = await page.context().newCDPSession(page);
    const centerX = Math.round(targetTouchZone?.centerX ?? (viewport.width / 2));
    const startY = Math.round(targetTouchZone?.centerY ?? (viewport.height * 0.78));
    const dragDistance = Math.max(120, Math.round(viewport.height * 0.44));
    const swipeXs = Array.from(new Set([
      centerX,
      Number.isFinite(Number(targetTouchZone?.rightX)) ? Math.round(targetTouchZone.rightX) : Math.round(viewport.width * 0.88),
      Number.isFinite(Number(targetTouchZone?.leftX)) ? Math.round(targetTouchZone.leftX) : Math.round(viewport.width * 0.12)
    ])).map((value) => Math.max(8, Math.min(viewport.width - 8, value)));
    const clampY = (value) => Math.max(8, Math.min(viewport.height - 8, Math.round(value)));
    const sendTouchSwipe = async (x, fromY, toY) => {
      const start = clampY(fromY);
      const end = clampY(toY);
      const steps = 8;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y: start }]
      });
      for (let index = 1; index <= steps; index += 1) {
        const ratio = index / steps;
        const currentY = Math.round(start + ((end - start) * ratio));
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: currentY }]
        });
        await page.waitForTimeout(18);
      }
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: []
      });
    };

    let afterSwipe = before;
    let usedSwipeX = centerX;
    for (const swipeX of swipeXs) {
      await sendTouchSwipe(swipeX, startY, startY - dragDistance);
      await page.waitForTimeout(320);
      afterSwipe = await readPageScrollState(page);
      if (Number(afterSwipe.y || 0) <= (Number(before.y || 0) + 8)) {
        // Retry opposite direction for runtimes that invert axis.
        await sendTouchSwipe(swipeX, startY, startY + dragDistance);
        await page.waitForTimeout(320);
        afterSwipe = await readPageScrollState(page);
      }
      if (Math.abs(Number(afterSwipe.y || 0) - Number(before.y || 0)) >= ONE_FINGER_SCROLL_MIN_DELTA_PX) {
        usedSwipeX = swipeX;
        break;
      }
    }
    result.afterSwipeY = Number(afterSwipe.y || 0);

    const swipeScreenshot = path.join(shotsDir, `${shotBaseName}__one_finger_swipe.png`);
    await page.screenshot({ path: swipeScreenshot, fullPage: false });
    result.swipeScreenshotRel = path.relative(PROJECT_ROOT, swipeScreenshot);

    const reverseToY = Number(afterSwipe.y || 0) > Number(before.y || 0)
      ? (startY + dragDistance)
      : (startY - dragDistance);
    await sendTouchSwipe(usedSwipeX, startY, reverseToY);
    await page.waitForTimeout(320);
    const afterReverse = await readPageScrollState(page);
    result.afterReverseY = Number(afterReverse.y || 0);

    const reverseScreenshot = path.join(shotsDir, `${shotBaseName}__one_finger_reverse.png`);
    await page.screenshot({ path: reverseScreenshot, fullPage: false });
    result.reverseScreenshotRel = path.relative(PROJECT_ROOT, reverseScreenshot);

    result.movedOnSwipe = Math.abs(result.afterSwipeY - result.beforeY) >= ONE_FINGER_SCROLL_MIN_DELTA_PX;
    result.movedOnReverse = Math.abs(result.afterReverseY - result.afterSwipeY) >= ONE_FINGER_SCROLL_MIN_DELTA_PX;
    result.restoredTowardBaseline =
      Math.abs(result.afterReverseY - result.beforeY) <
      (Math.abs(result.afterSwipeY - result.beforeY) - 8);

    if (result.movedOnSwipe && result.movedOnReverse && result.restoredTowardBaseline) {
      result.status = "ok";
      result.note = "one_finger_scroll_up_down_ok";
    } else if (!result.movedOnSwipe) {
      result.status = "issue";
      result.note = "one_finger_scroll_no_observed_movement";
    } else if (!result.movedOnReverse) {
      result.status = "issue";
      result.note = "one_finger_reverse_scroll_not_observed";
    } else {
      result.status = "issue";
      result.note = "one_finger_scroll_partial";
    }
  } catch (error) {
    result.status = "error";
    result.error = String(error?.message || error || "one_finger_scroll_failed");
    result.note = "one_finger_scroll_error";
  } finally {
    if (session) {
      try {
        await session.detach();
      } catch (_error) {
        // ignore
      }
    }
  }

  return result;
}

async function runPinchZoomAudit(page, viewport, shotsDir, shotBaseName) {
  if (!INCLUDE_PINCH_ZOOM) {
    return {
      attempted: false,
      status: "skipped",
      note: "disabled_by_env"
    };
  }
  if (!ZOOM_VIEWPORT_IDS.has(viewport.id)) {
    return {
      attempted: false,
      status: "skipped",
      note: "non_mobile_viewport"
    };
  }

  const result = {
    attempted: true,
    status: "ok",
    note: "",
    beforeScale: 1,
    afterZoomInScale: 1,
    afterZoomOutScale: 1,
    zoomInChanged: false,
    zoomOutChanged: false,
    restoredNearBaseline: false,
    zoomInScreenshotRel: "",
    zoomOutScreenshotRel: "",
    error: ""
  };

  let session = null;
  try {
    const before = await readZoomScale(page);
    result.beforeScale = Number(before.scale || 1);
    session = await page.context().newCDPSession(page);
    const centerX = Math.round(viewport.width / 2);
    const centerY = Math.round(viewport.height / 2);

    await session.send("Input.synthesizePinchGesture", {
      x: centerX,
      y: centerY,
      scaleFactor: 1.25,
      relativeSpeed: 800,
      gestureSourceType: "touch"
    });
    await page.waitForTimeout(350);
    const afterIn = await readZoomScale(page);
    result.afterZoomInScale = Number(afterIn.scale || 1);

    const zoomInScreenshot = path.join(shotsDir, `${shotBaseName}__pinch_zoom_in.png`);
    await page.screenshot({ path: zoomInScreenshot, fullPage: false });
    result.zoomInScreenshotRel = path.relative(PROJECT_ROOT, zoomInScreenshot);

    await session.send("Input.synthesizePinchGesture", {
      x: centerX,
      y: centerY,
      scaleFactor: 0.8,
      relativeSpeed: 800,
      gestureSourceType: "touch"
    });
    await page.waitForTimeout(350);
    const afterOut = await readZoomScale(page);
    result.afterZoomOutScale = Number(afterOut.scale || 1);

    const zoomOutScreenshot = path.join(shotsDir, `${shotBaseName}__pinch_zoom_out.png`);
    await page.screenshot({ path: zoomOutScreenshot, fullPage: false });
    result.zoomOutScreenshotRel = path.relative(PROJECT_ROOT, zoomOutScreenshot);

    result.zoomInChanged = Math.abs(result.afterZoomInScale - result.beforeScale) >= 0.05;
    result.zoomOutChanged = Math.abs(result.afterZoomOutScale - result.afterZoomInScale) >= 0.05;
    result.restoredNearBaseline = Math.abs(result.afterZoomOutScale - result.beforeScale) <= 0.15;

    if (result.zoomInChanged && result.zoomOutChanged && result.restoredNearBaseline) {
      result.status = "ok";
      result.note = "pinch_zoom_in_out_ok";
    } else if (!result.zoomInChanged && !result.zoomOutChanged) {
      result.status = "unsupported";
      result.note = "pinch_zoom_not_observable_in_current_runtime";
    } else {
      result.status = "issue";
      result.note = "pinch_zoom_scale_did_not_change_as_expected";
    }
  } catch (error) {
    result.status = "error";
    result.error = String(error?.message || error || "pinch_zoom_failed");
    result.note = "pinch_zoom_error";
  } finally {
    if (session) {
      try {
        await session.detach();
      } catch (_error) {
        // ignore
      }
    }
  }

  return result;
}

function normalizeWindowRow(row) {
  const source = row && typeof row === "object" ? row : {};
  const idRaw = Number(
    source.windowId !== undefined
      ? source.windowId
      : (source.id !== undefined ? source.id : source.hwnd)
  );
  const id = Number.isFinite(idRaw) ? Math.max(0, Math.round(idRaw)) : 0;
  return {
    id,
    title: String(source.title || source.windowTitle || source.caption || "").trim(),
    processName: String(source.processName || source.process || source.app || "").trim(),
    raw: source
  };
}

function matchesAsolariaWindow(windowRow) {
  const title = String(windowRow?.title || "");
  if (!title) {
    return false;
  }
  for (const pattern of LOCAL_WINDOW_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return true;
    }
  }
  const processName = String(windowRow?.processName || "").toLowerCase();
  if ((processName.includes("chrome") || processName.includes("msedge")) && /4781/.test(title)) {
    return true;
  }
  return false;
}

function buildWindowSelector(windowRow) {
  const id = Number(windowRow?.id || 0);
  const title = String(windowRow?.title || "").trim();
  if (id > 0) {
    return { windowId: id };
  }
  if (title) {
    return { windowTitle: title.slice(0, 240) };
  }
  return {};
}

async function readDesktopWindows(mobileToken) {
  const payload = await apiFetchJson("/api/mobile/windows?limit=48", {
    token: mobileToken,
    channel: "usb"
  });
  const rawWindows = Array.isArray(payload.windows) ? payload.windows : [];
  const windows = rawWindows.map(normalizeWindowRow);
  const activeWindow = normalizeWindowRow(payload.activeWindow || {});
  return {
    windows,
    activeWindow
  };
}

async function runLocalWindowAudit(options = {}) {
  if (!INCLUDE_LOCAL_WINDOWS) {
    return {
      attempted: false,
      ok: true,
      status: "skipped",
      reason: "disabled_by_env",
      totalWindows: 0,
      matchCount: 0,
      openedTargets: [],
      checks: [],
      errors: []
    };
  }

  const mobileToken = String(options.mobileToken || "").trim();
  const shotsDir = String(options.shotsDir || "").trim();
  if (!mobileToken) {
    return {
      attempted: false,
      ok: false,
      status: "issue",
      reason: "mobile_token_unavailable",
      totalWindows: 0,
      matchCount: 0,
      openedTargets: [],
      checks: [],
      errors: ["Mobile token was not available for local window audit."]
    };
  }
  if (!shotsDir) {
    throw new Error("runLocalWindowAudit requires shotsDir.");
  }

  const openedTargets = [];
  const checks = [];
  const errors = [];
  let previousActive = null;
  let windows = [];
  let matches = [];
  let controlWasArmed = false;

  try {
    const listing = await readDesktopWindows(mobileToken);
    windows = listing.windows;
    previousActive = listing.activeWindow;
    matches = windows.filter(matchesAsolariaWindow);
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: "issue",
      reason: "window_list_failed",
      totalWindows: 0,
      matchCount: 0,
      openedTargets,
      checks,
      errors: [String(error?.message || error || "window_list_failed")]
    };
  }

  try {
    const status = await apiFetchJson("/api/mobile/control/status", {
      token: mobileToken,
      channel: "usb"
    });
    controlWasArmed = Boolean(status?.control?.armed);
  } catch (_error) {
    controlWasArmed = false;
  }

  if (!controlWasArmed) {
    try {
      await apiFetchJson("/api/mobile/control/arm", {
        method: "POST",
        token: mobileToken,
        channel: "usb",
        body: {
          ttlMs: 10 * 60 * 1000,
          by: "ui_visual_audit"
        }
      });
    } catch (error) {
      return {
        attempted: true,
        ok: false,
        status: "issue",
        reason: "control_arm_failed",
        totalWindows: windows.length,
        matchCount: matches.length,
        openedTargets,
        checks,
        errors: [String(error?.message || error || "control_arm_failed")]
      };
    }
  }

  if (matches.length < 1) {
    for (const target of ["local_ui", "phone_mode"]) {
      try {
        const opened = await apiFetchJson("/api/mobile/ui/open", {
          method: "POST",
          token: mobileToken,
          channel: "usb",
          body: { target }
        });
        openedTargets.push({
          target,
          ok: true,
          opened: String(opened.opened || "")
        });
      } catch (error) {
        openedTargets.push({
          target,
          ok: false,
          error: String(error?.message || error || "open_failed")
        });
      }
      await sleep(400);
    }

    try {
      const listing = await readDesktopWindows(mobileToken);
      windows = listing.windows;
      if (!previousActive || (!previousActive.id && !previousActive.title)) {
        previousActive = listing.activeWindow;
      }
      matches = windows.filter(matchesAsolariaWindow);
    } catch (error) {
      errors.push(`window_refetch_failed: ${String(error?.message || error || "unknown_error")}`);
    }
  }

  const selected = matches.slice(0, LOCAL_WINDOW_CAPTURE_LIMIT);
  for (const row of selected) {
    const selector = buildWindowSelector(row);
    const check = {
      windowId: Number(row.id || 0),
      title: String(row.title || ""),
      processName: String(row.processName || ""),
      status: "ok",
      actions: [],
      screenshotRel: "",
      error: ""
    };
    checks.push(check);

    try {
      if (!selector.windowId && !selector.windowTitle) {
        throw new Error("window selector missing id/title");
      }

      await apiFetchJson("/api/mobile/windows/focus", {
        method: "POST",
        token: mobileToken,
        channel: "usb",
        body: {
          ...selector,
          timeoutMs: 12000
        }
      });
      check.actions.push({ action: "window_focus", ok: true });
      await sleep(240);

      for (const action of ["window_restore", "window_maximize", "window_restore"]) {
        await apiFetchJson("/api/mobile/windows/action", {
          method: "POST",
          token: mobileToken,
          channel: "usb",
          body: {
            action,
            ...selector,
            timeoutMs: 12000
          }
        });
        check.actions.push({ action, ok: true });
        await sleep(240);
      }

      const capture = await apiFetchJson("/api/mobile/screen/capture", {
        method: "POST",
        token: mobileToken,
        channel: "usb",
        body: {
          force: true,
          maxAgeMs: 0,
          timeoutMs: 25000
        }
      });
      const capturedAtMs = Number(capture?.snapshot?.capturedAtMs || Date.now());
      const imageBuffer = await apiFetchBinary(`/api/mobile/screen/image?v=${encodeURIComponent(String(capturedAtMs))}`, {
        token: mobileToken,
        channel: "usb",
        timeoutMs: 25000
      });

      const screenshotName = `local_window__${slugify(row.title || `window_${row.id || "na"}`)}__${row.id || "na"}.png`;
      const screenshotPath = path.join(shotsDir, screenshotName);
      fs.writeFileSync(screenshotPath, imageBuffer);
      check.screenshotRel = path.relative(PROJECT_ROOT, screenshotPath);
    } catch (error) {
      check.status = "issue";
      check.error = String(error?.message || error || "window_audit_failed");
      errors.push(`${row.title || row.id || "window"}: ${check.error}`);
    }
  }

  if (previousActive && (previousActive.id > 0 || previousActive.title)) {
    try {
      const previousSelector = buildWindowSelector(previousActive);
      await apiFetchJson("/api/mobile/windows/focus", {
        method: "POST",
        token: mobileToken,
        channel: "usb",
        body: {
          ...previousSelector,
          timeoutMs: 8000
        }
      });
    } catch (error) {
      errors.push(`restore_active_window_failed: ${String(error?.message || error || "unknown_error")}`);
    }
  }

  if (!controlWasArmed) {
    try {
      await apiFetchJson("/api/mobile/control/disarm", {
        method: "POST",
        token: mobileToken,
        channel: "usb",
        body: {
          reason: "ui_visual_audit_complete"
        }
      });
    } catch (_error) {
      // best effort only
    }
  }

  const failedChecks = checks.filter((row) => row.status !== "ok").length;
  const status = matches.length > 0 && failedChecks === 0 ? "ok" : "issue";

  return {
    attempted: true,
    ok: status === "ok",
    status,
    reason: matches.length > 0 ? "" : "no_matching_windows_found",
    totalWindows: windows.length,
    matchCount: matches.length,
    openedTargets,
    checks,
    previousActiveWindow: previousActive,
    errors: errors.slice(0, MAX_LOCAL_WINDOW_ERRORS)
  };
}

async function run() {
  const stamp = makeTimestamp();
  const outRoot = path.resolve(PROJECT_ROOT, "reports", "ui-visual-audit", stamp);
  const shotsDir = path.join(outRoot, "screenshots");
  ensureDir(shotsDir);

  const bootstrap = await tryGetMobileBootstrap();
  const mobileToken = bootstrap.token;
  const preCleanup = await runManagedWindowCleanup(mobileToken, {
    enabled: CLEANUP_BEFORE_RUN,
    graceMs: CLEANUP_GRACE_MS
  });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const pageDef of PAGES) {
      for (const vp of VIEWPORTS) {
        const isMobileViewport = vp.id.startsWith("mobile_");
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: isMobileViewport,
          hasTouch: isMobileViewport,
          deviceScaleFactor: isMobileViewport ? 2 : 1
        });
        const page = await context.newPage();
        const url = buildUrl(pageDef, mobileToken);
        const screenshotName = `${pageDef.id}__${vp.id}.png`;
        const screenshotPath = path.join(shotsDir, screenshotName);

        let metrics = null;
        let oneFinger = {
          attempted: false,
          status: "skipped",
          note: "not_run"
        };
        let zoom = {
          attempted: false,
          status: "skipped",
          note: "not_run"
        };
        let status = "ok";
        let errorText = "";

        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
          await page.waitForTimeout(WAIT_AFTER_LOAD_MS);

          if (pageDef.id === "dashboard") {
            await page.evaluate(() => {
              document.body.classList.remove("stealth-on");
            });
            await page.waitForTimeout(250);
          }

          metrics = await evaluateLayout(page);
          oneFinger = await runOneFingerScrollAudit(page, vp, shotsDir, `${pageDef.id}__${vp.id}`);
          zoom = await runPinchZoomAudit(page, vp, shotsDir, `${pageDef.id}__${vp.id}`);
          status = summarizeStatus({ metrics, oneFinger, zoom });
          await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch (error) {
          status = "error";
          errorText = String(error?.message || error || "unknown_error");
          try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
          } catch (_screenError) {
            // ignore
          }
        } finally {
          await context.close();
        }

        results.push({
          page: pageDef.id,
          pageLabel: pageDef.label,
          viewport: vp,
          viewportLabel: vp.label,
          class: vp.class,
          status,
          error: errorText,
          urlWithoutToken: withoutToken(url),
          screenshot: screenshotPath,
          screenshotRel: path.relative(PROJECT_ROOT, screenshotPath),
          metrics,
          oneFinger,
          zoom
        });
      }
    }
  } finally {
    await browser.close();
  }

  let localWindowAudit = null;
  try {
    localWindowAudit = await runLocalWindowAudit({
      mobileToken,
      shotsDir
    });
  } catch (error) {
    localWindowAudit = {
      attempted: true,
      ok: false,
      status: "issue",
      reason: "local_window_audit_failed",
      totalWindows: 0,
      matchCount: 0,
      openedTargets: [],
      checks: [],
      errors: [String(error?.message || error || "local_window_audit_failed")]
    };
  }

  const postCleanup = await runManagedWindowCleanup(mobileToken, {
    enabled: CLEANUP_AFTER_RUN,
    graceMs: CLEANUP_GRACE_MS
  });

  const webIssueCount = results.filter((row) => row.status === "issue" || row.status === "error").length;
  const localWindowIssueCount = localWindowAudit && localWindowAudit.status === "issue" ? 1 : 0;
  const cleanupIssueCount = [preCleanup, postCleanup]
    .filter((row) => row && row.attempted && row.status === "issue")
    .length;
  const issueCount = webIssueCount + localWindowIssueCount + cleanupIssueCount;

  const summary = {
    ok: issueCount === 0,
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    checks: results.length,
    issues: issueCount,
    pages: PAGES.length,
    viewports: VIEWPORTS.length,
    webChecks: results.length,
    webIssues: webIssueCount,
    localWindowIssueCount,
    cleanupIssueCount,
    pinchZoomEnabled: INCLUDE_PINCH_ZOOM,
    localWindowEnabled: INCLUDE_LOCAL_WINDOWS,
    cleanupBeforeRun: CLEANUP_BEFORE_RUN,
    cleanupAfterRun: CLEANUP_AFTER_RUN,
    cleanupGraceMs: CLEANUP_GRACE_MS,
    mobileBootstrap: {
      tokenAvailable: Boolean(mobileToken),
      bootstrapError: String(bootstrap.error || "")
    },
    preCleanup,
    postCleanup,
    localWindowAudit,
    results
  };

  const jsonPath = path.join(outRoot, "report.json");
  const latestJsonPath = path.resolve(PROJECT_ROOT, "reports", "ui-visual-audit", "latest.json");
  ensureDir(path.dirname(latestJsonPath));
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(latestJsonPath, JSON.stringify(summary, null, 2), "utf8");

  const markdown = toMarkdown(results, {
    issueCount,
    webIssueCount,
    localWindowAudit,
    preCleanup,
    postCleanup
  });
  const mdPath = path.join(outRoot, "report.md");
  const latestMdPath = path.resolve(PROJECT_ROOT, "reports", "ui-visual-audit", "latest.md");
  fs.writeFileSync(mdPath, markdown, "utf8");
  fs.writeFileSync(latestMdPath, markdown, "utf8");

  const stdout = [
    "UI visual audit complete.",
    `Base URL: ${BASE_URL}`,
    `Web checks: ${results.length}`,
    `Web issues: ${webIssueCount}`,
    `Local window status: ${localWindowAudit?.status || "not_run"}`,
    `Pre cleanup: ${preCleanup?.status || "not_run"} (tracked=${preCleanup?.trackedClosed || 0}, killed=${preCleanup?.profileKilled || 0})`,
    `Post cleanup: ${postCleanup?.status || "not_run"} (tracked=${postCleanup?.trackedClosed || 0}, killed=${postCleanup?.profileKilled || 0})`,
    `Total issues: ${issueCount}`,
    `JSON: ${jsonPath}`,
    `Markdown: ${mdPath}`,
    `Latest JSON: ${latestJsonPath}`,
    `Latest MD: ${latestMdPath}`
  ].join("\n");
  process.stdout.write(`${stdout}\n`);

  process.exit(issueCount > 0 ? 2 : 0);
}

run().catch((error) => {
  const message = String(error?.stack || error?.message || error || "Unknown error");
  process.stderr.write(`UI visual audit failed: ${message}\n`);
  process.exit(1);
});
