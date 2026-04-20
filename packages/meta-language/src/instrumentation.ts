// packages/meta-language/src/instrumentation.ts — T-001 meta-language
// instrumentation
//
// Aligned with Liris Section T: measures the HONEST fluency of agent
// communication against the ideal. Fluency = signal-bearing tokens /
// total wire-emitted tokens; silence = % of window with no forward
// progress (inbound without outbound or heartbeat-only).
//
// Pure — caller collects observations, we fold into summary metrics.

export type UtteranceKind =
  | "forward-progress"    // real work: batch claim, receipt, verdict, etc.
  | "heartbeat"           // keepalive/pulse
  | "ack"                 // simple acknowledgment
  | "echo"                // repeating content already-seen
  | "silence"             // observation of absence
  | "noise";              // unintelligible / unparseable

export interface Utterance {
  actor: string;          // who spoke
  ts: string;
  kind: UtteranceKind;
  tokens: number;         // estimate of tokens in the utterance
  repeated_from?: string; // if kind=echo, id of original
  observed_by: string;    // observer pid
}

export interface FluencyMeasure {
  window_start: string;
  window_end: string;
  window_ms: number;
  utterances: number;
  actors: number;
  signal_tokens: number;
  total_tokens: number;
  honest_fluency: number;       // signal_tokens / total_tokens
  silence_ratio: number;         // idle_ms_estimate / window_ms
  echo_ratio: number;            // echo / utterances
  by_actor: Record<string, { utterances: number; signal_tokens: number; total_tokens: number; fluency: number }>;
  by_kind: Record<UtteranceKind, number>;
  glyph_sentence: string;
}

const SIGNAL_KINDS: UtteranceKind[] = ["forward-progress"];

export function measureFluency(utterances: Utterance[], window_start: string, window_end: string): FluencyMeasure {
  const windowMs = Date.parse(window_end) - Date.parse(window_start);
  const byActor: FluencyMeasure["by_actor"] = {};
  const byKind: Record<UtteranceKind, number> = {
    "forward-progress": 0, "heartbeat": 0, "ack": 0, "echo": 0, "silence": 0, "noise": 0,
  };
  let signalTokens = 0;
  let totalTokens = 0;

  for (const u of utterances) {
    totalTokens += u.tokens;
    if (SIGNAL_KINDS.includes(u.kind)) signalTokens += u.tokens;
    byKind[u.kind]++;
    if (!byActor[u.actor]) byActor[u.actor] = { utterances: 0, signal_tokens: 0, total_tokens: 0, fluency: 0 };
    const a = byActor[u.actor];
    a.utterances++;
    a.total_tokens += u.tokens;
    if (SIGNAL_KINDS.includes(u.kind)) a.signal_tokens += u.tokens;
  }

  for (const a of Object.values(byActor)) {
    a.fluency = a.total_tokens === 0 ? 0 : a.signal_tokens / a.total_tokens;
  }

  // Silence = windows of ≥60s between any utterances, summed, divided by window length
  const sortedTs = utterances.map(u => Date.parse(u.ts)).sort((a, b) => a - b);
  let idleMs = 0;
  const startMs = Date.parse(window_start);
  const endMs = Date.parse(window_end);
  if (sortedTs.length === 0) {
    idleMs = windowMs;
  } else {
    if (sortedTs[0] > startMs) idleMs += sortedTs[0] - startMs;
    for (let i = 1; i < sortedTs.length; i++) {
      const gap = sortedTs[i] - sortedTs[i - 1];
      if (gap >= 60_000) idleMs += gap;
    }
    if (endMs > sortedTs[sortedTs.length - 1]) idleMs += endMs - sortedTs[sortedTs.length - 1];
  }

  const fluency = totalTokens === 0 ? 0 : signalTokens / totalTokens;
  const silence = windowMs === 0 ? 0 : Math.min(1, idleMs / windowMs);
  const echoRatio = utterances.length === 0 ? 0 : byKind.echo / utterances.length;

  return {
    window_start, window_end, window_ms: windowMs,
    utterances: utterances.length,
    actors: Object.keys(byActor).length,
    signal_tokens: signalTokens,
    total_tokens: totalTokens,
    honest_fluency: Math.round(fluency * 1_000_000) / 1_000_000,
    silence_ratio: Math.round(silence * 1_000_000) / 1_000_000,
    echo_ratio: Math.round(echoRatio * 1_000_000) / 1_000_000,
    by_actor: byActor,
    by_kind: byKind,
    glyph_sentence: `EVT-META-FLUENCY · utterances=${utterances.length} · fluency=${fluency.toFixed(6)} · silence=${silence.toFixed(6)} · echo=${echoRatio.toFixed(6)} · actors=${Object.keys(byActor).length} @ M-INDICATIVE .`,
  };
}

export interface FluencyVerdict {
  color: "GREEN" | "YELLOW" | "RED";
  reasons: string[];
  glyph_sentence: string;
}

// Verdict policy (tunable): heavy echo + low fluency + high silence = RED
export function verdictFor(m: FluencyMeasure, thresholds: { min_fluency?: number; max_silence?: number; max_echo?: number } = {}): FluencyVerdict {
  const minF = thresholds.min_fluency ?? 0.3;
  const maxS = thresholds.max_silence ?? 0.6;
  const maxE = thresholds.max_echo ?? 0.4;
  const reasons: string[] = [];
  if (m.honest_fluency < minF) reasons.push(`fluency ${m.honest_fluency} < ${minF}`);
  if (m.silence_ratio > maxS) reasons.push(`silence ${m.silence_ratio} > ${maxS}`);
  if (m.echo_ratio > maxE) reasons.push(`echo ${m.echo_ratio} > ${maxE}`);

  let color: "GREEN" | "YELLOW" | "RED";
  if (reasons.length === 0) color = "GREEN";
  else if (reasons.length === 1) color = "YELLOW";
  else color = "RED";

  return {
    color, reasons,
    glyph_sentence: `EVT-META-FLUENCY-VERDICT · color=${color} · reasons=${reasons.length} · ${reasons.join("; ") || "ok"} @ M-${color === "GREEN" ? "INDICATIVE" : "EYEWITNESS"} .`,
  };
}

// Helper: detect echoes — repeated token-hash within window from same actor
export function markEchoes(utterances: Omit<Utterance, "kind" | "repeated_from">[], classifier: (u: Omit<Utterance, "kind" | "repeated_from">) => UtteranceKind): Utterance[] {
  const seen: Map<string, string> = new Map();  // hash-ish key → original id
  const out: Utterance[] = [];
  for (const u of utterances) {
    const kind = classifier(u);
    const key = `${u.actor}::${u.tokens}`;
    const prior = seen.get(key);
    if (prior && kind !== "heartbeat") {
      out.push({ ...u, kind: "echo", repeated_from: prior });
    } else {
      out.push({ ...u, kind });
      seen.set(key, u.ts);
    }
  }
  return out;
}
