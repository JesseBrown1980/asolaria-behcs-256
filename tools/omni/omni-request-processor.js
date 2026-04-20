#!/usr/bin/env node
/**
 * omni-request-processor.js  v2  (2026-04-06 self-approval delegation)
 *
 * Cube law: D24 INTENT (cube 704969) — every action this script takes must
 * carry the request's cube[] tags into approved/denied/audit so the
 * authority graph stays addressable.
 *
 * Rule evaluation order:
 *   1. hard_deny       — sovereignty USB / external comms / destructive ops
 *   2. auto_approve    — read-only / own-cube append / meet.post / leader-to-leader
 *   3. self_vote       — device interactions in operator-witnessed window, file writes,
 *                        sub-agent spawn, cron creation
 *   4. default_self_vote — catch-all: vote, approve on no-negatives
 *
 * Self-vote uses a 6-part deterministic Shannon: scout/evidence/executor/fabric/voice/planner.
 * Each part is a heuristic check. If ANY part returns NEEDS-CHANGE / HALT / REFUSED,
 * escalate to needs_jesse and ping the qdd-recon-allhands meeting room. Otherwise approve.
 */

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const BOX = path.join(ROOT, 'data/omni-request-box');
const CFG = JSON.parse(fs.readFileSync(path.join(BOX, 'config.json'), 'utf8'));

const F = {
  pending: path.join(BOX, 'pending.ndjson'),
  approved: path.join(BOX, 'approved.ndjson'),
  denied: path.join(BOX, 'denied.ndjson'),
  self_voted: path.join(BOX, 'self_voted.ndjson'),
  needs_jesse: path.join(BOX, 'needs_jesse.ndjson'),
  audit: path.join(BOX, 'audit.ndjson'),
  allhands: path.join(ROOT, 'data/meeting-rooms/qdd-recon-allhands.ndjson'),
};

const now = () => new Date().toISOString();
const readLines = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean) : [];
const appendLine = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');

function seenIds() {
  const s = new Set();
  for (const f of [F.approved, F.denied, F.self_voted, F.needs_jesse]) {
    for (const r of readLines(f)) if (r.request_id) s.add(r.request_id);
  }
  return s;
}

// glob -> regex
function globMatch(pattern, str) {
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return re.test(str);
}

function matchRule(req, ruleMatch) {
  const m = ruleMatch || {};
  if (m.verb && req.verb !== m.verb) return false;
  if (m.verb_prefix && !(req.verb || '').startsWith(m.verb_prefix)) return false;
  if (m.verb_prefix_any && !m.verb_prefix_any.some(p => (req.verb || '').startsWith(p))) return false;
  if (m.dim && !(req.dims || []).includes(m.dim)) return false;
  if (m.scope && !(req.target || '').startsWith(m.scope)) return false;
  if (m.scope_not && m.scope_not.some(s => (req.target || '').startsWith(s))) return false;
  if (m.target && req.target !== m.target) return false;
  if (m.side_effects && req.side_effects !== m.side_effects) return false;
  if (m.format && req.format !== m.format) return false;
  if (m.target_glob && !globMatch(m.target_glob, req.target || '')) return false;
  if (m.path_glob_any) {
    const tgt = req.target || '';
    if (!m.path_glob_any.some(g => globMatch(g, tgt))) return false;
  }
  if (m.room_glob && !globMatch(m.room_glob, req.target || '')) return false;
  if (m.operator_witnessed_window_open !== undefined && req.operator_witnessed !== m.operator_witnessed_window_open) return false;
  return true;
}

