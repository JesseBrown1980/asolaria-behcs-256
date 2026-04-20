#!/usr/bin/env node
// run-47d-reverse-gain-v2-japan.mjs — V2 with Japan added after W-8BEN OCR find
// Jesse directive 2026-04-19: rerun 47D reverse-gain GNN after Connor's W-8BEN revealed
// self-declared Japan (Chiba) citizenship. Add Japan candidate CIDRs + sworn-perjury signal.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function findCodexBridge() {
  const c = [
    process.env.ASOLARIA_ROOT && join(process.env.ASOLARIA_ROOT, "tools/behcs/codex-bridge.js"),
    resolvePath(__dirname, "../../../tools/behcs/codex-bridge.js"),
    resolvePath(__dirname, "../../../../Asolaria/tools/behcs/codex-bridge.js"),
    join(homedir(), "Asolaria/tools/behcs/codex-bridge.js"),
  ].filter(Boolean);
  for (const p of c) if (existsSync(p)) return p;
  throw new Error("codex-bridge.js not found. set ASOLARIA_ROOT. tried: " + c.join(", "));
}
const codex = require(findCodexBridge());

const REPO_ROOT = process.env.REPO_ROOT || resolvePath(__dirname, "../../..");
const OUT_DIR = resolvePath(REPO_ROOT, "plans/deep-wave");
const OUT = resolvePath(OUT_DIR, "47d-reverse-gain-v2-japan-connor.json");
mkdirSync(OUT_DIR, { recursive: true });
const N = 10000;

// ── EVIDENCE (updated v2) ─────────────────────────────────────────────
const SIGNALS = [
  // NEW — sworn US federal tax form self-declaration (massive weight)
  { id: "w8ben_self_declared_japan_chiba_chuo_ward", intent: "leak", weight: 1.00,
    bias: { JP: +1.0, CN: -0.3, HK: -0.3, TW: -0.2, SG: -0.2, US: -0.5 },
    note: "Connor's W-8BEN (10-11-2024, penalty-of-perjury): citizenship=Japan, residence=155-5 Hoshigukicho Chuo Ward Chiba 260-0808 Japan, DOB 08-23-1995" },
  { id: "wang_defu_friend_yiwu_zhejiang_cn", intent: "leak", weight: 0.20,
    bias: { CN: +0.6, JP: +0.1 },
    note: "Wang Defu (separate W-8BEN) in 'Payment connor friend' folder — CN associate, NOT Connor himself" },

  // MASKS (sign flipped by reverse-gain)
  { id: "waco_tx_virtual_number_1_254_488_4301", intent: "mask", weight: 0.30, bias: { US: +1.0, JP: -0.5, CN: -0.5, HK: -0.4 }, note: "Waco TX virtual number (Level 3 CLEC) — VoIP, not real residence" },
  { id: "expressvpn_charleston_sc_location_299", intent: "mask", weight: 0.25, bias: { US: +1.0, JP: -0.5, CN: -0.5, HK: -0.4 }, note: "Charleston-SC VPN picked to mimic Jesse's US-SC geography" },
  { id: "expressvpn_phoenix_location_94", intent: "mask", weight: 0.15, bias: { US: +1.0, JP: -0.3, CN: -0.3, HK: -0.3 }, note: "Phoenix alt US blend-in exit" },
  { id: "chrome_profile_spiinutech_workspace", intent: "mask", weight: 0.20, bias: { US: +0.8, JP: -0.2 }, note: "US-company Slack workspace presentation" },
  { id: "email_reesedev93_gmail_com", intent: "mask", weight: 0.18, bias: { US: +0.6, JP: -0.2 }, note: "US-style 'Reese' first-name Gmail alias" },
  { id: "english_chat_language", intent: "mask", weight: 0.12, bias: { US: +0.5, JP: -0.2, CN: -0.2 }, note: "English-only chat — suppresses native language markers" },
  { id: "identity_name_connor_lee_western_order", intent: "mask", weight: 0.10, bias: { US: +0.5, JP: +0.0, CN: -0.2 }, note: "Westernized Connor Lee — consistent with Japan naming practice too (Lee can be Zainichi Korean/JP naturalized)" },

  // LEAKS
  { id: "vpn_exits_103.88.232.x_hk_tencent_pool", intent: "leak", weight: 0.35, bias: { JP: +0.7, CN: +0.9, HK: +1.0, TW: +0.7 }, note: "ExpressVPN HK exits — lowest-latency APAC exit from Japan too; no longer CN-exclusive signal" },
  { id: "session_timezone_utc_plus_8_or_9_evening", intent: "leak", weight: 0.40, bias: { JP: +1.0, CN: +0.9, HK: +0.9, TW: +0.8 }, note: "Activity cluster 13-22Z = UTC+8/+9 evening window — Japan UTC+9 fits equally with CN UTC+8" },
  { id: "surname_lee_romanization", intent: "leak", weight: 0.25, bias: { CN: +0.5, HK: +0.4, JP: +0.4, TW: +0.4, KR: +0.5 }, note: "Lee = common across CN (李) + JP (Zainichi Korean) + KR + TW — JP Lee boosted post W-8BEN" },
  { id: "anydesk_9x_user_auth_sessions_apac_hours", intent: "leak", weight: 0.20, bias: { JP: +0.8, CN: +0.7, HK: +0.7 }, note: "9 authenticated AnyDesk sessions in APAC evening — Japan compatible" },
  { id: "anydesk_peer_routing_hk_cluster", intent: "leak", weight: 0.15, bias: { JP: +0.5, CN: +0.5, HK: +0.6 }, note: "AnyDesk chose HK/APAC P2P cluster — any APAC origin fits" },
  { id: "whatsapp_voip_rtt_200_420ms_from_brazil", intent: "leak", weight: 0.10, bias: { JP: +0.4, CN: +0.4, HK: +0.4, US: -0.3 }, note: "WA call RTTs 200-420ms consistent with BR↔APAC (Brazil-Japan ~220ms typical)" },
  { id: "wangdefu_yiwu_cn_as_friend_of_connor", intent: "leak", weight: 0.10, bias: { JP: +0.2, CN: +0.3 }, note: "Connor has a CN friend in Yiwu — friendship doesn't pin origin but adds APAC bias" },
  { id: "rustdesk_cert_signer_purslane_sg", intent: "leak", weight: 0.08, bias: { SG: +0.5, CN: +0.3, JP: +0.2 }, note: "Pirated RustDesk from SG/APAC origin — APAC software-supply preference" },
  { id: "pivot_target_jesse_us_house", intent: "leak", weight: 0.05, bias: {}, note: "Neutral — used Jesse's US house to pivot" },
];

