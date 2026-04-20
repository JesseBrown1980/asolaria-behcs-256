// Item 149 · omni.llm.route

const router = require("../llm/router.js");
async function omniLlmRoute(opts) { return router.complete(opts); }
module.exports = { omniLlmRoute };
