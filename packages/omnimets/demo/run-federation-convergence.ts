import { runConvergence } from "../src/convergence.ts";

const r = await runConvergence({
  target: "FEDERATION-COL-ASOLARIA",
  waves: 6,
  iterations: 12,
  shortCircuitKConsecutive: 3,
  sealRequiresRatify: true,
  laneModulatedKinship: true,
  asymmetricDensity: true,
});

console.log(JSON.stringify(r, null, 2));
console.log("");
console.log(r.glyph_sentence || "(no glyph_sentence returned)");