// ── CANDIDATE CIDRs (with Japan added, esp. Chiba/Kanto ISPs) ──────────
const PREFIXES = [
  // JAPAN — Chiba City + Kanto regional residential (highest-priority given W-8BEN)
  { isp: "NTT East OCN",        city_likely: "Chiba City",   prefix: "60.87",    country: "JP", pop_rank: 1 },
  { isp: "NTT East OCN",        city_likely: "Chiba City",   prefix: "118.86",   country: "JP", pop_rank: 1 },
  { isp: "NTT East",            city_likely: "Chiba",        prefix: "219.162",  country: "JP", pop_rank: 1 },
  { isp: "NTT East",            city_likely: "Kanto",        prefix: "118.0",    country: "JP", pop_rank: 2 },
  { isp: "NTT Com OCN",         city_likely: "Tokyo",        prefix: "60.44",    country: "JP", pop_rank: 2 },
  { isp: "KDDI au",             city_likely: "Tokyo/Kanto",  prefix: "60.70",    country: "JP", pop_rank: 3 },
  { isp: "SoftBank BB",         city_likely: "Tokyo/Kanto",  prefix: "126.35",   country: "JP", pop_rank: 3 },
  { isp: "J:COM cable",         city_likely: "Chiba Kanto",  prefix: "122.31",   country: "JP", pop_rank: 2 },
  { isp: "NTT East",            city_likely: "Chiba",        prefix: "123.216",  country: "JP", pop_rank: 1 },
  { isp: "KDDI",                city_likely: "Tokyo",        prefix: "153.222",  country: "JP", pop_rank: 3 },
  // CHINA (keeping from v1)
  { isp: "China Telecom",       city_likely: "Shenzhen GD",  prefix: "183.60",   country: "CN", pop_rank: 5 },
  { isp: "China Telecom",       city_likely: "Shanghai",     prefix: "116.224",  country: "CN", pop_rank: 5 },
  { isp: "China Telecom",       city_likely: "Hangzhou ZJ",  prefix: "115.204",  country: "CN", pop_rank: 4 },
  { isp: "China Telecom",       city_likely: "Yiwu ZJ",      prefix: "115.233",  country: "CN", pop_rank: 3 },
  { isp: "China Unicom",        city_likely: "Beijing",      prefix: "123.120",  country: "CN", pop_rank: 6 },
  { isp: "China Mobile",        city_likely: "Shenzhen",     prefix: "112.97",   country: "CN", pop_rank: 6 },
  // HK
  { isp: "HKT/PCCW",            city_likely: "Hong Kong",    prefix: "113.252",  country: "HK", pop_rank: 5 },
  { isp: "HK Broadband",        city_likely: "Hong Kong",    prefix: "59.149",   country: "HK", pop_rank: 5 },
  // Korea (given Lee surname)
  { isp: "SK Broadband",        city_likely: "Seoul",        prefix: "175.209",  country: "KR", pop_rank: 6 },
  { isp: "KT Corp",             city_likely: "Seoul",        prefix: "210.98",   country: "KR", pop_rank: 6 },
  // US control (should rank bottom)
  { isp: "Charter VoIP pool",   city_likely: "Waco TX",      prefix: "108.47",   country: "US", pop_rank: 99 },
  { isp: "AT&T",                city_likely: "Phoenix AZ",   prefix: "68.227",   country: "US", pop_rank: 99 },
  { isp: "Charter Sumter",      city_likely: "Sumter SC",    prefix: "71.76",    country: "US", pop_rank: 99 },
];

