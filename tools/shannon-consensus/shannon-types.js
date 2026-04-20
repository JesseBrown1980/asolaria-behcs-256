/**
 * shannon-types.js — The 12 Shannon TYPES (axis 4)
 *
 * Spec source: Liris's 2592-beat run (relayed via Rayssa) and the Hilbert system
 * problem proposal docx. The 12 types are the canonical critique categories that
 * any Shannon analysis can produce. They form the FOURTH axis of the omnishannon
 * cube:
 *
 *   6 GNN cycle steps × 6 body systems × 6 Shannon parts × 12 Shannon types = 2592
 *
 * Each beat in a Shannon wave produces a vote, evidence, AND a classification into
 * one or more of these 12 types. The types are not modes or agents — they are the
 * OUTPUT SPACE of Shannon analysis. They tell you WHAT KIND of finding emerged.
 *
 * Source attribution: Liris discovered these 12 types in her 2592-beat Shannon
 * self-reflection on Asolaria's GNN work, 2026-04-06.
 */

'use strict';

const SHANNON_TYPES = Object.freeze([
  {
    id: 1,
    name: 'accuracy-reproducibility',
    short: 'reproducibility',
    description: 'Findings about whether a metric or result is reproducible. "X% error is entropy in source data, not faulty inference."',
    examples: ['perfect F1 on small test set', 'metric drift between runs', 'training-vs-validation gap']
  },
  {
    id: 2,
    name: 'actor-tier-split',
    short: 'tier-split',
    description: 'Findings about insufficient training signal in a subset of actors or a tier of behavior.',
    examples: ['7 outliers with no training signal', 'minority class undersampled', 'tier boundaries drawn wrong']
  },
  {
    id: 3,
    name: 'topology-star-not-dag',
    short: 'topology-wrong',
    description: 'Findings about a structural assumption being wrong. The assumed graph shape is not the actual graph shape.',
    examples: ['DAG assumed but reality is funnel', '97.2% single-sink', 'hub-and-spoke not distributed']
  },
  {
    id: 4,
    name: 'lockstep-quartet',
    short: 'hidden-coupling',
    description: 'Findings about hidden structural patterns nobody documented — coupled subsystems that move together.',
    examples: ['quartet of agents always co-active', 'undocumented dependency cycle', 'four files always co-edited']
  },
  {
    id: 5,
    name: 'deterministic-dispatch',
    short: 'wrong-abstraction',
    description: 'Findings about a system being framed at the wrong level. "We called it learning. It is scheduled orchestration."',
    examples: ['GNN routing actually scheduled', 'consensus actually quorum', 'inference actually lookup']
  },
  {
    id: 6,
    name: 'hook-wall-dominance',
    short: 'single-point-of-failure',
    description: 'Findings about a single component dominating the system such that its failure is catastrophic.',
    examples: ['hookwall is the funnel sink', 'one host carries the colony', 'single USB is the source of truth']
  },
  {
    id: 7,
    name: 'risk-authority-correlation',
    short: 'design-vs-accident',
    description: 'Findings about a correlation that could be deliberate design OR emergent accident — and we cannot tell which.',
    examples: ['high-risk verbs always go through trusted actors', 'permission patterns match payment patterns', 'authority maps to seniority']
  },
  {
    id: 8,
    name: 'failure-concentration',
    short: 'suspicious-silence',
    description: 'Findings about an absence of failure that is either a logging blind spot or a result that demands explanation.',
    examples: ['zero false positives in 30k samples', 'no errors in 17 days of logs', 'all migrations succeed']
  },
  {
    id: 9,
    name: 'pattern-saturation',
    short: 'wasted-effort',
    description: 'Findings about training/computation that converged early but kept running. "We trained 200K rounds. Wasted 180K."',
    examples: ['validation F1 plateaued at epoch 20', 'sweep ran past convergence', 'no early-stopping']
  },
  {
    id: 10,
    name: 'jit-performance',
    short: 'sample-bias',
    description: 'Findings about a small or non-representative sample being treated as if it generalized. "Sub-10M runs are not representative of production."',
    examples: ['benchmark sample too small', 'production traffic differs from training', 'tail behavior unmeasured']
  },
  {
    id: 11,
    name: 'compression-ratio',
    short: 'metric-conflation',
    description: 'Findings about two metrics that both look real but measure different things being conflated.',
    examples: ['F1 and accuracy on different denominators', 'cycle count vs beat count', 'bytes vs characters']
  },
  {
    id: 12,
    name: 'dimension-population',
    short: 'underutilized',
    description: 'Findings about designed capacity that is not being used. "We designed 14 dimensions. Only 6 are alive."',
    examples: ['10 expansion dimensions empty', 'verb table half-populated', 'reviewer pool of 6 but only 4 vote']
  }
]);

const TYPE_BY_ID = Object.freeze(
  SHANNON_TYPES.reduce((acc, t) => { acc[t.id] = t; return acc; }, {})
);

const TYPE_BY_NAME = Object.freeze(
  SHANNON_TYPES.reduce((acc, t) => { acc[t.name] = t; return acc; }, {})
);

/**
 * Classify a finding into one or more Shannon types.
 *
 * The default implementation is a stub — it returns an empty array, meaning
 * "no classification provided." A real implementation would either:
 *  - have the agent emit type tags directly, or
 *  - run a small classifier over the finding text against the 12 types
 *
 * @param {string|object} finding - the text or structured object to classify
 * @returns {Array<string>} array of Shannon type names this finding belongs to
 */
function defaultClassifier(finding) {
  return [];
}

/**
 * Validate that a list of type names are all canonical.
 * Throws on unknown types.
 */
function validateTypes(typeNames) {
  for (const name of typeNames) {
    if (!TYPE_BY_NAME[name]) {
      throw new Error(`shannon-types: unknown type "${name}". Valid: ${Object.keys(TYPE_BY_NAME).join(', ')}`);
    }
  }
  return true;
}

/**
 * Aggregate type counts across an array of findings.
 * Each finding is { types: [name1, name2, ...] }.
 * Returns { type_name: count } for all 12 types.
 */
function aggregateTypeCounts(findings) {
  const counts = {};
  for (const t of SHANNON_TYPES) counts[t.name] = 0;
  for (const f of findings) {
    if (!f.types) continue;
    for (const name of f.types) {
      if (counts[name] !== undefined) counts[name] += 1;
    }
  }
  return counts;
}

module.exports = {
  SHANNON_TYPES,
  TYPE_BY_ID,
  TYPE_BY_NAME,
  defaultClassifier,
  validateTypes,
  aggregateTypeCounts,
  TOTAL_TYPES: SHANNON_TYPES.length // = 12
};
