const DEFAULT_PACK_NOISE_HINTS = Object.freeze([
  "archaeology",
  "federation",
  "foundational",
  "antigravity",
  "openclaw",
  "symphony",
  "gnn",
  "history",
  "bridge"
]);

function collectBriefingContext(parts = []) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function packHaystack(pack = {}) {
  return collectBriefingContext([
    pack.id,
    pack.title,
    pack.summary,
    pack.keywords,
    pack.topTags,
    pack.sampleIds
  ]);
}

function packMatchesContext(pack = {}, contextText = "") {
  const context = String(contextText || "").toLowerCase();
  if (!context) return false;
  const probes = [
    pack.id,
    pack.title,
    pack.summary,
    ...(Array.isArray(pack.topTags) ? pack.topTags : []),
    ...(Array.isArray(pack.keywords) ? pack.keywords : [])
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return probes.some((probe) => context.includes(probe));
}

function isNoisyPack(pack = {}, options = {}) {
  const haystack = packHaystack(pack);
  const noiseHints = Array.isArray(options.noiseHints) && options.noiseHints.length > 0
    ? options.noiseHints
    : DEFAULT_PACK_NOISE_HINTS;
  return noiseHints.some((hint) => haystack.includes(String(hint || "").toLowerCase()));
}

function gateBriefingPacks(
  packs = [],
  contextText = "",
  role = "",
  _config = {},
  kind = "pattern",
  explicitContextText = "",
  options = {}
) {
  const broadContext = String(contextText || "").toLowerCase();
  const explicitContext = String(explicitContextText === undefined ? contextText : explicitContextText || "").toLowerCase();
  const maxVisible = Math.max(1, Number(options.maxVisible) || 2);
  const ranked = (Array.isArray(packs) ? packs : [])
    .map((pack) => {
      const score = Number(pack && pack.score) || 0;
      const noisy = isNoisyPack(pack, options);
      const contextHit = packMatchesContext(pack, broadContext);
      const explicitHit = packMatchesContext(pack, explicitContext);
      const roleMatch = Array.isArray(pack?.preferredRoles) && pack.preferredRoles.includes(role);
      const priorityScore = score + (noisy && explicitHit ? 100 : 0);
      const allowed = noisy
        ? explicitHit
        : Boolean(score > 0 && (roleMatch || contextHit || score >= 8));
      return {
        pack,
        score,
        priorityScore,
        noisy,
        contextHit,
        explicitHit,
        roleMatch,
        allowed
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore || right.pack.count - left.pack.count || String(left.pack.id || "").localeCompare(String(right.pack.id || "")));

  const visible = ranked.filter((row) => row.allowed).slice(0, maxVisible);
  const fallback = visible.length > 0
    ? visible
    : ranked.filter((row) => !row.noisy && row.score > 0).slice(0, 1);
  const selected = fallback.length > 0 ? fallback : visible;
  const selectedSet = new Set(selected);
  const hidden = ranked.filter((row) => !selectedSet.has(row));

  return {
    kind,
    role,
    maxVisible,
    totalCandidates: ranked.length,
    visible: selected.map((row) => ({
      id: row.pack.id,
      title: row.pack.title,
      count: row.pack.count,
      topTags: Array.isArray(row.pack.topTags) ? row.pack.topTags.slice(0, 6) : [],
      sampleIds: Array.isArray(row.pack.sampleIds) ? row.pack.sampleIds.slice(0, 6) : [],
      score: row.priorityScore
    })),
    hiddenIds: hidden.map((row) => row.pack.id),
    noisyIds: ranked.filter((row) => row.noisy).map((row) => row.pack.id)
  };
}

function mergePackCandidates(allPacks = [], scoredPacks = []) {
  const scoredById = new Map(
    (Array.isArray(scoredPacks) ? scoredPacks : []).map((pack) => [String(pack.id || "").trim(), pack])
  );
  return (Array.isArray(allPacks) ? allPacks : [])
    .map((pack) => {
      const scored = scoredById.get(String(pack.id || "").trim()) || {};
      return {
        ...pack,
        score: Number(scored.score || 0)
      };
    })
    .filter((pack) => Boolean(String(pack.id || "").trim()));
}

module.exports = {
  collectBriefingContext,
  packHaystack,
  packMatchesContext,
  isNoisyPack,
  gateBriefingPacks,
  mergePackCandidates,
  DEFAULT_PACK_NOISE_HINTS
};
