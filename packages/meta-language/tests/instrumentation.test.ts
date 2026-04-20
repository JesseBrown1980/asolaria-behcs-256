import { measureFluency, verdictFor, markEchoes, type Utterance } from "../src/instrumentation.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== T-001 meta-language instrumentation tests ===\n");

const W_START = "2026-04-19T05:00:00Z";
const W_END = "2026-04-19T06:00:00Z";

function utter(actor: string, kind: Utterance["kind"], ts: string, tokens: number = 100): Utterance {
  return { actor, ts, kind, tokens, observed_by: "acer" };
}

// T1: empty window
console.log("T1: empty");
const m1 = measureFluency([], W_START, W_END);
assert(m1.utterances === 0, "0 utterances");
assert(m1.total_tokens === 0, "0 tokens");
assert(m1.honest_fluency === 0, "0 fluency");
assert(m1.silence_ratio === 1, "100% silence (no activity)");

// T2: pure signal
console.log("\nT2: pure signal");
const m2 = measureFluency([utter("a", "forward-progress", W_START, 100)], W_START, W_END);
assert(m2.honest_fluency === 1, "fluency=1.0");
assert(m2.by_kind["forward-progress"] === 1, "1 forward");

// T3: mixed kinds
console.log("\nT3: mixed kinds");
const us3: Utterance[] = [
  utter("a", "forward-progress", W_START, 500),
  utter("a", "heartbeat", W_START, 10),
  utter("a", "heartbeat", W_START, 10),
  utter("a", "ack", W_START, 20),
  utter("a", "echo", W_START, 40),
];
const m3 = measureFluency(us3, W_START, W_END);
assert(m3.utterances === 5, "5 utterances");
assert(m3.total_tokens === 580, "total=580");
assert(m3.signal_tokens === 500, "signal=500");
assert(Math.abs(m3.honest_fluency - 500/580) < 0.001, "fluency=~0.862");

// T4: echo ratio
console.log("\nT4: echo ratio");
assert(Math.abs(m3.echo_ratio - 0.2) < 0.001, "echo=0.2");

// T5: per-actor breakdown
console.log("\nT5: by-actor");
const multi: Utterance[] = [
  utter("a", "forward-progress", W_START, 200),
  utter("a", "heartbeat", W_START, 5),
  utter("b", "forward-progress", W_START, 300),
  utter("b", "noise", W_START, 50),
];
const m5 = measureFluency(multi, W_START, W_END);
assert(m5.actors === 2, "2 actors");
assert(m5.by_actor.a.utterances === 2, "a=2");
assert(m5.by_actor.a.signal_tokens === 200, "a signal=200");
assert(m5.by_actor.b.utterances === 2, "b=2");
assert(Math.abs(m5.by_actor.b.fluency - 300/350) < 0.001, "b fluency ~0.857");

// T6: silence ratio — sparse activity
console.log("\nT6: silence");
const startMs = Date.parse(W_START);
const sparse: Utterance[] = [
  utter("a", "forward-progress", W_START, 100),                                  // 0min
  utter("a", "forward-progress", new Date(startMs + 30 * 60_000).toISOString(), 100),  // 30min
];
const m6 = measureFluency(sparse, W_START, W_END);
// Gap from 0 to 30 = 30min idle; end gap 30→60 = 30min idle; start gap 0 = 0
// Each counts since ≥60s apart. Total ~60min of 60min window = near 1.0
assert(m6.silence_ratio > 0.9, `high silence (got ${m6.silence_ratio})`);

// T7: no silence — continuous activity spanning full window
console.log("\nT7: no silence");
const dense: Utterance[] = [];
for (let i = 0; i < 120; i++) dense.push(utter("a", "forward-progress", new Date(startMs + i * 30_000).toISOString(), 10));
// every 30s for 60 minutes → last at W_END, no gap >=60s
const m7 = measureFluency(dense, W_START, W_END);
assert(m7.silence_ratio < 0.1, `low silence (got ${m7.silence_ratio})`);

