const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { projectRoot, resolveDataPath } = require("./runtimePaths");

// Intentionally conservative allowlist: text/config/code + PDFs.
// Anything outside this list should be explicitly handled before we accept it.
const allowedExtensions = new Set([
  ".txt",
  ".md",
  ".log",
  ".json",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".html",
  ".xml",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".ps1",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".pdf"
]);

const mimeToExtension = {
  "text/plain": ".txt",
  "text/markdown": ".md",
  "application/json": ".json",
  "text/csv": ".csv",
  "application/xml": ".xml",
  "text/xml": ".xml",
  "application/x-yaml": ".yaml",
  "text/yaml": ".yaml",
  "application/pdf": ".pdf"
};

function safeStem(fileName) {
  const base = path.basename(String(fileName || "upload-file"), path.extname(String(fileName || "")));
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 60);
  return cleaned || "upload-file";
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:([^;]*);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Invalid file data URL.");
  }

  const mimeType = String(match[1] || "application/octet-stream").toLowerCase();
  const base64 = match[2];
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) {
    throw new Error("Uploaded file is empty.");
  }

  return { mimeType, bytes };
}

function ensureAttachmentDir() {
  const dir = resolveDataPath("attachments");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isWithinWorkspace(resolvedPath) {
  const root = projectRoot;
  const relative = path.relative(root, resolvedPath);
  if (!relative) return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function maxUploadBytes() {
  const fallback = 5 * 1024 * 1024;
  const raw = Number(process.env.ASOLARIA_UPLOAD_MAX_BYTES || fallback);
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }
  return Math.max(64 * 1024, Math.min(raw, 30 * 1024 * 1024));
}

function saveUploadedFile(payload) {
  const { mimeType, bytes } = parseDataUrl(payload?.dataUrl);
  const preferredExt = path.extname(String(payload?.fileName || "")).toLowerCase();
  const derivedExt = mimeToExtension[mimeType] || "";
  const finalExt = allowedExtensions.has(preferredExt)
    ? preferredExt
    : allowedExtensions.has(derivedExt)
      ? derivedExt
      : "";

  if (!finalExt) {
    throw new Error(`Unsupported file type: ${preferredExt || mimeType || "unknown"}`);
  }

  const limit = maxUploadBytes();
  if (bytes.length > limit) {
    throw new Error(`File too large (${Math.ceil(bytes.length / 1024)} KB). Max is ${Math.ceil(limit / 1024 / 1024)} MB.`);
  }

  const fileName = `${Date.now()}-${safeStem(payload?.fileName)}${finalExt}`;
  const outputPath = path.join(ensureAttachmentDir(), fileName);
  fs.writeFileSync(outputPath, bytes);

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  return {
    name: fileName,
    path: outputPath,
    size: bytes.length,
    mimeType,
    sha256
  };
}

function normalizeFilePath(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) {
    return null;
  }

  const resolved = path.resolve(value);
  if (!isWithinWorkspace(resolved)) {
    throw new Error("File must be within the Asolaria workspace.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`File path is not a file: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new Error(`Unsupported file extension: ${ext || "(none)"}`);
  }

  return resolved;
}

function normalizeFilePaths(rawPaths) {
  if (!Array.isArray(rawPaths)) {
    return [];
  }

  const unique = new Set();
  for (const item of rawPaths) {
    const normalized = normalizeFilePath(item);
    if (normalized) {
      unique.add(normalized);
    }
    if (unique.size >= 6) {
      break;
    }
  }
  return Array.from(unique);
}

module.exports = {
  saveUploadedFile,
  normalizeFilePaths
};