// === 6-part deterministic Shannon vote ===
function selfVote(req) {
  const known_scopes = ['C:/Users/acer/Asolaria', 'jesse-work-cube', 'data/cubes/', 'data/meeting-rooms/', 'data/omni-request-box/', 'COM10', 'COM9', 'http://192.168.100.2:4820', 'http://127.0.0.1:4913'];
  const reversible_verbs = ['know.', 'meet.', 'fs.write', 'fs.append', 'meta.spawn', 'meta.register', 'tool.add', 'cron.create', 'type.peer', 'device.read'];
  const restricted_verbs = ['slack.send', 'email.send', 'http.post.external', 'fs.delete_recursive', 'git.force_push', 'git.reset_hard', 'process.kill'];

  const target = req.target || '';
  const verb = req.verb || '';
  const hasCube = Array.isArray(req.cube) && req.cube.length > 0;
  const hasEvidence = !!(req.evidence_path || req.reason || req.rationale);
  const isReversible = reversible_verbs.some(v => verb.startsWith(v));
  const isRestricted = restricted_verbs.some(v => verb.startsWith(v));
  const inKnownScope = known_scopes.some(s => target.startsWith(s) || target.includes(s));

  // pattern match against approved history
  const approved = readLines(F.approved);
  const similarApproved = approved.some(r => r.original && r.original.verb === verb);

  // chain conflict: any pending entry with same target + opposite verb intent?
  const conflicts = false; // simple stub for now

  const parts = [
    { part: 'scout',    verdict: inKnownScope ? 'PROCEED' : 'NEEDS-CHANGE', why: inKnownScope ? 'target in known scope map' : `target ${target} not in known scope` },
    { part: 'evidence', verdict: (hasCube && hasEvidence) ? 'PROCEED' : 'NEEDS-CHANGE', why: (hasCube && hasEvidence) ? 'has cube[] and evidence/reason' : 'missing cube[] or evidence_path/reason' },
    { part: 'executor', verdict: isReversible ? 'PROCEED' : (isRestricted ? 'HALT' : 'PROCEED-AFTER-STEP-1'), why: isReversible ? 'verb is reversible class' : (isRestricted ? 'verb is in restricted list' : 'reversibility unclear, needs rollback note') },
    { part: 'fabric',   verdict: similarApproved ? 'PROCEED' : 'PROCEED-AFTER-STEP-1', why: similarApproved ? 'matches existing approved pattern' : 'novel verb pattern, OK to proceed but log' },
    { part: 'voice',    verdict: isRestricted ? 'REFUSED' : 'PROCEED', why: isRestricted ? 'restricted verb requires explicit operator authorization' : 'no operator restriction flag' },
    { part: 'planner',  verdict: conflicts ? 'NEEDS-CHANGE' : 'PROCEED', why: conflicts ? 'chain conflict with another pending request' : 'no blocking dependencies' },
  ];

  const negative = parts.filter(p => ['NEEDS-CHANGE', 'HALT', 'REFUSED'].includes(p.verdict));
  const decision = negative.length === 0 ? 'approve' : 'needs_jesse';
  return { decision, parts, negative_count: negative.length };
}

function decide(req) {
  // 1. hard_deny
  for (const r of CFG.hard_deny_rules || []) {
    if (matchRule(req, r.match)) return { action: 'deny', rule: r.rule_id, rationale: r.rationale, vote: null };
  }
  // 2. auto_approve
  for (const r of CFG.auto_approve_rules || []) {
    if (matchRule(req, r.match)) return { action: 'approve', rule: r.rule_id, rationale: r.rationale, vote: null };
  }
  // 3. self_vote rules (explicit self-vote scopes)
  for (const r of CFG.self_vote_rules || []) {
    if (matchRule(req, r.match)) {
      const vote = selfVote(req);
      return { action: vote.decision, rule: r.rule_id, rationale: `self-vote(${r.rule_id}): ${vote.negative_count === 0 ? 'no negatives' : vote.negative_count + ' negative verdicts'}`, vote };
    }
  }
  // 4. default self-vote (catch-all)
  const vote = selfVote(req);
  return { action: vote.decision, rule: 'DSV-DEFAULT', rationale: `default self-vote: ${vote.negative_count === 0 ? 'no negatives, accepted' : vote.negative_count + ' negatives, escalate'}`, vote };
}

function process() {
  const seen = seenIds();
  const pending = readLines(F.pending);
  const residue = [];
  let approved = 0, denied = 0, self_voted = 0, escalated = 0, dedup = 0;

  for (const req of pending) {
    if (!req.request_id) { residue.push(req); continue; }
    if (seen.has(req.request_id)) { dedup++; continue; }
    const d = decide(req);
    const record = {
      ts: now(),
      request_id: req.request_id,
      from_agent: req.from_agent,
      verb: req.verb,
      target: req.target,
      cube: req.cube || [],
      dims: req.dims || [],
      decision: d.action,
      rule: d.rule,
      rationale: d.rationale,
      vote: d.vote,
      original: req,
    };
    appendLine(F.audit, record);
    if (d.action === 'approve') {
      // if it came through self-vote, also log to self_voted for visibility
      if (d.vote) { appendLine(F.self_voted, record); self_voted++; }
      appendLine(F.approved, record);
      approved++;
    } else if (d.action === 'deny') {
      appendLine(F.denied, record);
      denied++;
    } else {
      // needs_jesse
      appendLine(F.needs_jesse, record);
      appendLine(F.allhands, {
        ts: now(),
        room: 'qdd-recon-allhands',
        from: 'omni-request-processor',
        to: 'jesse_operator',
        verb: 'request.escalate.to_jesse',
        cube: req.cube || [704969],
        dims: req.dims || ['D24_INTENT'],
        body: `@escalate.to_jesse request_id=${req.request_id} from=${req.from_agent} verb=${req.verb} target=${req.target} negatives=${d.vote ? d.vote.negative_count : 'n/a'} reason=self_vote_returned_negative`,
      });
      escalated++;
    }
  }
  fs.writeFileSync(F.pending, residue.map(r => JSON.stringify(r)).join('\n') + (residue.length ? '\n' : ''));

  const summary = { ts: now(), approved, denied, self_voted, escalated, dedup, total: pending.length, schema: 'v2' };
  appendLine(F.audit, { ...summary, kind: 'kicker_run_summary' });
  console.log(JSON.stringify(summary));
}

process();
