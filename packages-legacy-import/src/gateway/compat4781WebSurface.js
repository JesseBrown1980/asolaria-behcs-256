"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");

function injectWorkerRouterModeMarker(html, mode) {
  const routerMode = mode === "full" ? "full" : "read-only";
  const metaTag = `    <meta name="asolaria-router-mode" content="${routerMode}" />`;
  let output = String(html || "");
  if (!/name=["']asolaria-router-mode["']/i.test(output)) {
    output = output.replace(/<\/head>/i, `${metaTag}\n  </head>`);
  }
  output = output.replace(/<body\b([^>]*)>/i, (match, attrs) => {
    if (/data-router-mode=/i.test(attrs)) {
      return match;
    }
    return `<body${attrs} data-router-mode="${routerMode}">`;
  });
  return output;
}

function injectSurfaceModeMarker(html, mode) {
  const surfaceMode = mode === "full" ? "full" : "read-only";
  const metaTag = `    <meta name="asolaria-surface-mode" content="${surfaceMode}" />`;
  let output = String(html || "");
  if (!/name=["']asolaria-surface-mode["']/i.test(output)) {
    output = output.replace(/<\/head>/i, `${metaTag}\n  </head>`);
  }
  output = output.replace(/<body\b([^>]*)>/i, (match, attrs) => {
    if (/data-surface-mode=/i.test(attrs)) {
      return match;
    }
    return `<body${attrs} data-surface-mode="${surfaceMode}">`;
  });
  return output;
}

function registerCompat4781WebRoutes(app, input = {}) {
  const publicRoot = String(input.publicRoot || "").trim();
  const workerRouterHtmlPath = String(input.workerRouterHtmlPath || "").trim();
  const workerRuntimeHtmlPath = String(input.workerRuntimeHtmlPath || "").trim();
  const civilizationPreviewHtmlPath = String(input.civilizationPreviewHtmlPath || "").trim();
  const pageMode = String(input.pageMode || "read-only").trim() || "read-only";

  app.get("/worker-router.html", (_req, res, next) => {
    try {
      const html = fs.readFileSync(workerRouterHtmlPath, "utf8");
      res.type("html").send(injectSurfaceModeMarker(injectWorkerRouterModeMarker(html, pageMode), pageMode));
    } catch (error) {
      next(error);
    }
  });

  app.get("/worker-runtime.html", (_req, res, next) => {
    try {
      const html = fs.readFileSync(workerRuntimeHtmlPath, "utf8");
      res.type("html").send(injectSurfaceModeMarker(html, pageMode));
    } catch (error) {
      next(error);
    }
  });

  app.get("/swarm-civilization-preview.html", (_req, res, next) => {
    try {
      const html = fs.readFileSync(civilizationPreviewHtmlPath, "utf8");
      res.type("html").send(injectSurfaceModeMarker(html, pageMode));
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(publicRoot));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicRoot, "index.html"));
  });
}

module.exports = {
  injectWorkerRouterModeMarker,
  injectSurfaceModeMarker,
  registerCompat4781WebRoutes
};
