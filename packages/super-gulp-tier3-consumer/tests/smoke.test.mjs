#!/usr/bin/env node
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promoteTier2ToTier3 } from "../src/promoter.mjs";
import { consumeOneSuperGulpFile } from "../src/consumer.mjs";

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { pass++; console.log("  PASS  " + label); } else { fail++; console.log("  FAIL  " + label); } }

// Use real Asolaria dirs but with a test-file sentinel so we don't mangle production state.
// Simpler: test the module shape/imports only here; end-to-end test belongs in integration.

console.log("\n=== module imports ===");
assert(typeof promoteTier2ToTier3 === "function", "promoteTier2ToTier3 exported");
assert(typeof consumeOneSuperGulpFile === "function", "consumeOneSuperGulpFile exported");

console.log("\n=== promoteTier2ToTier3 runs on existing archive dir ===");
const r1 = promoteTier2ToTier3();
assert(r1 && typeof r1.ok === "boolean", "returns ok field");
assert(typeof r1.promoted === "number" || r1.reason, "returns promoted count or reason");

console.log("\n=== consumeOneSuperGulpFile runs on existing queue ===");
const r2 = consumeOneSuperGulpFile();
assert(r2 && typeof r2.ok === "boolean", "returns ok field");
assert(r2.consumed === undefined || typeof r2.consumed === "string" || r2.consumed === 0, "consumed is filename or 0");

console.log(`\n=== RESULTS ===\npass=${pass} fail=${fail} verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"}`);
process.exit(fail === 0 ? 0 : 1);
