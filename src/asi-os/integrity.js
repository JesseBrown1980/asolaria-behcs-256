// Item 203 · ASI-OS L3 · cosign v2 as integrity layer

const { appendV2, verifyChain, computeChainHash } = require("../cosign/append-v2.js");

async function seal({ chain_path, envelope_id, sha256, agents, scale_tier = "N-A", mode = "real", dimensional_tags = null }) {
  return appendV2({ chain_path, envelope_id, sha256, agents, scale_tier, mode, dimensional_tags });
}

async function audit(chain_path) {
  return verifyChain(chain_path);
}

module.exports = { seal, audit, computeChainHash };
