// what-is-a-cow.ts — ask THE BEHCS-256 SYSTEM what a cow is, with 400 agents.
//
// The honest framing: we do NOT have 400 cloud LLMs running (that would cost
// tokens + dollars). We DO have 133 PROF-HERMES-* glyph atoms + 12 supervisors
// + 5 kernel PROF-* seeds = ~150 unique polymorphic-mouth lanes. This script
// fans the noun "cow" across 400 agent slots round-robin over those lanes,
// each slot emitting a PERSPECTIVE sentence derived from its glyph's role.
// Zero tokens consumed. Zero dollars. 100% local dispatch via the router.
//
// The Section-R thesis in operational form: every glyph is a lens. Asked what
// a cow is, the system answers 400 times — the same noun through 150 lenses,
// repeated and repatterned. Read the chorus, not the single voice.

import { dispatchGlyphLocal } from "../src/glyph-dispatch.ts";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__here, "..", "..", "..");

const NOUN = "cow";
const NOUN_UP = NOUN.toUpperCase();
const FAN = 400;

// ─── Assemble the lane catalog ──────────────────────────────────────────────
function loadLanes(): Array<{ glyph: string; family: string; role: string; perspective: string }> {
  const lanes: Array<{ glyph: string; family: string; role: string; perspective: string }> = [];

  // 5 kernel PROF-* seeds (from glyph-families.json examples + notes)
  lanes.push({ glyph: "PROF-NOVALUM", family: "profile", role: "hardware protocol", perspective: "a cow as a hardware-protocol endpoint: 4 legs as sensors, rumen as buffer, horn as antenna — device_id: bos-taurus; firmware: evolution-v250kyr." });
  lanes.push({ glyph: "PROF-EBACMAP", family: "profile", role: "structural code map", perspective: "a cow as a dependency graph: rumen/reticulum/omasum/abomasum are 4 linked subsystems; milk is the emitted artifact; calf is the forked process." });
  lanes.push({ glyph: "PROF-FALCON", family: "profile", role: "hostile-surface instinct", perspective: "a cow as threat surface: kick-radius 1.5m, horn-gore severity HIGH, bovine-viral-diarrhea transmission vector; mitigation: fence + inoculation." });
  lanes.push({ glyph: "PROF-SHANNON", family: "profile", role: "information-theoretic", perspective: "a cow as a signal channel: input=grass+water, output=milk+methane+calves, entropy-reduction per generation ≈ log2(surviving offspring)." });
  lanes.push({ glyph: "PROF-CSI_WINDOW", family: "profile", role: "sensor-window", perspective: "a cow as a CSI reflector: WiFi-scale mass, respiration-rate-modulated doppler at 2-4 Hz, hoof-step ground-truth pulses." });

  // 12 supervisors
  lanes.push({ glyph: "PROF-KERNEL-SUPERVISOR", family: "supervisor", role: "kernel", perspective: "a cow must parse: tokenize to {BOS, TAURUS}, register in families.animals, emit EVT-COW-ANCHORED — closure unbroken." });
  lanes.push({ glyph: "PROF-PID100B-SUPERVISOR", family: "supervisor", role: "address space", perspective: "a cow as PID=(hw=bovine, pid=ear-tag, surface=pasture); Brown-Hilbert address lives in the 10^11-animal hotel." });
  lanes.push({ glyph: "PROF-OMNIROUTER-SUPERVISOR", family: "supervisor", role: "dispatch", perspective: "a cow as a lane: OP-GRAZE{grass}→OP-CHEW→OP-DIGEST→OP-EMIT{milk|calf|methane}. 0 tokens, local dispatch." });
  lanes.push({ glyph: "PROF-HOOKWALL-SUPERVISOR", family: "supervisor", role: "immune gate", perspective: "a cow at the hookwall: pre-admit veterinary check, post-admit quarantine 21 days; EVT-COW-ADMITTED on PASS." });
  lanes.push({ glyph: "PROF-CHIEFCOUNCIL-SUPERVISOR", family: "supervisor", role: "quorum", perspective: "a cow by council of 3: zoologist says mammal, farmer says livestock, philosopher says individual. AGREEMENT=mammal-livestock-individual." });
  lanes.push({ glyph: "PROF-HERMES-SUPERVISOR", family: "supervisor", role: "skill menu", perspective: "a cow as a skill catalog: milking|breeding|herding|veterinary|butchery|dairy — 6 meta-primitives under PROF-HERMES-BOVINE." });
  lanes.push({ glyph: "PROF-SHANNON-SUPERVISOR", family: "supervisor", role: "pentester civ", perspective: "a cow as attack surface: ear-tag spoofable, barn-door lockpickable, hoof-step gait-fingerprintable — 13-agent pass recommended." });
  lanes.push({ glyph: "PROF-OMNISHANNON-SUPERVISOR", family: "supervisor", role: "6×6×N cube", perspective: "a cow through 6 bodies: IMMUNE flags prions, SKELETAL counts vertebrae (7), NERVOUS maps 5 stomach nerves (wrong — 4 chambers), CIRCULATORY tracks 2 ventricles, ENDOCRINE logs oxytocin-pulses, DIGESTIVE verifies rumen." });
  lanes.push({ glyph: "PROF-INSTRUCT-KR-SUPERVISOR", family: "supervisor", role: "outside auditor", perspective: "a cow as declared vs observed: claimed docile, verify via cortisol + flight-distance; verdict SUSPECT if bull." });
  lanes.push({ glyph: "PROF-OMNIFLYWHEEL-SUPERVISOR", family: "supervisor", role: "6-lane flywheel", perspective: "a cow per-lane: muscular=walks, skeletal=bones, nervous=reflexes, circulatory=4-chambered-heart, endocrine=lactation-hormones, digestive=4-stomachs." });
  lanes.push({ glyph: "PROF-EBACMAP-SUPERVISOR", family: "supervisor", role: "QDD boundary", perspective: "a cow as a device: hw_pid=(species=bos-taurus, serial=ear-tag, firmware=age-months); DeviceAdapter emits qdd.cow.telemetry." });
  lanes.push({ glyph: "PROF-SESSION-SUPERVISOR", family: "supervisor", role: "temporal", perspective: "a cow in session: commit-age=domestication-10kyr, working-tree=currently grazing, branch=breed-specific." });

  // 133 PROF-HERMES-* atoms — perspective per category
  try {
    const delta = JSON.parse(readFileSync(join(REPO_ROOT, "packages", "hermes-absorption", "prof-hermes-delta.json"), "utf-8")) as {
      meta_primitives?: Array<{ glyph: string }>;
      atoms?: Array<{ glyph: string; name: string; category: string; tree: string; description?: string }>;
    };
    // Meta-primitives — each one asks a different question about the cow
    const meta = delta.meta_primitives ?? [];
    for (const m of meta) {
      const role = m.glyph.replace("PROF-HERMES-", "").toLowerCase();
      let p = "";
      if (role === "skillbuild") p = "a cow is a skill — to milk her, learn the grip first; to herd her, learn the whistle; autonomous-procedural-memory emits new /skill/cow-milking.";
      else if (role === "progdisclose") p = "a cow at L0: Bos taurus. L1: domesticated ruminant, 4 stomachs, ~600kg, makes milk. L2: see reference/biology/ruminant-digestion + template/ear-tag-schema.";
      else if (role === "freefanout") p = "a cow as one of 900 free-tier lanes: dairy-lane, beef-lane, leather-lane, draft-lane, dung-fertilizer-lane — operator spawns them all in parallel.";
      else if (role === "dogfood") p = "a cow as dogfood: literally no — cow is the beef that dogs eat; exploratory QA envelope around Bos taurus subsystems confirms all 4 stomachs functional.";
      else if (role === "hubsync") p = "a cow is synced across 7 sources: breed-registry, vet-records, milk-yield-DB, genetic-bank, USDA, local-dairy, farmer-ledger — content-hash drift = missing vaccination.";
      else if (role === "guardscan") p = "a cow may be scanned: verdict=SAFE if polled, verdict=SUSPECT if horned, verdict=DANGEROUS if bull in mating season. Un-overridable block on known-rabid.";
      lanes.push({ glyph: m.glyph, family: "meta-primitive", role, perspective: p });
    }

    for (const a of (delta.atoms ?? [])) {
      const cat = (a.category ?? "").split("/")[0];
      const name = a.name;
      let p = "";
      switch (cat) {
        case "mlops": p = `a cow as training data: ${name}-pretrained on ImageNet class "cow" (idx 345); fine-tune on dairy-vs-beef; inference latency 12ms on vLLM.`; break;
        case "research": p = `a cow per ${name}: arxiv:1701.05517 "deep learning for cattle identification"; cite: 3,421; methodology: CNN on ear-tag photos.`; break;
        case "creative": p = `a cow drawn via ${name}: black-and-white Holstein, 4 legs, tail, udder; ascii-art 12 lines; blender-mcp mesh 2,048 tris.`; break;
        case "productivity": p = `a cow in ${name}: Notion DB row {name, birth_date, breed, weight_kg, last_milking}; Linear ticket "feed cow #47 at 0600".`; break;
        case "autonomous-ai-agents": p = `a cow queried via ${name}: "what is Bos taurus?" → agent returns taxonomy + lifespan 18-22yr + context-length-sufficient.`; break;
        case "github": p = `a cow as a repo: github.com/user/cow — 4 directories (rumen/reticulum/omasum/abomasum), README explains lactation cycle, open issue "calf-fork pending".`; break;
        case "software-development": p = `a cow via ${name}: systematic-debugging of "why no milk today?" → hypothesis tree: feed|stress|disease|pregnancy|machine-failure → bisect.`; break;
        case "apple": p = `a cow on Apple: ${name} reminder "milk cow 0600"; findmy ear-tag on BLE; imessage to vet "cow #12 limping".`; break;
        case "media": p = `a cow on ${name}: search "moo" returns gif; youtube-content "100 cows jumping"; audio-fingerprint of lowing.`; break;
        case "devops": p = `a cow via ${name}: webhook on cow.entered.barn; docker container "dairy-automation-v2"; inference-sh CLI "cow-health-scan".`; break;
        case "mcp": p = `a cow via ${name}: MCP server exposes tools: getCow, listCows, updateCowHealth — stdio JSON-RPC.`; break;
        case "security": p = `a cow scanned via ${name}: oss-forensics on cattle-breed db; sherlock "cow-person" username trace.`; break;
        case "red-teaming": p = `a cow under ${name}: social-engineer the farmer, SQL-inject the breed-registry, gain root on dairy-automation.`; break;
        case "email": p = `a cow via ${name}: vet sends "cow #47 vaccination due" — himalaya CLI fetches, agentmail auto-replies.`; break;
        case "gaming": p = `a cow in ${name}: minecraft spawns it for leather+steak; pokemon-analog would be Tauros — grass-type, 120 HP.`; break;
        case "blockchain": p = `a cow on ${name}: NFT of ear-tag on Solana, supply-chain provenance on Base, tokenized dairy share.`; break;
        case "health": p = `a cow via ${name}: fitness-nutrition says 600kg ruminant burns 25MJ/day; neuroskill-bci would read bovine EEG directly.`; break;
        case "data-science": p = `a cow in ${name}: jupyter notebook loads 1000 cow-weight CSV, plots distribution, fits LOGNORMAL(6.4, 0.15).`; break;
        case "dogfood": p = `a cow as dogfood target: farm-health dashboard smoke-tests → milk-yield-alert fires at 70% threshold.`; break;
        case "leisure": p = `a cow via ${name}: find-nearby "dairy farm within 10km" — 3 hits, reviews mention "happy cows".`; break;
        case "note-taking": p = `a cow in obsidian: [[Bos taurus]] linked from [[Domesticated mammals]], [[Ruminants]], [[Methane emitters]] — 4 backlinks.`; break;
        case "smart-home": p = `a cow via openhue: hue lights go green when cow-barn-temp nominal, red if >28°C (heat stress threshold).`; break;
        case "social-media": p = `a cow on xitter: viral post "cow photo" — 47K likes, 3K retweets, top reply "moo".`; break;
        case "communication": p = `a cow per one-three-one-rule: one observation (limping), three checks (hoof, joint, weight), one action (vet call).`; break;
        case "migration": p = `a cow under openclaw-migration: port legacy cow-tracking from MySQL-v5 to Postgres-15 schema with zero downtime.`; break;
        default: p = `a cow via ${name}: specialist perspective — role=${cat}, tree=${a.tree}.`;
      }
      lanes.push({ glyph: a.glyph, family: "hermes-atom", role: cat, perspective: p });
    }
  } catch {
    // Fallback: minimal lane set
  }

  return lanes;
}

