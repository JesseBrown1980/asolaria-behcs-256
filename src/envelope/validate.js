// Item 024 · Ajv-based validator for envelope v1
// Run: const { validate } = require("./validate"); const r = validate(env);
// Returns { ok: bool, errors?: string[] }.
//
// We don't hard-require ajv at load time so this file is usable even when deps aren't
// installed; call installAjv(ajv) once at boot if available, else use the lightweight
// schema-less check fallback.

const SCHEMA = require("../../schemas/envelope-v1.schema.json");

let ajvValidator = null;

/** Optional: inject an ajv instance (or compiled validator). */
function installAjv(ajvOrValidator) {
  if (typeof ajvOrValidator === "function") {
    ajvValidator = ajvOrValidator;
  } else if (ajvOrValidator && typeof ajvOrValidator.compile === "function") {
    ajvValidator = ajvOrValidator.compile(SCHEMA);
  } else {
    throw new Error("installAjv expects either a compiled validator fn or an Ajv instance");
  }
}

/** Hand-rolled fallback when ajv isn't installed. Covers required fields + shallow types. */
function fallbackValidate(env) {
  const errors = [];
  if (!env || typeof env !== "object") return { ok: false, errors: ["envelope not object"] };
  for (const f of ["id", "ts", "src", "kind", "body"]) {
    if (env[f] === undefined) errors.push(`missing required '${f}'`);
  }
  if (typeof env.id === "string" && env.id.length < 6) errors.push("id too short");
  if (env.mode !== undefined && env.mode !== "real" && env.mode !== "shadow") errors.push("mode must be real|shadow");
  if (env.body !== undefined && (typeof env.body !== "object" || Array.isArray(env.body))) errors.push("body must be object");
  if (env.dimensional_tags) {
    for (const k of Object.keys(env.dimensional_tags)) {
      if (!/^d([1-9]|[12][0-9]|3[0-5])$/.test(k)) errors.push(`dimensional_tags key '${k}' not d1..d35`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Public: validate an envelope against v1 schema. */
function validate(env) {
  if (ajvValidator) {
    const ok = ajvValidator(env);
    return ok ? { ok: true } : { ok: false, errors: (ajvValidator.errors || []).map(e => `${e.instancePath} ${e.message}`) };
  }
  return fallbackValidate(env);
}

module.exports = { validate, installAjv, SCHEMA };
