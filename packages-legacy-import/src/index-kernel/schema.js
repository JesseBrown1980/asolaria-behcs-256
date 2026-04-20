const path = require("path");
const { projectRoot, resolveDataPath } = require("../runtimePaths");

const SCHEMA_VERSION = 3;
const agentIndexRoot = path.join(projectRoot, "data", "agent-index");
const indexKernelRoot = path.join(projectRoot, "src", "index-kernel");

const CANONICAL_TYPES = Object.freeze([
  "identity",
  "mistake",
  "pattern",
  "plan",
  "policy",
  "project",
  "reference",
  "rule",
  "skill",
  "task",
  "tool"
]);

const CANONICAL_TYPE_DIRS = Object.freeze(CANONICAL_TYPES.slice());
const CANONICAL_LX_PATTERN = /^LX-\d{3,4}\.md$/i;
const AUXILIARY_ROOT_IX_PATTERN = /^gaia-IX-\d{3,4}\.md$/i;
const AUXILIARY_REF_IX_PATTERN = /^IX-\d{3,4}\.md$/i;

const stagingCachePath = path.join(projectRoot, ".history", "staging", "compiled-unified-agent-index.json");
const devCachePath = path.join(projectRoot, ".history", "dev", "compiled-unified-agent-index.json");
const runningManifestPath = resolveDataPath("unified-agent-index-running-manifest.json");
const prodCachePath = resolveDataPath("unified-agent-index.json");

module.exports = {
  projectRoot,
  agentIndexRoot,
  indexKernelRoot,
  SCHEMA_VERSION,
  CANONICAL_TYPES,
  CANONICAL_TYPE_DIRS,
  CANONICAL_LX_PATTERN,
  AUXILIARY_ROOT_IX_PATTERN,
  AUXILIARY_REF_IX_PATTERN,
  stagingCachePath,
  devCachePath,
  runningManifestPath,
  prodCachePath
};
