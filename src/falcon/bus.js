// Item 183 · Falcon bus on 4947 with envelope-v1

const { omniEnvelopeAnnounce } = require("../omni/envelope-announce.js");

const FALCON_BUS = { primary: 4947, backup: 4950, always_open: true };

async function falconAnnounce(envelope, { targetHost = "falcon.local", port = FALCON_BUS.primary } = {}) {
  const busUrl = `http://${targetHost}:${port}/behcs/send`;
  return omniEnvelopeAnnounce(envelope, { busUrl });
}

module.exports = { falconAnnounce, FALCON_BUS };