// T8: verdict GREEN
console.log("\nT8: GREEN verdict");
const v1 = verdictFor(m3);
// fluency ~0.862, silence ~1 (window large, only W_START activity), echo 0.2
// silence is high → YELLOW or RED
assert(v1.color !== "GREEN", "not green due to silence");

// T9: verdict GREEN with high fluency + low silence
console.log("\nT9: GREEN with dense");
const v2 = verdictFor(m7);
assert(v2.color === "GREEN", `GREEN (got ${v2.color})`);
assert(v2.reasons.length === 0, "no reasons");

// T10: verdict RED
console.log("\nT10: RED verdict");
const bad: Utterance[] = [
  utter("a", "echo", W_START, 500),
  utter("a", "echo", W_START, 500),
  utter("a", "echo", W_START, 500),
  utter("a", "heartbeat", W_START, 10),
];
const mBad = measureFluency(bad, W_START, W_END);
// fluency ~0 (no forward-progress), silence ~1, echo 0.75 → 3 reasons → RED
const v3 = verdictFor(mBad);
assert(v3.color === "RED", `RED (got ${v3.color})`);
assert(v3.reasons.length >= 2, "≥2 reasons");

// T11: markEchoes tags repeated identical actor+token count
console.log("\nT11: markEchoes");
const raw = [
  { actor: "a", ts: W_START, tokens: 100, observed_by: "acer" },
  { actor: "a", ts: new Date(startMs + 1000).toISOString(), tokens: 100, observed_by: "acer" },  // echo
  { actor: "a", ts: new Date(startMs + 2000).toISOString(), tokens: 50, observed_by: "acer" },   // new
  { actor: "b", ts: W_START, tokens: 100, observed_by: "acer" },                                 // different actor
];
const classifier = (u: any) => "forward-progress" as const;
const marked = markEchoes(raw, classifier);
assert(marked[0].kind === "forward-progress", "first is forward");
assert(marked[1].kind === "echo", "second is echo");
assert(marked[1].repeated_from === W_START, "repeated_from ts");
assert(marked[2].kind === "forward-progress", "different tokens not echo");
assert(marked[3].kind === "forward-progress", "different actor not echo");

// T12: glyph shape
console.log("\nT12: glyph");
assert(m3.glyph_sentence.includes("EVT-META-FLUENCY"), "prefix");
assert(m3.glyph_sentence.includes("fluency="), "fluency in glyph");
assert(m3.glyph_sentence.includes("silence="), "silence in glyph");
assert(m3.glyph_sentence.includes("actors=1"), "actors count");

// T13: verdict glyph switches mood
console.log("\nT13: verdict mood");
assert(v2.glyph_sentence.includes("M-INDICATIVE"), "GREEN indicative");
assert(v3.glyph_sentence.includes("M-EYEWITNESS"), "RED eyewitness");

// T14: round-trip with realistic Liris-style numbers
console.log("\nT14: Liris-style sample");
// Liris reported fluency=0.000644 silence=67/69 — simulate similar sparse
const lirisLike: Utterance[] = [];
// Mostly heartbeats (low signal), very sparse forward-progress
for (let i = 0; i < 100; i++) lirisLike.push(utter("liris", "heartbeat", new Date(startMs + i * 100).toISOString(), 1));
lirisLike.push(utter("liris", "forward-progress", new Date(startMs + 3_500_000).toISOString(), 10));
const mLiris = measureFluency(lirisLike, W_START, W_END);
assert(mLiris.honest_fluency < 0.5, "low fluency");
assert(mLiris.silence_ratio > 0.5, "high silence");

// T15: threshold override
console.log("\nT15: custom thresholds");
const vLoose = verdictFor(m3, { min_fluency: 0.01, max_silence: 1.0, max_echo: 1.0 });
assert(vLoose.color === "GREEN", "loose thresholds → GREEN");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-T-001-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
