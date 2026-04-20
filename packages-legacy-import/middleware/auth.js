const crypto = require("crypto");

const ROLES = {
  admin: { id: "admin", label: "Admin" },
  operator: { id: "operator", label: "Operator" },
  readonly: { id: "readonly", label: "Read Only" }
};

const tokenStore = [];

function normalizeRole(role) {
  const value = String(role || "admin").trim().toLowerCase();
  return ROLES[value] ? value : "admin";
}

function listTokens() {
  return tokenStore.map((row) => ({
    hint: row.hint,
    label: row.label,
    role: row.role,
    createdAt: row.createdAt
  }));
}

function generateToken(label, role = "admin") {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) {
    throw new Error("Token label is required.");
  }
  const token = `stub_${crypto.randomBytes(12).toString("hex")}`;
  const hint = token.slice(-8);
  const row = {
    token,
    hint,
    label: cleanLabel,
    role: normalizeRole(role),
    createdAt: new Date().toISOString()
  };
  tokenStore.push(row);
  return {
    token,
    hint,
    label: row.label,
    role: row.role
  };
}

function revokeToken(hint) {
  const needle = String(hint || "").trim().toLowerCase();
  const index = tokenStore.findIndex((row) => row.hint.toLowerCase() === needle);
  if (index < 0) {
    return false;
  }
  tokenStore.splice(index, 1);
  return true;
}

function requirePermission(_level = "readonly") {
  return (_req, _res, next) => next();
}

module.exports = {
  ROLES,
  listTokens,
  generateToken,
  revokeToken,
  requirePermission
};