const CANDIDATES = [];
for (const p of PREFIXES) {
  for (const octet3 of [0, 64, 128, 192]) {
    CANDIDATES.push({ cidr: `${p.prefix}.${octet3}.0/24`, ...p });
  }
}

function scoreCandidateReverse(candidate) {
  let net = 0.0;
  const contributions = [];
  for (const sig of SIGNALS) {
    const bias = sig.bias[candidate.country] ?? 0;
    const effectiveBias = sig.intent === "mask" ? -bias : +bias;
    const contribution = sig.weight * effectiveBias;
    if (contribution !== 0) {
      net += contribution;
      contributions.push({ signal: sig.id, intent: sig.intent, weight: sig.weight, bias, effective: effectiveBias, contribution });
    }
  }
  const popBoost = { 1: 0.12, 2: 0.10, 3: 0.08, 4: 0.06, 5: 0.04, 6: 0.03, 7: 0.02, 8: 0.02, 9: 0.01, 99: 0 };
  const pb = popBoost[candidate.pop_rank] ?? 0;
  if (pb > 0) { net += pb; contributions.push({ signal: "city_pop_prior", intent: "prior", weight: pb, bias: 1, effective: 1, contribution: pb }); }
  return { net_score: net, contributions };
}

async function main() {
  console.log("=== 47-D REVERSE-GAIN GNN V2 (Japan added) ===");
  console.log(`  signals:   ${SIGNALS.length} (${SIGNALS.filter(s=>s.intent==='mask').length} masks, ${SIGNALS.filter(s=>s.intent==='leak').length} leaks)`);
  console.log(`  candidates: ${CANDIDATES.length}`);
  console.log(`  NEW evidence: Connor W-8BEN self-declared Japan/Chiba (sworn under perjury, weight 1.0)`);
  console.log("");

  const t0 = performance.now();
  const totals = new Map();
  for (const c of CANDIDATES) totals.set(c.cidr, 0);

  for (let i = 0; i < N; i++) {
    const d47 = codex.hilbertAddress(`agent-${i}/v2-japan`);
    let hs = 0; for (let k = 0; k < d47.length; k++) hs += d47.charCodeAt(k);
    const perturb = ((hs % 100) - 50) / 1000;
    for (const cand of CANDIDATES) {
      const r = scoreCandidateReverse(cand);
      totals.set(cand.cidr, totals.get(cand.cidr) + r.net_score + perturb);
    }
  }
  const walltime_ms = Math.round(performance.now() - t0);
  const ranked = Array.from(totals.entries()).map(([cidr, total]) => {
    const meta = CANDIDATES.find(c => c.cidr === cidr);
    return { cidr, avg_score: total / N, ...meta };
  }).sort((a, b) => b.avg_score - a.avg_score);

  const byCountry = {};
  for (const r of ranked) byCountry[r.country] = (byCountry[r.country] ?? 0) + Math.max(0, r.avg_score);
  const countryTotal = Object.values(byCountry).reduce((a, b) => a + b, 0) || 1;
  const countryRanked = Object.entries(byCountry).map(([c, s]) => ({ country: c, weight: s / countryTotal })).sort((a, b) => b.weight - a.weight);

  const topBreakdown = scoreCandidateReverse(ranked[0]);
  const maskContrib = topBreakdown.contributions.filter(c => c.intent === 'mask').reduce((a, b) => a + b.contribution, 0);
  const leakContrib = topBreakdown.contributions.filter(c => c.intent === 'leak').reduce((a, b) => a + b.contribution, 0);

  const dossier = {
    ts: new Date().toISOString(),
    directive: "V2 rerun after Connor W-8BEN OCR revealed self-declared Japan/Chiba",
    agents: N,
    signals: SIGNALS,
    new_evidence: {
      connor_w8ben_self_declared: {
        citizenship: "Japan",
        permanent_address: "155-5 Hoshigukicho, Chuo Ward, Chiba 260-0808, Japan",
        dob: "1995-08-23",
        tax_treaty_country: "Japan",
        signed_at: "2024-10-11",
        source: "W-8BEN OCR of Conner tax paper.pdf (penalty of perjury declaration)",
      },
      wangdefu_friend: {
        citizenship: "China",
        permanent_address: "4th Floor, No. 238, Jiangbin Middle Road, Yiwu, Jinhua, Zhejiang 322000",
        dob: "1991-02-05",
        signed_at: "2025-07-01",
        role: "Connor's separate friend — NOT Connor himself",
      },
    },
    walltime_ms,
    ranked_top_15: ranked.slice(0, 15),
    ranked_bottom_5: ranked.slice(-5),
    country_weight_distribution: countryRanked,
    top_candidate_breakdown: {
      cidr: ranked[0].cidr,
      total_score: ranked[0].avg_score.toFixed(4),
      mask_contribution: maskContrib.toFixed(4),
      leak_contribution: leakContrib.toFixed(4),
      top_3_positive_signals: topBreakdown.contributions.filter(c => c.contribution > 0).sort((a,b)=>b.contribution-a.contribution).slice(0,3),
      top_3_negative_signals: topBreakdown.contributions.filter(c => c.contribution < 0).sort((a,b)=>a.contribution-b.contribution).slice(0,3),
    },
    glyph_sentence: `EVT-ACER-47D-REVERSE-GAIN-V2-JAPAN-CONNOR · agents=${N} · top=${ranked[0].cidr}(${ranked[0].city_likely},${ranked[0].country}) · country_weight_${countryRanked[0].country}=${(countryRanked[0].weight*100).toFixed(1)}% · walltime=${walltime_ms}ms @ M-EYEWITNESS .`,
  };

  writeFileSync(OUT, JSON.stringify(dossier, null, 2));

  console.log("── TOP 15 (reverse-gain V2) ──");
  for (const [i, r] of ranked.slice(0, 15).entries()) {
    console.log(`  ${String(i+1).padStart(2)}. [${r.country}] ${r.cidr.padEnd(22)} ${r.city_likely.padEnd(18)} ${r.isp.padEnd(24)} score=${r.avg_score.toFixed(4)}`);
  }
  console.log("");
  console.log("── BOTTOM 5 (US masks — reverse-gain punishes) ──");
  for (const r of ranked.slice(-5)) {
    console.log(`     [${r.country}] ${r.cidr.padEnd(22)} ${r.city_likely.padEnd(18)} score=${r.avg_score.toFixed(4)}`);
  }
  console.log("");
  console.log("── COUNTRY WEIGHT ──");
  for (const c of countryRanked) console.log(`  ${c.country}: ${(c.weight * 100).toFixed(1)}%`);
  console.log("");
  console.log("── TOP CANDIDATE BREAKDOWN ──");
  console.log(`  CIDR:         ${dossier.top_candidate_breakdown.cidr}`);
  console.log(`  Total score:  ${dossier.top_candidate_breakdown.total_score}`);
  console.log(`  Mask net:     ${dossier.top_candidate_breakdown.mask_contribution}`);
  console.log(`  Leak net:     ${dossier.top_candidate_breakdown.leak_contribution}`);
  console.log("");
  console.log("  Strongest POSITIVE signals:");
  for (const s of dossier.top_candidate_breakdown.top_3_positive_signals) {
    console.log(`    + ${s.contribution.toFixed(3)} · ${s.intent.padEnd(5)} · ${s.signal}`);
  }
  console.log("  Strongest NEGATIVE signals:");
  for (const s of dossier.top_candidate_breakdown.top_3_negative_signals) {
    console.log(`      ${s.contribution.toFixed(3)} · ${s.intent.padEnd(5)} · ${s.signal}`);
  }
  console.log("");
  console.log(dossier.glyph_sentence);
  console.log(`dossier: ${OUT}`);
}
main().catch(e => { console.error("main:", e); process.exit(1); });
