const TUMBLERS = [
  { id: "lane-slack-dispatch", label: "Slack Dispatch Lane" },
  { id: "lane-guardian-approval", label: "Guardian Approval Lane" },
  { id: "lane-omnispindle-control", label: "Omnispindle Control Lane" }
];

const leases = new Map();

function listTumblers() {
  return TUMBLERS.map((item) => {
    const lease = leases.get(item.id) || null;
    return {
      ...item,
      status: lease ? "leased" : "available",
      lease: lease ? { ...lease } : null
    };
  });
}

function acquireTumbler(input = {}) {
  const tumblerId = String(input.tumblerId || input.id || input.laneId || "").trim();
  if (!tumblerId) {
    throw new Error("tumblerId is required.");
  }
  const tumbler = TUMBLERS.find((item) => item.id === tumblerId);
  if (!tumbler) {
    const error = new Error("Tumbler not found.");
    error.statusCode = 404;
    throw error;
  }
  if (leases.has(tumblerId)) {
    const error = new Error("Tumbler already leased.");
    error.statusCode = 409;
    throw error;
  }
  const ttlMs = Math.max(1_000, Number(input.ttlMs || 300_000) || 300_000);
  const lease = {
    leaseId: `tumbler_${Date.now()}`,
    holderId: String(input.holderId || input.holder || "catalog-route").trim() || "catalog-route",
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    ttlMs
  };
  leases.set(tumblerId, lease);
  return {
    ...tumbler,
    status: "leased",
    lease: { ...lease }
  };
}

function releaseTumbler(input = {}) {
  const tumblerId = String(input.tumblerId || input.id || input.laneId || "").trim();
  if (!tumblerId) {
    throw new Error("tumblerId is required.");
  }
  const tumbler = TUMBLERS.find((item) => item.id === tumblerId);
  if (!tumbler) {
    const error = new Error("Tumbler not found.");
    error.statusCode = 404;
    throw error;
  }
  leases.delete(tumblerId);
  return {
    ...tumbler,
    status: "available",
    lease: null
  };
}

module.exports = {
  listTumblers,
  acquireTumbler,
  releaseTumbler
};
