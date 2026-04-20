// Item 193 · Wire Codex 5.3 (and other preset profiles) into spawner

const fs = require("node:fs");
const path = require("node:path");

const PROFILES_DIR = path.join(__dirname, "../../agents");

function listProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs.readdirSync(PROFILES_DIR)
    .filter(f => f.endsWith(".profile.json"))
    .map(f => ({ name: f.replace(".profile.json", ""), path: path.join(PROFILES_DIR, f) }));
}

function loadProfile(name) {
  const file = path.join(PROFILES_DIR, `${name}.profile.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function registerAndSpawn(name, spawnFn) {
  const profile = loadProfile(name);
  if (!profile) return { ok: false, reason: "profile-not-found" };
  return spawnFn(profile);
}

module.exports = { listProfiles, loadProfile, registerAndSpawn };
