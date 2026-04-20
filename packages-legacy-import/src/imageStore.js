const fs = require("fs");
const path = require("path");
const { resolveCapturePath } = require("./runtimePaths");

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const mimeToExtension = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp"
};

function safeStem(fileName) {
  const base = path.basename(String(fileName || "upload-image"), path.extname(String(fileName || "")));
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 60);
  return cleaned || "upload-image";
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const extension = mimeToExtension[mimeType];
  if (!extension) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }

  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) {
    throw new Error("Uploaded image is empty.");
  }

  return { mimeType, extension, bytes };
}

function ensureIngestDir() {
  const dir = resolveCapturePath("ingest");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveUploadedImage(payload) {
  const { mimeType, extension, bytes } = parseDataUrl(payload?.dataUrl);
  const preferredExt = path.extname(String(payload?.fileName || "")).toLowerCase();
  const finalExt = allowedExtensions.has(preferredExt) ? preferredExt : extension;
  const fileName = `${Date.now()}-${safeStem(payload?.fileName)}${finalExt}`;
  const outputPath = path.join(ensureIngestDir(), fileName);
  fs.writeFileSync(outputPath, bytes);

  return {
    name: fileName,
    path: outputPath,
    size: bytes.length,
    mimeType
  };
}

function normalizeImagePath(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) {
    return null;
  }

  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Image not found: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Image path is not a file: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new Error(`Unsupported image extension: ${ext || "(none)"}`);
  }

  return resolved;
}

function normalizeImagePaths(rawPaths) {
  if (!Array.isArray(rawPaths)) {
    return [];
  }

  const unique = new Set();
  for (const item of rawPaths) {
    const normalized = normalizeImagePath(item);
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
  saveUploadedImage,
  normalizeImagePaths
};
