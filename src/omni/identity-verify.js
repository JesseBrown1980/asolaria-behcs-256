// Item 148 · omni.identity.verify

const { guardSpawn } = require("../identity/spawner-guard.js");
async function omniIdentityVerify(opts = {}) { return guardSpawn(opts); }
module.exports = { omniIdentityVerify };
