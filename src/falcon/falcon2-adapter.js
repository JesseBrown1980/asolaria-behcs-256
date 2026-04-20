// Item 184 · Falcon2 extensions port · adapter hook

const { falconAnnounce, FALCON_BUS } = require("./bus.js");

const FALCON2_ROOM = 44;
const FALCON2_CAPABILITIES = ["bus", "sentinel", "cross-witness-drift"];

async function falcon2Announce(envelope, opts = {}) {
  // Falcon2 talks the same bus protocol as Falcon; bus.js handles both.
  const withRoom = { ...envelope, body: { ...(envelope.body || {}), room: FALCON2_ROOM, capabilities: FALCON2_CAPABILITIES } };
  return falconAnnounce(withRoom, opts);
}

module.exports = { falcon2Announce, FALCON2_ROOM, FALCON2_CAPABILITIES, FALCON_BUS };
