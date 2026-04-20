// Item 146 · omni.cosign.append

const { appendV2, verifyChain } = require("../cosign/append-v2.js");
function omniCosignAppend(opts) { return appendV2(opts); }
function omniCosignVerify(chain_path) { return verifyChain(chain_path); }
module.exports = { omniCosignAppend, omniCosignVerify };
