/** ASO Connector Middleware — opt-in wrapper for connectors to auto-record ASO data.
 *  Lightweight: does not modify any existing connector code. */
const aso = require("./aso-client");

// Cache of connector topic IDs keyed by connector name
const _topicCache = {};

/**
 * Find an existing ASO topic for a connector, or create one.
 * Returns { ok, id } synchronously (local) or as-resolved.
 * Created topics use type="tool", tier="operational".
 */
function findOrCreateConnectorTopic(name) {
  if (_topicCache[name]) return _topicCache[name];

  const searchResult = aso.search(name);
  // searchResult may be a promise (remote) or plain object (local)
  if (searchResult && typeof searchResult.then === "function") {
    // Remote/async path — callers in async contexts can await this
    return searchResult.then((r) => _resolveOrCreate(name, r));
  }
  return _resolveOrCreate(name, searchResult);
}

function _resolveOrCreate(name, searchResult) {
  if (searchResult && searchResult.matches && searchResult.matches.length > 0) {
    const match = searchResult.matches.find(
      (m) => m.name === name || m.name === `connector:${name}`
    );
    if (match) {
      const entry = { ok: true, id: match.asoId };
      _topicCache[name] = entry;
      return entry;
    }
  }
  // No existing topic found — create one
  const created = aso.topic(`connector:${name}`, "tool", { tier: "operational" });
  if (created && typeof created.then === "function") {
    return created.then((c) => {
      const entry = { ok: c.ok !== false, id: c.asoId || c.id || null };
      _topicCache[name] = entry;
      return entry;
    });
  }
  const entry = { ok: created.ok !== false, id: created.asoId || created.id || null };
  _topicCache[name] = entry;
  return entry;
}

/**
 * Register a connector as an ASO surface (host + port endpoint).
 * Returns the surface result.
 */
function registerConnector(name, host, port) {
  const topicResult = findOrCreateConnectorTopic(name);
  if (topicResult && typeof topicResult.then === "function") {
    return topicResult.then((t) => aso.surface(t.id, host, port));
  }
  return aso.surface(topicResult.id, host, port);
}

/**
 * Wrap a connector function to auto-record ASO observations and outcomes.
 * - On call: logs an observation ("connector invoked")
 * - On success: records outcome with trigger=action, result=success
 * - On error: records outcome with trigger=action, result=error message
 * - Returns the original function's result unchanged.
 * Works with both sync and async connector functions.
 */
function withAso(connectorName, fn) {
  const topicResult = findOrCreateConnectorTopic(connectorName);

  return function wrappedConnector(...args) {
    const topicId = _getTopicId(topicResult);

    // Log the invocation attempt as an observation
    aso.observe(topicId, `${connectorName} invoked`);

    let result;
    try {
      result = fn.apply(this, args);
    } catch (err) {
      aso.outcome(topicId, "action", `error: ${err.message || err}`);
      throw err;
    }

    // Handle async functions (returns a thenable)
    if (result && typeof result.then === "function") {
      return result.then(
        (val) => {
          aso.outcome(topicId, "action", "success");
          return val;
        },
        (err) => {
          aso.outcome(topicId, "action", `error: ${err.message || err}`);
          throw err;
        }
      );
    }

    // Sync success
    aso.outcome(topicId, "action", "success");
    return result;
  };
}

/** Extract topic ID from a resolved or pending topic result. */
function _getTopicId(topicResult) {
  if (!topicResult) return null;
  if (typeof topicResult.then === "function") return null; // async — best-effort
  return topicResult.id || null;
}

module.exports = { withAso, registerConnector, findOrCreateConnectorTopic };
