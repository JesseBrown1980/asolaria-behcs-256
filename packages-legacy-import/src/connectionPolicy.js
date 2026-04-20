function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

const channelHeartbeatState = new Map();

function normalizeChannels(input) {
  const raw = Array.isArray(input) ? input : String(input || "").split(",");
  const allowed = new Set(["usb", "vpn", "private_internet", "public_internet"]);
  const normalized = [];
  for (const item of raw) {
    const value = normalizeLower(item);
    if (!allowed.has(value)) continue;
    if (!normalized.includes(value)) {
      normalized.push(value);
    }
  }
  return normalized;
}

function rankChannel(channel) {
  const value = normalizeLower(channel);
  if (value === "usb") return 0;
  if (value === "vpn") return 1;
  if (value === "private_internet") return 2;
  if (value === "public_internet") return 3;
  return 99;
}

function choosePreferredChannel(available = [], preferred = []) {
  const avail = normalizeChannels(available);
  const pref = normalizeChannels(preferred);
  if (avail.length === 0) {
    return {
      channel: "none",
      reason: "No channels detected as available.",
      fallbackUsed: false
    };
  }

  if (pref.length > 0) {
    for (const item of pref) {
      if (avail.includes(item)) {
        return {
          channel: item,
          reason: `Matched preferred secure channel: ${item}.`,
          fallbackUsed: false
        };
      }
    }
  }

  const sorted = avail.slice().sort((a, b) => rankChannel(a) - rankChannel(b));
  return {
    channel: sorted[0],
    reason: "Preferred list unavailable; selected strongest available fallback.",
    fallbackUsed: true
  };
}

function deriveDefaultPreferredList() {
  return ["usb", "vpn", "private_internet", "public_internet"];
}

function enforceChannelPrivacyPolicy(available = [], options = {}) {
  const avail = normalizeChannels(available);
  const allowPublicInternet = Boolean(options.allowPublicInternet);
  const publicInternetIsPrivate = Boolean(options.publicInternetIsPrivate);
  const removed = [];
  const allowed = [];

  for (const channel of avail) {
    if (channel === "public_internet") {
      if (!allowPublicInternet) {
        removed.push({
          channel,
          reason: "public_internet_disabled"
        });
        continue;
      }
      if (!publicInternetIsPrivate) {
        removed.push({
          channel,
          reason: "public_internet_not_private"
        });
        continue;
      }
    }
    allowed.push(channel);
  }

  return {
    allowed,
    removed
  };
}

function noteChannelHeartbeat(channel, at = new Date().toISOString()) {
  const normalized = normalizeLower(channel);
  if (!normalized) {
    return {
      ok: false,
      channel: "",
      at: String(at || new Date().toISOString())
    };
  }

  const prev = channelHeartbeatState.get(normalized) || {
    channel: normalized,
    count: 0,
    lastHeartbeatAt: ""
  };
  const next = {
    channel: normalized,
    count: Number(prev.count || 0) + 1,
    lastHeartbeatAt: String(at || new Date().toISOString())
  };
  channelHeartbeatState.set(normalized, next);
  return {
    ok: true,
    ...next
  };
}

module.exports = {
  normalizeChannels,
  choosePreferredChannel,
  deriveDefaultPreferredList,
  enforceChannelPrivacyPolicy,
  noteChannelHeartbeat
};
