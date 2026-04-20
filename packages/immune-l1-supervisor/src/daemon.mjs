#!/usr/bin/env node
// WAVE-IMMUNE-L1 acer mirror · supervised /type proxy on :4821
// - mints per-call ed25519-signed nonce
// - forwards validated calls to local :4913/type
// - refuses calls missing x-supervisor-nonce OR calls targeting a non-registered pid
// - logs every gate decision to tmp/immune-l1-audit.log

import http from "node:http";
import { createHash, sign, verify, generateKeyPairSync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(__dirname, "../../..");
const KEY_DIR = resolvePath(REPO_ROOT, "packages/immune-l1-supervisor/keys");
const PRIV_PATH = resolvePath(KEY_DIR, "supervisor.ed25519.pem");
const PUB_PATH  = resolvePath(KEY_DIR, "supervisor.ed25519.pub.pem");
const AUDIT_LOG = resolvePath(REPO_ROOT, "tmp/immune-l1-audit.log");
const LAW_VIOLATIONS_LOG = resolvePath(REPO_ROOT, "tmp/immune-l1-law-violations.ndjson");
if (!existsSync(KEY_DIR)) mkdirSync(KEY_DIR, { recursive: true });
if (!existsSync(dirname(AUDIT_LOG))) mkdirSync(dirname(AUDIT_LOG), { recursive: true });

const PORT = parseInt(process.env.IMMUNE_L1_PORT || "4821", 10);
const LOCAL_KEYBOARD = process.env.LOCAL_KEYBOARD_URL || "http://127.0.0.1:4913";
const LOCAL_KEYBOARD_BEARER_PATH = process.env.LOCAL_KEYBOARD_BEARER_PATH
  || "C:/Users/acer/Asolaria/data/vault/owner/agent-keyboard/token.txt";
const BIND_LAN = process.env.IMMUNE_L1_BIND_LAN === "1";
const BIND_ADDRESS = BIND_LAN ? "0.0.0.0" : "127.0.0.1";
const PEER_ALLOWLIST = (process.env.IMMUNE_L1_PEER_ALLOWLIST
  ? process.env.IMMUNE_L1_PEER_ALLOWLIST.split(",").map(s => s.trim()).filter(Boolean)
  : ["192.168.100.2"]);
const CYCLE_URL = process.env.ASOLARIA_CYCLE_URL || "";
const MAX_BODY_BYTES = 4096;
const RATE_LIMIT_CAPACITY = 20;         // tokens
const RATE_LIMIT_REFILL_PER_SEC = 20;    // 20 req/s refill
const NONCE_TTL_SWEEP_MS = 30000;        // sweep >30s old
const NONCE_SWEEP_INTERVAL_MS = 10000;   // every 10s

// --- Hash-chained audit log ---
let PREV_HASH = "";
function audit(line) {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${line}`;
  const h = createHash("sha256").update(PREV_HASH + base).digest("hex");
  PREV_HASH = h;
  const out = `${base} [hash=${h.slice(0, 16)}]\n`;
  try { appendFileSync(AUDIT_LOG, out); } catch {}
  process.stdout.write(out);
}

// --- Nonce replay store ---
const USED_NONCES = new Map();  // sig (base64) → first-seen epoch ms
function markNonceUsed(sig) { USED_NONCES.set(sig, Date.now()); }
function isNonceUsed(sig) { return USED_NONCES.has(sig); }
setInterval(() => {
  const cutoff = Date.now() - NONCE_TTL_SWEEP_MS;
  for (const [sig, ts] of USED_NONCES) {
    if (ts < cutoff) USED_NONCES.delete(sig);
  }
}, NONCE_SWEEP_INTERVAL_MS).unref();

// --- Token-bucket rate limiter per remote IP ---
const RATE_BUCKETS = new Map();  // ip → { tokens, last }
function takeToken(ip) {
  const now = Date.now();
  let b = RATE_BUCKETS.get(ip);
  if (!b) { b = { tokens: RATE_LIMIT_CAPACITY, last: now }; RATE_BUCKETS.set(ip, b); }
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(RATE_LIMIT_CAPACITY, b.tokens + elapsed * RATE_LIMIT_REFILL_PER_SEC);
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function remoteIp(req) {
  const raw = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
  // Normalize IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4)
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function isOriginAllowed(ip) {
  if (!BIND_LAN) return true; // loopback-only bind, nothing else can reach us
  if (ip === "127.0.0.1" || ip === "::1") return true;
  return PEER_ALLOWLIST.includes(ip);
}

async function reportLawViolation(kind, detail) {
  const entry = { ts: new Date().toISOString(), kind, detail };
  if (CYCLE_URL) {
    try {
      await fetch(CYCLE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
        signal: AbortSignal.timeout(3000),
      });
      return;
    } catch (e) {
      // fall through to file
    }
  }
  try { appendFileSync(LAW_VIOLATIONS_LOG, JSON.stringify(entry) + "\n"); } catch {}
}

// One-time keypair generation
if (!existsSync(PRIV_PATH) || !existsSync(PUB_PATH)) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(PRIV_PATH, privateKey.export({ type: "pkcs8", format: "pem" }));
  writeFileSync(PUB_PATH, publicKey.export({ type: "spki", format: "pem" }));
  audit(`generated new ed25519 keypair at ${KEY_DIR}`);
}
const PRIV = readFileSync(PRIV_PATH, "utf8");
const PUB  = readFileSync(PUB_PATH, "utf8");
const BEARER = existsSync(LOCAL_KEYBOARD_BEARER_PATH) ? readFileSync(LOCAL_KEYBOARD_BEARER_PATH, "utf8").trim() : "";

// Registered pids: peers we permit typing to. Reject everything else.
const REGISTERED_PIDS = new Map();  // pid → { peer_id, window_title_hint }

function issueNonce({ peer_id, pid, text_hash, ttl_ms = 5000 }) {
  const payload = JSON.stringify({ peer_id, pid, text_hash, exp: Date.now() + ttl_ms });
  const sig = sign(null, Buffer.from(payload), PRIV).toString("base64");
  return { payload_b64: Buffer.from(payload).toString("base64"), sig };
}

function verifyNonce(header) {
  try {
    const { payload_b64, sig } = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const payload = Buffer.from(payload_b64, "base64").toString("utf8");
    const ok = verify(null, Buffer.from(payload), PUB, Buffer.from(sig, "base64"));
    if (!ok) return { ok: false, reason: "ed25519 verify failed" };
    const parsed = JSON.parse(payload);
    if (Date.now() > parsed.exp) return { ok: false, reason: "nonce expired" };
    return { ok: true, nonce: parsed, sig };
  } catch (e) { return { ok: false, reason: `parse: ${e.message}` }; }
}

function textHash(s) { return createHash("sha256").update(String(s)).digest("hex"); }

async function readJson(req) {
  return new Promise((res, rej) => {
    let buf = "";
    let bytes = 0;
    let overflow = false;
    req.on("data", c => {
      if (overflow) return;
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) {
        overflow = true;
        rej(Object.assign(new Error("body too large"), { code: "BODY_TOO_LARGE" }));
        try { req.destroy(); } catch {}
        return;
      }
      buf += c;
    });
    req.on("end", () => { if (overflow) return; try { res(JSON.parse(buf || "{}")); } catch (e) { rej(e); } });
    req.on("error", rej);
  });
}
function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function forwardToKeyboard(body) {
  const r = await fetch(`${LOCAL_KEYBOARD}/type`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${BEARER}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

function checkBearer(req) {
  const h = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) return false;
  if (!BEARER) return false;
  return m[1].trim() === BEARER;
}

const server = http.createServer(async (req, res) => {
  const ip = remoteIp(req);
  try {
    // Gate 0: origin allowlist when bound to LAN
    if (!isOriginAllowed(ip)) {
      audit(`REFUSED origin-not-allowed ip=${ip} url=${req.url}`);
      await reportLawViolation("origin_not_allowed", { ip, url: req.url });
      return send(res, 403, { error: "origin not allowed" });
    }
    // Gate 1: per-IP token bucket rate limit
    if (!takeToken(ip)) {
      audit(`REFUSED rate-limit ip=${ip} url=${req.url}`);
      await reportLawViolation("rate_limit", { ip, url: req.url });
      return send(res, 429, { error: "rate limit exceeded" });
    }

    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, {
        ok: true,
        service: "immune-l1-supervisor",
        port: PORT,
        uptime_s: Math.round(process.uptime()),
        pubkey_fingerprint: createHash("sha256").update(PUB).digest("hex").slice(0,16),
        registered_pids: Array.from(REGISTERED_PIDS.entries()).map(([pid, m]) => ({ pid, ...m })),
        bind_address: BIND_ADDRESS,
        bind_lan: BIND_LAN,
        peer_allowlist: BIND_LAN ? PEER_ALLOWLIST : null,
        rate_limit_enabled: true,
        rate_limit_capacity: RATE_LIMIT_CAPACITY,
        rate_limit_refill_per_sec: RATE_LIMIT_REFILL_PER_SEC,
        used_nonces_count: USED_NONCES.size,
        body_cap_bytes: MAX_BODY_BYTES,
        cycle_url_configured: Boolean(CYCLE_URL),
      });
    }
    if (req.method === "GET" && req.url === "/pubkey") {
      res.writeHead(200, { "Content-Type": "application/x-pem-file" }); return res.end(PUB);
    }
    if (req.method === "POST" && req.url === "/register-pid") {
      // Gate 2: bearer auth required (same token as forwarder)
      if (!checkBearer(req)) {
        audit(`register-pid REFUSED bad-bearer ip=${ip}`);
        await reportLawViolation("bad_bearer_register", { ip });
        return send(res, 401, { error: "unauthorized: bearer required" });
      }
      const body = await readJson(req);
      if (!body.pid || !body.peer_id) return send(res, 400, { error: "missing pid/peer_id" });
      REGISTERED_PIDS.set(body.pid, { peer_id: body.peer_id, window_title_hint: body.window_title_hint || "" });
      audit(`register-pid pid=${body.pid} peer=${body.peer_id} ip=${ip}`);
      return send(res, 200, { ok: true, registered: Array.from(REGISTERED_PIDS.entries()) });
    }
    if (req.method === "POST" && req.url === "/mint-nonce") {
      const body = await readJson(req);
      if (!body.peer_id || !body.pid || !body.text) return send(res, 400, { error: "missing peer_id/pid/text" });
      if (!REGISTERED_PIDS.has(body.pid)) {
        audit(`mint-nonce REFUSED unregistered pid=${body.pid} ip=${ip}`);
        await reportLawViolation("unregistered_pid", { pid: body.pid, ip, endpoint: "mint-nonce" });
        return send(res, 403, { error: "pid not registered" });
      }
      const n = issueNonce({ peer_id: body.peer_id, pid: body.pid, text_hash: textHash(body.text) });
      return send(res, 200, { ok: true, nonce_header: Buffer.from(JSON.stringify(n)).toString("base64") });
    }
    if (req.method === "POST" && req.url === "/type-supervised") {
      const nh = req.headers["x-supervisor-nonce"];
      if (!nh) { audit(`type-supervised REFUSED missing nonce ip=${ip}`); return send(res, 401, { error: "missing x-supervisor-nonce" }); }
      const v = verifyNonce(nh);
      if (!v.ok) {
        audit(`type-supervised REFUSED ${v.reason} ip=${ip}`);
        await reportLawViolation("bad_nonce", { reason: v.reason, ip });
        return send(res, 401, { error: v.reason });
      }
      // Gate 3: replay protection
      if (isNonceUsed(v.sig)) {
        audit(`type-supervised REFUSED replay sig=${v.sig.slice(0,16)} ip=${ip}`);
        await reportLawViolation("nonce_replay", { sig_prefix: v.sig.slice(0,16), ip });
        return send(res, 401, { error: "nonce replay detected" });
      }
      const body = await readJson(req);
      if (!body.pid || body.pid !== v.nonce.pid) { audit(`type-supervised REFUSED pid-mismatch nonce=${v.nonce.pid} body=${body.pid} ip=${ip}`); return send(res, 401, { error: "pid mismatch" }); }
      if (textHash(body.text) !== v.nonce.text_hash) { audit(`type-supervised REFUSED text-hash-mismatch ip=${ip}`); return send(res, 401, { error: "text hash mismatch" }); }
      if (!REGISTERED_PIDS.has(body.pid)) {
        audit(`type-supervised REFUSED unregistered pid=${body.pid} ip=${ip}`);
        await reportLawViolation("unregistered_pid", { pid: body.pid, ip, endpoint: "type-supervised" });
        return send(res, 403, { error: "pid not registered" });
      }
      // Gate 4: peer_id binding check — pid's registered peer must match nonce peer
      const reg = REGISTERED_PIDS.get(body.pid);
      if (!reg || reg.peer_id !== v.nonce.peer_id) {
        audit(`type-supervised REFUSED peer-id-binding-mismatch pid=${body.pid} reg_peer=${reg && reg.peer_id} nonce_peer=${v.nonce.peer_id} ip=${ip}`);
        await reportLawViolation("peer_id_binding_mismatch", { pid: body.pid, reg_peer: reg && reg.peer_id, nonce_peer: v.nonce.peer_id, ip });
        return send(res, 401, { error: "peer_id/pid binding mismatch" });
      }
      // Mark nonce consumed — single-use
      markNonceUsed(v.sig);
      const fw = await forwardToKeyboard({ text: body.text, pid: body.pid, press_enter: Boolean(body.press_enter) });
      audit(`type-supervised FORWARDED pid=${body.pid} peer=${v.nonce.peer_id} text_hash=${v.nonce.text_hash.slice(0,16)} -> kb=${fw.status} ip=${ip}`);
      return send(res, fw.status, { ok: fw.status === 200, keyboard_response: fw.body });
    }
    if (req.method === "POST" && req.url === "/observe-law-violation") {
      const body = await readJson(req);
      const kind = String(body.kind || "unknown");
      const detail = body.detail || {};
      audit(`observe-law-violation kind=${kind} ip=${ip}`);
      await reportLawViolation(kind, { ...detail, reporter_ip: ip });
      return send(res, 200, { ok: true, recorded: true, cycle_forwarded: Boolean(CYCLE_URL) });
    }
    return send(res, 404, { error: "not found", endpoints: ["/health", "/pubkey", "/register-pid", "/mint-nonce", "/type-supervised", "/observe-law-violation"] });
  } catch (e) {
    if (e && e.code === "BODY_TOO_LARGE") {
      audit(`REFUSED body-too-large ip=${ip} url=${req.url}`);
      await reportLawViolation("body_too_large", { ip, url: req.url });
      return send(res, 413, { error: "body too large" });
    }
    audit(`ERROR ${e.message} ip=${ip}`);
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, BIND_ADDRESS, () => {
  audit(`immune-l1-supervisor ONLINE port=${PORT} bind=${BIND_ADDRESS} bind_lan=${BIND_LAN} pubkey_fp=${createHash("sha256").update(PUB).digest("hex").slice(0,16)} forwards-to=${LOCAL_KEYBOARD} cycle_url=${CYCLE_URL ? "set" : "unset"}`);
});
