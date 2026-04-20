// Item 145 · omni.drift.broadcast

const { broadcastDrift } = require("../drift/broadcast.js");
async function omniDriftBroadcast(drift, sendFn) { return broadcastDrift(drift, sendFn); }
module.exports = { omniDriftBroadcast };
