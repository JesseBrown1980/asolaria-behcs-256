const {
  normalizeIndexId,
  normalizeIxId,
  normalizeLxId
} = require("./index-kernel/textIds");
const {
  resolveUnifiedIndexProfile,
  resolveScanMode,
  getUnifiedIndexCachePath
} = require("./index-kernel/profile");
const {
  readUnifiedIndex,
  rebuildUnifiedIndex,
  promoteUnifiedIndex,
  scanUnifiedIndex,
  searchUnifiedIndex,
  collectUnifiedIndexDocuments,
  getUnifiedIndexStatus
} = require("./index-kernel/runtime");
const aso = require("./index-kernel/aso");

module.exports = {
  normalizeIndexId,
  normalizeIxId,
  normalizeLxId,
  resolveUnifiedIndexProfile,
  resolveScanMode,
  getUnifiedIndexCachePath,
  readUnifiedIndex,
  rebuildUnifiedIndex,
  promoteUnifiedIndex,
  scanUnifiedIndex,
  searchUnifiedIndex,
  collectUnifiedIndexDocuments,
  getUnifiedIndexStatus,
  aso
};
