/**
 * Network helper functions extracted from server.js (ADR-0001 Phase 3)
 *
 * Pure functions for IP classification, loopback detection,
 * forwarded-header parsing, and host normalization.
 * Used by 58+ route handlers via isLoopbackRequest.
 */

function isLoopbackAddress(address) {
  const value = String(address || "").trim();
  return (
    value === "127.0.0.1"
    || value === "::1"
    || value === "::ffff:127.0.0.1"
    || value.endsWith("::1")
  );
}

function normalizeIpLiteral(address) {
  const raw = String(address || "").trim();
  if (!raw) return "";
  const unscoped = raw.split("%")[0];
  if (unscoped.startsWith("::ffff:")) return unscoped.slice(7);
  return unscoped;
}

function isPrivateIpv4(address) {
  const value = normalizeIpLiteral(address);
  const parts = value.split(".").map((item) => Number(item));
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isCarrierGradeNatIpv4(address) {
  const value = normalizeIpLiteral(address);
  const parts = value.split(".").map((item) => Number(item));
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return false;
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function isPrivateIpv6(address) {
  const value = normalizeIpLiteral(address).toLowerCase();
  if (!value || value.includes(".")) return false;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("fe80:")) return true;
  return false;
}

function isPrivateAddress(address) {
  const value = normalizeIpLiteral(address);
  if (!value) return false;
  if (isLoopbackAddress(value)) return true;
  if (isPrivateIpv4(value)) return true;
  if (isPrivateIpv6(value)) return true;
  return false;
}

function normalizeForwardedIpCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let token = raw;
  if (token.startsWith("[")) {
    const close = token.indexOf("]");
    if (close > 1) token = token.slice(1, close);
  } else {
    const ipv4WithPort = token.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort) token = String(ipv4WithPort[1] || "").trim();
  }
  return normalizeIpLiteral(token);
}

function collectForwardedClientIps(req) {
  const values = [];
  const xff = req.headers["x-forwarded-for"];
  if (Array.isArray(xff)) values.push(...xff);
  else values.push(xff);
  values.push(
    req.headers["x-real-ip"],
    req.headers["cf-connecting-ip"],
    req.headers["true-client-ip"],
    req.headers["x-client-ip"]
  );
  const out = [];
  for (const row of values) {
    if (row === undefined || row === null) continue;
    const parts = String(row).split(",");
    for (const part of parts) {
      const normalized = normalizeForwardedIpCandidate(part);
      if (normalized) out.push(normalized);
    }
  }
  return Array.from(new Set(out));
}

function normalizeHostHeaderHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const first = raw.split(",")[0].trim();
  if (!first) return "";
  if (first.startsWith("[")) {
    const close = first.indexOf("]");
    if (close > 1) return first.slice(1, close);
    return first;
  }
  const colonCount = (first.match(/:/g) || []).length;
  if (colonCount <= 1 && first.includes(":")) return first.split(":")[0].trim();
  return first;
}

function isLoopbackRequest(req) {
  const ip = String(req.ip || "").trim();
  const remote = String(req.socket?.remoteAddress || "").trim();
  const baseIsLoopback = isLoopbackAddress(ip) || isLoopbackAddress(remote);
  if (!baseIsLoopback) return false;
  const forwarded = collectForwardedClientIps(req);
  for (const candidate of forwarded) {
    if (!isLoopbackAddress(candidate)) return false;
  }
  const hostHeader = normalizeHostHeaderHost(
    req.headers["x-forwarded-host"] || req.headers.host || ""
  );
  if (hostHeader && hostHeader !== "localhost") {
    const hostAsIp = normalizeIpLiteral(hostHeader);
    if (!isLoopbackAddress(hostAsIp)) return false;
  }
  return true;
}

module.exports = {
  isLoopbackAddress,
  normalizeIpLiteral,
  isPrivateIpv4,
  isCarrierGradeNatIpv4,
  isPrivateIpv6,
  isPrivateAddress,
  normalizeForwardedIpCandidate,
  collectForwardedClientIps,
  normalizeHostHeaderHost,
  isLoopbackRequest
};