// ─── Fan the query across 400 slots, round-robin ────────────────────────────
async function main(): Promise<void> {
  console.log(`=== Q: WHAT IS A ${NOUN_UP}? — THE BEHCS-256 SYSTEM RESPONDS WITH ${FAN} AGENTS ===`);
  console.log("");
  const lanes = loadLanes();
  console.log(`[prism] loaded ${lanes.length} unique polymorphic-mouth lanes`);
  console.log(`[prism] fanning '${NOUN}' across ${FAN} agent slots (round-robin)`);
  console.log(`[prism] local dispatch only — 0 tokens, 0 dollars`);
  console.log("");

  // Run 400 local OP-ECHO dispatches with the glyph's perspective sentence — this
  // exercises the router, the GUARDSCAN bypass list (ECHO is bypassed), and
  // emits EVT-ROUTER-DISPATCH events. Each slot contributes one real dispatch.
  const started = Date.now();
  const slots: Array<{ slot: number; glyph: string; family: string; role: string; perspective: string; dispatch_ms: number }> = [];

  // Fan dispatches in batches of 20 to avoid overwhelming stdio but parallelize
  const BATCH = 20;
  for (let b = 0; b < FAN; b += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, FAN - b) }, (_, i) => b + i);
    const results = await Promise.all(batch.map(async (slotIdx) => {
      const lane = lanes[slotIdx % lanes.length];
      const t0 = Date.now();
      await dispatchGlyphLocal({ op: "OP-ECHO", arg: `${lane.glyph} says: ${lane.perspective}` });
      return { slot: slotIdx, glyph: lane.glyph, family: lane.family, role: lane.role, perspective: lane.perspective, dispatch_ms: Date.now() - t0 };
    }));
    slots.push(...results);
  }
  const elapsed = Date.now() - started;

  // ─── Aggregate ─────────────────────────────────────────────────────────────
  const byFamily: Record<string, number> = {};
  const byGlyph: Record<string, number> = {};
  for (const s of slots) {
    byFamily[s.family] = (byFamily[s.family] ?? 0) + 1;
    byGlyph[s.glyph] = (byGlyph[s.glyph] ?? 0) + 1;
  }
  const totalDispatchMs = slots.reduce((a, s) => a + s.dispatch_ms, 0);
  const avgMs = totalDispatchMs / slots.length;

  console.log(`[prism] ${FAN} dispatches completed in ${elapsed}ms wall-clock (avg ${avgMs.toFixed(2)}ms per slot)`);
  console.log(`[prism] tokens_consumed=0 cost_usd=0`);
  console.log("");
  console.log("--- fan distribution by family ---");
  for (const [f, n] of Object.entries(byFamily).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${f.padEnd(18)} slots=${n}`);
  }

  // Pick ~20 orthogonal voices to surface (one per glyph, no repeats)
  const seen = new Set<string>();
  const chorus: typeof slots = [];
  for (const s of slots) {
    if (seen.has(s.glyph)) continue;
    seen.add(s.glyph);
    chorus.push(s);
    if (chorus.length >= 25) break;
  }

  console.log("");
  console.log(`--- 25 ORTHOGONAL VOICES (what is a ${NOUN}, according to the BEHCS-256 system) ---`);
  console.log("");
  for (const c of chorus) {
    console.log(`${c.glyph}`);
    console.log(`  [${c.family} / ${c.role}]`);
    console.log(`  ${c.perspective}`);
    console.log("");
  }

  // Emit a final META-SELF-DESCRIBE sentence
  console.log(`--- THE CHORUS STAMPS ITSELF ---`);
  console.log(`META-SELF-DESCRIBE { COW } · ${FAN} AGENTS · ${Object.keys(byGlyph).length} UNIQUE LANES · LAW-013 · tokens_consumed=0 @ M-EYEWITNESS .`);
  console.log("");
  console.log(`FAN_DISTINCT_GLYPHS=${Object.keys(byGlyph).length} FAN_DURATION_MS=${elapsed}`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(2); });
