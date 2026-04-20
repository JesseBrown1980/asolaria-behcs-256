const {
  getExternalMcpPolicyPresets,
  getExternalMcpTokenReductionProfiles
} = require("./externalBrainMcpConfig");
const {
  getExternalProvider,
  getExternalProviderStatus,
  getExternalProviderStatusById,
  listConfiguredExternalProviders,
  normalizeProviderId
} = require("./externalBrainProviderStatus");
const { setExternalProviderConfig: setExternalProviderConfigInStore } = require("./externalBrainProviderStore");
const {
  clearExternalMcpCache,
  getExternalMcpCacheStatus
} = require("./externalBrainMcpRuntime");
const { runExternalProvider } = require("./externalBrainRequestExecution");

function setExternalProviderConfig(input = {}) {
  const status = setExternalProviderConfigInStore(input);
  const providerId = normalizeProviderId(input.provider || input.id || status?.id);
  if (providerId) {
    clearExternalMcpCache({ providerId });
  }
  return status;
}

module.exports = {
  listConfiguredExternalProviders,
  getExternalProviderStatus,
  getExternalProviderStatusById,
  getExternalMcpCacheStatus,
  clearExternalMcpCache,
  getExternalMcpPolicyPresets,
  getExternalMcpTokenReductionProfiles,
  setExternalProviderConfig,
  getExternalProvider,
  runExternalProvider
};
