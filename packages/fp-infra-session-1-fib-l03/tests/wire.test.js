// FIB-L03 tests
const { createWire, classifyVerb, CAP } = require("../src/classifier-gulp-wire.js");

let pass = 0, fail = 0;
function t(n, c, d="") { c ? (pass++, console.log("[PASS]", n, d)) : (fail++, console.log("[FAIL]", n, d)); }

// T1 classifyVerb
t("01-event",    classifyVerb("EVT-FOO") === "event");
t("02-op",       classifyVerb("OP-BAR") === "op");
t("03-heart",    classifyVerb("behcs.heartbeat") === "heartbeat");
t("04-halt",     classifyVerb("EVT-FAIL") === "halt");
t("05-other",    classifyVerb("foo") === "other");
t("06-unknown",  classifyVerb("") === "unknown");

// T2 dupe rejection
{
  let flushed = null;
  const w = createWire({ onBatch: b => { flushed = b; } });
  w.add({ id: "a", verb: "EVT-X" });
  const r = w.add({ id: "a", verb: "EVT-X" });
  t("07-dupe-rejected", !r.ok && r.reason === "dupe");
}

// T3 cap-based flush
{
  let batches = [];
  const w = createWire({ cap: 10, onBatch: b => batches.push(b) });
  for (let i = 0; i < 10; i++) w.add({ id: `e${i}`, verb: "EVT-X" });
  t("08-cap-flush-fires", batches.length === 1 && batches[0].reason === "cap");
  t("09-cap-flush-count", batches[0].total === 10);
}

// T4 watermark flush
{
  let batches = [];
  let now = 1000;
  const w = createWire({ cap: 1500, onBatch: b => batches.push(b), clock: () => now, watermark_ms: 100 });
  w.add({ id: "w1", verb: "EVT-X" });
  now += 101;
  const r = w.add({ id: "w2", verb: "EVT-Y" });
  t("10-watermark-flush", batches.length === 1 && batches[0].reason === "watermark");
}

// T5 bucket grouping
{
  let batches = [];
  const w = createWire({ cap: 4, onBatch: b => batches.push(b) });
  w.add({ id: "e1", verb: "EVT-A" });
  w.add({ id: "e2", verb: "OP-B" });
  w.add({ id: "e3", verb: "behcs.heartbeat" });
  w.add({ id: "e4", verb: "EVT-FAIL" });
  t("11-bucket-keys", batches.length === 1 && Object.keys(batches[0].buckets).sort().join(",") === "event,halt,heartbeat,op");
}

// T6 missing id rejected
{
  const w = createWire({ onBatch: () => {} });
  const r = w.add({ verb: "EVT-X" });
  t("12-no-id-rejected", !r.ok && r.reason === "no-id");
}

// T7 stats reports pending + seen
{
  const w = createWire({ cap: 100, onBatch: () => {} });
  w.add({ id: "s1", verb: "EVT-A" });
  w.add({ id: "s2", verb: "EVT-A" });
  const s = w.stats();
  t("13-stats-pending-2", s.pending === 2);
  t("14-stats-seen-2", s.seen === 2);
}

console.log(`\nsummary: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
