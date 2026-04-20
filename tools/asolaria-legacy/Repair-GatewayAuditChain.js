const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const reportsDir = path.join(repoRoot, "reports");
const gatewayAuditPath = path.join(dataDir, "gateway-audit.ndjson");
const requestAttributionPath = path.join(dataDir, "request-attribution.ndjson");

function pad(value) {
  return String(value).padStart(2, "0");
}

function localTimestampStamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function toPlainObject(value) {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value));
}

function computeEntryHash(entry) {
  const base = [
    String(entry.prevHash || "GENESIS"),
    String(entry.id || ""),
    String(entry.at || ""),
    String(entry.type || ""),
    String(entry.payloadHash || "")
  ].join("|");
  return sha256(base);
}

function isRequestAttributionEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  return !entry.hash
    && !entry.prevHash
    && typeof entry.method === "string"
    && typeof entry.path === "string"
    && typeof entry.ip === "string";
}

function normalizeGatewayEntry(entry, index, prevHash) {
  const raw = toPlainObject(entry);
  const at = String(raw.at || "");
  const actor = String(raw.actor || "").slice(0, 120);

  let id = "";
  let type = "";
  let payload = {};
  let sourceKind = "gateway";

  if (isRequestAttributionEntry(raw)) {
    id = `legacy_attr_${String(index + 1).padStart(6, "0")}`;
    type = "request.attribution";
    payload = {
      ip: String(raw.ip || ""),
      isLoopback: Boolean(raw.isLoopback),
      role: String(raw.role || ""),
      source: String(raw.source || ""),
      method: String(raw.method || ""),
      path: String(raw.path || ""),
      userAgent: String(raw.userAgent || ""),
      query: raw.query === undefined ? "" : String(raw.query || "")
    };
    sourceKind = "request-attribution";
  } else {
    id = String(raw.id || `legacy_event_${String(index + 1).padStart(6, "0")}`);
    type = String(raw.type || "event");
    payload = toPlainObject(raw.payload || {});
  }

  const normalized = {
    id,
    at,
    type,
    actor,
    payload,
    payloadHash: sha256(stableStringify(payload)),
    prevHash
  };
  normalized.hash = computeEntryHash(normalized);

  return { normalized, sourceKind };
}

function verifyChain(entries) {
  let prevHash = "GENESIS";
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (String(entry.prevHash || "") !== prevHash) {
      return {
        ok: false,
        firstError: `entry ${index + 1} prevHash mismatch`
      };
    }
    const expectedHash = computeEntryHash(entry);
    if (String(entry.hash || "") !== expectedHash) {
      return {
        ok: false,
        firstError: `entry ${index + 1} hash mismatch`
      };
    }
    prevHash = expectedHash;
  }
  return {
    ok: true,
    firstError: "",
    lastHash: prevHash
  };
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function main() {
  if (!fs.existsSync(gatewayAuditPath)) {
    throw new Error(`Gateway audit file not found: ${gatewayAuditPath}`);
  }

  const stamp = localTimestampStamp();
  const backupDir = path.join(dataDir, "backups", `gateway-audit-repair-${stamp}`);
  const manifestPath = path.join(reportsDir, `gateway-audit-repair-${stamp}.json`);
  const rawLines = readLines(gatewayAuditPath);
  const parsed = [];
  const invalid = [];

  rawLines.forEach((line, index) => {
    try {
      parsed.push({ entry: JSON.parse(line), line, index: index + 1 });
    } catch (error) {
      invalid.push({
        lineNumber: index + 1,
        error: String(error && error.message ? error.message : error)
      });
    }
  });

  if (invalid.length > 0) {
    throw new Error(`Invalid JSON lines detected in gateway audit file. First invalid line: ${invalid[0].lineNumber}`);
  }

  ensureParent(path.join(backupDir, "placeholder.txt"));
  ensureParent(manifestPath);

  const backupGatewayPath = path.join(backupDir, "gateway-audit.original.ndjson");
  fs.copyFileSync(gatewayAuditPath, backupGatewayPath);

  let existingRequestLines = [];
  let backupRequestPath = "";
  if (fs.existsSync(requestAttributionPath)) {
    backupRequestPath = path.join(backupDir, "request-attribution.original.ndjson");
    fs.copyFileSync(requestAttributionPath, backupRequestPath);
    existingRequestLines = readLines(requestAttributionPath);
  }

  const normalizedEntries = [];
  const extractedRequestLines = [];
  let prevHash = "GENESIS";
  let requestAttributionCount = 0;
  let firstMixedLine = 0;

  for (const item of parsed) {
    const { normalized, sourceKind } = normalizeGatewayEntry(item.entry, item.index - 1, prevHash);
    normalizedEntries.push(normalized);
    prevHash = normalized.hash;

    if (sourceKind === "request-attribution") {
      requestAttributionCount += 1;
      if (!firstMixedLine) firstMixedLine = item.index;
      extractedRequestLines.push(item.line);
    }
  }

  const verifyResult = verifyChain(normalizedEntries);
  if (!verifyResult.ok) {
    throw new Error(`Rebuilt gateway audit chain failed verification: ${verifyResult.firstError}`);
  }

  const requestLineSet = new Set(existingRequestLines);
  for (const line of extractedRequestLines) {
    requestLineSet.add(line);
  }
  const mergedRequestLines = Array.from(requestLineSet);

  fs.writeFileSync(
    gatewayAuditPath,
    normalizedEntries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    "utf8"
  );

  fs.writeFileSync(
    requestAttributionPath,
    mergedRequestLines.join("\n") + (mergedRequestLines.length > 0 ? "\n" : ""),
    "utf8"
  );

  const manifest = {
    ok: true,
    repairedAt: new Date().toISOString(),
    backupDir,
    backupGatewayPath,
    backupRequestPath,
    gatewayAuditPath,
    requestAttributionPath,
    originalLineCount: rawLines.length,
    rebuiltGatewayEntryCount: normalizedEntries.length,
    requestAttributionCount,
    requestAttributionFileLineCount: mergedRequestLines.length,
    firstMixedLine,
    lastHash: verifyResult.lastHash,
    pid: "gaia-20260329-jesse-system-restart",
    profile: "gaia"
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  process.stdout.write(JSON.stringify(manifest, null, 2));
}

try {
  main();
} catch (error) {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
}
