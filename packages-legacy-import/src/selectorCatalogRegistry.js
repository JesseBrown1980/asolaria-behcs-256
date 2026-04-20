const DEFAULT_SELECTORS = [
  {
    id: "messaging.slack.asolaria",
    label: "Slack Asolaria Dispatch",
    category: "messaging",
    profile: "dispatch",
    accessLevel: "trusted",
    description: "Dispatches messages into the #asolaria control lane."
  },
  {
    id: "guardian.approvals.default",
    label: "Guardian Approval Flow",
    category: "guardian",
    profile: "oversight",
    accessLevel: "operator",
    description: "Handles local guardian approval review and decisions."
  },
  {
    id: "omnispindle.control.route",
    label: "Omnispindle Control Route",
    category: "omnispindle",
    profile: "control",
    accessLevel: "operator",
    description: "Routes control-lane requests into the local omnispindle surfaces."
  }
];

function cloneSelector(selector) {
  return selector && typeof selector === "object" ? { ...selector } : null;
}

function listSelectors() {
  return DEFAULT_SELECTORS.map(cloneSelector);
}

function getSelector(id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) {
    return null;
  }
  const found = DEFAULT_SELECTORS.find((item) => String(item.id || "").trim().toLowerCase() === key);
  return cloneSelector(found);
}

function listCategories() {
  return Array.from(new Set(DEFAULT_SELECTORS.map((item) => String(item.category || "").trim()).filter(Boolean))).sort();
}

function listProfiles() {
  return Array.from(new Set(DEFAULT_SELECTORS.map((item) => String(item.profile || "").trim()).filter(Boolean))).sort();
}

function listAccessLevels() {
  return Array.from(new Set(DEFAULT_SELECTORS.map((item) => String(item.accessLevel || "").trim()).filter(Boolean))).sort();
}

function getCatalogSummary() {
  return {
    selectorCount: DEFAULT_SELECTORS.length,
    categoryCount: listCategories().length,
    profileCount: listProfiles().length,
    accessLevelCount: listAccessLevels().length
  };
}

function dryRunSelector(id, input = {}) {
  const selector = getSelector(id);
  if (!selector) {
    const error = new Error("Selector not found.");
    error.statusCode = 404;
    throw error;
  }
  return {
    selectorId: selector.id,
    accepted: true,
    normalizedInput: input && typeof input === "object" ? { ...input } : {},
    route: {
      category: selector.category,
      profile: selector.profile,
      accessLevel: selector.accessLevel
    },
    preview: `Dry run accepted for ${selector.id}.`
  };
}

module.exports = {
  listSelectors,
  getSelector,
  listCategories,
  listProfiles,
  listAccessLevels,
  getCatalogSummary,
  dryRunSelector
};
