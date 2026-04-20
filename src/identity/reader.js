// Item 065 · Identity reader with fallback search

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CANDIDATES = [
  path.join(os.homedir(), "Asolaria-BEHCS-256", "_asolaria_identity.json"),
  path.join(os.homedir(), "Asolaria", "_asolaria_identity.json"),
  path.join(process.cwd(), "_asolaria_identity.json"),
  "/data/data/com.termux/files/home/asolaria/_asolaria_identity.json",
  "E:/sovereignty/_asolaria_identity.json",
];

function readIdentity(explicitPath = null) {
  const candidates = explicitPath ? [explicitPath] : CANDIDATES;
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const parsed = JSON.parse(raw);
        return { ok: true, path: p, identity: parsed };
      }
    } catch (e) {
      // continue to next candidate
    }
  }
  return { ok: false, error: "no-identity-found", searched: candidates };
}

module.exports = { readIdentity, CANDIDATES };
