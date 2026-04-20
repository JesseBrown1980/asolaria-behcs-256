// Item 123 · Hybrid multi-GNN harness
// Combines OmniGNN + reverse-gain-GNN + GSL-GNN + contrastive-GNN + prototype-GNN scores,
// runs a fanout over N agents in K shards, emits per-shard LCR + bilateral sha.

const crypto = require("node:crypto");

function shardPlan(N, shard_size = 1_000_000) {
  const K = Math.ceil(N / shard_size);
  const shards = [];
  for (let i = 0; i < K; i++) {
    const start = i * shard_size;
    const end = Math.min(N, start + shard_size);
    shards.push({ id: `shard-${i}`, start, end });
  }
  return { K, shard_size, shards };
}

async function runShard(shard, scorers /* { omni, reverse, gsl, contrastive, prototype } */) {
  // Scorers are functions (agent_id) => Promise<score in [0,1]>. Stub default: deterministic hash-based.
  const default_scorer = (id) => {
    const h = crypto.createHash("sha256").update(String(id)).digest();
    return (h[0] / 255);
  };
  const omni = scorers?.omni || default_scorer;
  const reverse = scorers?.reverse || default_scorer;
  const gsl = scorers?.gsl || default_scorer;
  const contrastive = scorers?.contrastive || default_scorer;
  const prototype = scorers?.prototype || default_scorer;
  let sumLCR = 0, count = 0;
  const shardHash = crypto.createHash("sha256");
  for (let id = shard.start; id < shard.end; id++) {
    const [o, r, g, c, p] = await Promise.all([omni(id), reverse(id), gsl(id), contrastive(id), prototype(id)]);
    const lcr = (o + r + g + c + p) / 5;
    sumLCR += lcr; count++;
    shardHash.update(`${id}:${lcr.toFixed(6)}`);
  }
  return {
    shard_id: shard.id,
    agents: count,
    mean_LCR: count ? sumLCR / count : 0,
    shard_sha256: shardHash.digest("hex"),
  };
}

async function runFanout({ N, shard_size = 1_000_000, scorers = null, max_shards_run = null }) {
  const plan = shardPlan(N, shard_size);
  const shardsToRun = max_shards_run ? plan.shards.slice(0, max_shards_run) : plan.shards;
  const results = [];
  for (const s of shardsToRun) results.push(await runShard(s, scorers));
  const composite = crypto.createHash("sha256");
  for (const r of results) composite.update(r.shard_sha256);
  return {
    N, shard_count_planned: plan.K, shard_count_executed: results.length,
    mean_LCR: results.reduce((a,b)=>a+b.mean_LCR,0) / Math.max(1, results.length),
    composite_sha256: composite.digest("hex"),
    shards: results,
  };
}

module.exports = { shardPlan, runShard, runFanout };
