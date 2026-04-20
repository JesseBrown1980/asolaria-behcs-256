const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..");
const gatewayAuditPath = path.join(repoRoot, "data", "gateway-audit.ndjson");
const attributionPath = path.join(repoRoot, "data", "request-attribution.ndjson");
const backupsRoot = path.join(repoRoot, "data", "backups");

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
  const body = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${body.join(",")}}`;
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isChainedEntry(entry) {
  return Boolean(
    entry
      && typeof entry === "object"
      && typeof entry.id === "string"
      && typeof entry.type === "string"
      && Object.prototype.hasOwnProperty.call(entry, "payloadHash")
      && Object.prototype.hasOwnProperty.call(entry, "prevHash")
      && Object.prototype.hasOwnProperty.call(entry, "hash")
  );
}

function formatStamp(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function readJsonLines(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/g).filter((line) => String(line || "").trim().length > 0);
  return lines.map((line, index) => ({
    lineNumber: index + 1,
    rawLine: line,
    entry: JSON.parse(line)
  }));
}

function buildRepairDoc(rows) {
  const chainedRows = [];
  const plainRows = [];
  for (const row of rows) {
    if (isChainedEntry(row.entry)) {
      chainedRows.push(row);
    } else {
      plainRows.push(row);
    }
  }

  let prevHash = "GENESIS";
  const rebuiltEntries = chainedRows.map((row) => {
    const entry = cloneJson(row.entry);
    entry.prevHash = prevHash;
    if (!Object.prototype.hasOwnProperty.call(entry, "payloadHash")) {
      entry.payloadHash = sha256(stableStringify(entry.payload || {}));
    }
    entry.hash = computeEntryHash(entry);
    prevHash = entry.hash;
    return entry;
  });

  return {
    totalRows: rows.length,
    chainedRows: chainedRows.length,
    plainRows: plainRows.length,
    firstPlainLine: plainRows.length > 0 ? plainRows[0].lineNumber : 0,
    rebuiltEntries,
    plainLines: plainRows.map((row) => row.rawLine)
  };
}

function loadExistingLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/g).filter((line) => String(line || "").trim().length > 0);
}

function writeJsonl(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  fs.writeFileSync(filePath, body, "utf8");
}

function main() {
  if (!fs.existsSync(gatewayAuditPath)) {
    throw new Error(`Gateway audit file not found: ${gatewayAuditPath}`);
  }

  const apply = process.argv.includes("--apply");
  const rows = readJsonLines(gatewayAuditPath);
  const repair = buildRepairDoc(rows);
  const summary = {
    gatewayAuditPath,
    attributionPath,
    totalRows: repair.totalRows,
    chainedRows: repair.chainedRows,
    plainRows: repair.plainRows,
    firstPlainLine: repair.firstPlainLine,
    apply
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const stamp = formatStamp();
  const backupDir = path.join(backupsRoot, `gateway-audit-repair-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const gatewayAuditBackupPath = path.join(backupDir, "gateway-audit.original.ndjson");
  fs.copyFileSync(gatewayAuditPath, gatewayAuditBackupPath);

  let attributionBackupPath = "";
  const existingAttributionLines = loadExistingLines(attributionPath);
  if (fs.existsSync(attributionPath)) {
    attributionBackupPath = path.join(backupDir, "request-attribution.original.ndjson");
    fs.copyFileSync(attributionPath, attributionBackupPath);
  }

  const rebuiltGatewayLines = repair.rebuiltEntries.map((entry) => JSON.stringify(entry));
  const mergedAttributionLines = existingAttributionLines.concat(repair.plainLines);

  writeJsonl(gatewayAuditPath, rebuiltGatewayLines);
  writeJsonl(attributionPath, mergedAttributionLines);

  const manifest = {
    stamp,
    gatewayAuditPath,
    gatewayAuditBackupPath,
    attributionPath,
    attributionBackupPath,
    totalRows: repair.totalRows,
    chainedRows: repair.chainedRows,
    plainRows: repair.plainRows,
    firstPlainLine: repair.firstPlainLine,
    rebuiltGatewayRows: rebuiltGatewayLines.length,
    mergedAttributionRows: mergedAttributionLines.length
  };
  fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(JSON.stringify(manifest, null, 2));
}

main();
