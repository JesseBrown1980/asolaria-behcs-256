const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveToolPaths } = require('./systemPaths');
const RESTRICTED_PROFILE_REGEX = /(sp+i+n+utech)/i;

function normalizeUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) {
    throw new Error('URL is empty.');
  }
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  const parsed = new URL(value);
  return parsed.toString();
}

function normalizeProfileName(raw) {
  return String(raw || "asolaria-ui")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

function resolveIsolatedProfilePath(profileName) {
  const safeName = normalizeProfileName(profileName || "asolaria-ui");
  return path.join(os.tmpdir(), "asolaria-chrome", safeName);
}

function getChromeUserDataPath() {
  const override = String(process.env.ASOLARIA_UI_CHROME_USER_DATA_DIR || '').trim();
  if (override) return override;
  const localAppData = String(process.env.LOCALAPPDATA || '').trim();
  if (localAppData) {
    return path.join(localAppData, 'Google', 'Chrome', 'User Data');
  }
  return path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
}

function readLocalStateInfoCache(userDataPath) {
  try {
    const localStatePath = path.join(userDataPath, 'Local State');
    if (!fs.existsSync(localStatePath)) return {};
    const raw = fs.readFileSync(localStatePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && parsed.profile && parsed.profile.info_cache && typeof parsed.profile.info_cache === 'object'
      ? parsed.profile.info_cache
      : {};
  } catch {
    return {};
  }
}

function readJsonFileSafe(filePath, fallback) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readProfileExtensionSettings(userDataPath, directory) {
  const profilePath = path.join(userDataPath, directory);
  const prefs = readJsonFileSafe(path.join(profilePath, "Preferences"), {});
  return prefs && prefs.extensions && prefs.extensions.settings && typeof prefs.extensions.settings === "object"
    ? prefs.extensions.settings
    : {};
}

function listProfileExtensions(userDataPath, directory) {
  const profilePath = path.join(userDataPath, directory);
  const extRoot = path.join(profilePath, "Extensions");
  const extensionSettings = readProfileExtensionSettings(userDataPath, directory);
  let entries = [];
  try {
    entries = fs.readdirSync(extRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const entry of entries) {
    if (!entry || !entry.isDirectory()) continue;
    const id = String(entry.name || "").trim();
    if (!id) continue;
    let versionDirs = [];
    try {
      versionDirs = fs.readdirSync(path.join(extRoot, id), { withFileTypes: true })
        .filter((child) => child && child.isDirectory())
        .map((child) => String(child.name || "").trim())
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a));
    } catch {
      versionDirs = [];
    }
    const version = versionDirs[0] || "";
    const manifest = version
      ? readJsonFileSafe(path.join(extRoot, id, version, "manifest.json"), {})
      : {};
    const setting = extensionSettings[id] && typeof extensionSettings[id] === "object"
      ? extensionSettings[id]
      : {};
    const stateValue = Number(setting.state);
    const enabled = Number.isFinite(stateValue) ? stateValue === 1 : true;
    out.push({
      id,
      version,
      name: String(manifest.name || id).trim() || id,
      enabled,
      permissions: Array.isArray(manifest.permissions) ? manifest.permissions.slice(0, 80) : [],
      hostPermissions: Array.isArray(manifest.host_permissions) ? manifest.host_permissions.slice(0, 80) : []
    });
  }

  out.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  return out;
}

function listChromeProfiles(userDataPath) {
  const infoCache = readLocalStateInfoCache(userDataPath);
  let entries = [];
  try {
    entries = fs.readdirSync(userDataPath, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry && entry.isDirectory())
    .map((entry) => String(entry.name || '').trim())
    .filter((name) => name === 'Default' || /^Profile\s+\d+$/i.test(name))
    .map((directory) => {
      const cached = infoCache[directory] || {};
      const displayName = String(cached.name || directory).trim() || directory;
      const email = String(cached.user_name || '').trim();
      const gaiaName = String(cached.gaia_name || '').trim();
      const identity = `${directory}|${displayName}|${email}|${gaiaName}`;
      const restricted = RESTRICTED_PROFILE_REGEX.test(identity);
      return { directory, displayName, email, restricted };
    });
}

function listManagedChromeProfiles(options = {}) {
  const userDataPath = getChromeUserDataPath();
  const allowRestricted = Boolean(options.allowRestrictedProfile || options.includeRestricted);
  const allProfiles = listChromeProfiles(userDataPath);
  const profiles = allowRestricted
    ? allProfiles
    : allProfiles.filter((entry) => !entry.restricted);
  let defaultProfile = null;
  try {
    defaultProfile = resolveManagedProfile({
      allowRestrictedProfile: allowRestricted,
      profileDirectory: String(options.profileDirectory || "").trim(),
      profileEmail: String(options.profileEmail || "").trim()
    });
  } catch {
    defaultProfile = null;
  }
  return {
    userDataPath,
    allowRestrictedProfile: allowRestricted,
    totalDiscovered: allProfiles.length,
    totalAllowed: profiles.length,
    defaultProfile,
    profiles
  };
}

function listManagedChromeProfilesWithExtension(options = {}) {
  const extensionId = String(options.extensionId || "").trim().toLowerCase();
  const extensionNamePattern = options.extensionNamePattern instanceof RegExp
    ? options.extensionNamePattern
    : null;
  if (!extensionId && !extensionNamePattern) {
    throw new Error("Extension match requires extensionId or extensionNamePattern.");
  }

  const listing = listManagedChromeProfiles(options);
  const matchedProfiles = [];
  for (const profile of Array.isArray(listing.profiles) ? listing.profiles : []) {
    const extensions = listProfileExtensions(listing.userDataPath, profile.directory);
    const matches = extensions.filter((ext) => {
      const byId = extensionId ? String(ext.id || "").trim().toLowerCase() === extensionId : false;
      const byName = extensionNamePattern ? extensionNamePattern.test(String(ext.name || "")) : false;
      return byId || byName;
    });
    if (!matches.length) continue;
    matchedProfiles.push({
      ...profile,
      extensions: matches
    });
  }

  return {
    ...listing,
    matchedProfiles,
    matchedCount: matchedProfiles.length,
    extensionId,
    extensionNamePattern: extensionNamePattern ? String(extensionNamePattern) : ""
  };
}

function resolveManagedProfile(options = {}) {
  const userDataPath = getChromeUserDataPath();
  const allowRestricted = Boolean(options.allowRestrictedProfile);
  const preferredDirectory = String(
    options.profileDirectory
    || process.env.ASOLARIA_UI_CHROME_PROFILE_DIRECTORY
    || ''
  ).trim();
  const preferredEmail = String(
    options.profileEmail
    || process.env.ASOLARIA_UI_CHROME_EMAIL
    || 'plasmatoid@gmail.com'
  ).trim().toLowerCase();

  const profiles = listChromeProfiles(userDataPath);
  if (!profiles.length) {
    throw new Error(`No Chrome profiles were found under ${userDataPath}.`);
  }

  const allowed = allowRestricted ? profiles : profiles.filter((entry) => !entry.restricted);
  if (!allowed.length) {
    throw new Error('No permitted Chrome profiles are available (all discovered profiles are restricted).');
  }

  if (preferredDirectory) {
    const match = allowed.find((entry) => entry.directory.toLowerCase() === preferredDirectory.toLowerCase());
    if (match) return match;
    throw new Error(`Preferred Chrome profile directory was not found or not permitted: ${preferredDirectory}`);
  }

  if (preferredEmail) {
    const match = allowed.find((entry) => entry.email.toLowerCase() === preferredEmail);
    if (match) return match;
    if (preferredEmail !== 'plasmatoid@gmail.com') {
      throw new Error(`Preferred Chrome profile email was not found or not permitted: ${preferredEmail}`);
    }
  }

  const profile3 = allowed.find((entry) => entry.directory.toLowerCase() === 'profile 3');
  if (profile3) return profile3;
  throw new Error('Plasmatoid Chrome profile could not be resolved.');
}

function normalizeWindowBounds(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const x = Number(source.x);
  const y = Number(source.y);
  const width = Number(source.width);
  const height = Number(source.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  const bounded = {
    x: Math.max(-50000, Math.min(50000, Math.round(x))),
    y: Math.max(-50000, Math.min(50000, Math.round(y))),
    width: Math.max(320, Math.min(12000, Math.round(width))),
    height: Math.max(220, Math.min(12000, Math.round(height)))
  };
  return bounded;
}

async function openChromeUrl(url, options = {}) {
  const launched = launchChromeUrl(url, options);
  return launched.url;
}

function launchChromeUrl(url, options = {}) {
  const toolPaths = resolveToolPaths();
  if (!toolPaths.chromePath) {
    throw new Error('Google Chrome was not found on this machine.');
  }

  const normalized = normalizeUrl(url);
  const appMode = Boolean(options.appMode);
  const newWindow = options.newWindow !== false;
  const isolatedProfile = Boolean(options.isolatedProfile);
  const useManagedProfile = options.useManagedProfile !== false && !isolatedProfile;
  const disableTranslate = options.disableTranslate !== false;
  const windowBounds = normalizeWindowBounds(options.windowBounds || {});
  const args = [];
  let profilePath = '';
  let profileDirectory = '';
  let profileEmail = '';
  if (disableTranslate) {
    // Prevent Chrome's translation UI from obscuring Asolaria app surfaces.
    args.push('--disable-translate');
    args.push('--disable-features=Translate,TranslateUI');
  }
  if (isolatedProfile) {
    const profileName = normalizeProfileName(options.profileName || "asolaria-ui");
    profilePath = resolveIsolatedProfilePath(profileName);
    fs.mkdirSync(profilePath, { recursive: true });
    args.push(`--user-data-dir=${profilePath}`);
    args.push('--no-first-run', '--no-default-browser-check');
  } else if (useManagedProfile) {
    const resolved = resolveManagedProfile(options);
    profileDirectory = resolved.directory;
    profileEmail = resolved.email;
    args.push(`--profile-directory=${profileDirectory}`);
  }
  if (windowBounds) {
    args.push(`--window-position=${windowBounds.x},${windowBounds.y}`);
    args.push(`--window-size=${windowBounds.width},${windowBounds.height}`);
  }
  if (newWindow) {
    args.push('--new-window');
  }
  if (appMode) {
    args.push(`--app=${normalized}`);
  } else {
    args.push(normalized);
  }

  const child = spawn(toolPaths.chromePath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();

  return {
    url: normalized,
    pid: Number(child.pid || 0) || null,
    appMode,
    profilePath,
    profileDirectory,
    profileEmail,
    windowBounds
  };
}

module.exports = {
  openChromeUrl,
  launchChromeUrl,
  normalizeUrl,
  resolveIsolatedProfilePath,
  resolveManagedProfile,
  listManagedChromeProfiles,
  listManagedChromeProfilesWithExtension
};
