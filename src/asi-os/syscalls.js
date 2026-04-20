// Item 202 · ASI-OS L4 · omni primitives as syscall layer

const requestBox    = require("../omni/request-box-v2.js");
const announce      = require("../omni/envelope-announce.js");
const driftBroadcast= require("../omni/drift-broadcast.js");
const cosignAppend  = require("../omni/cosign-append.js");
const agentSpawn    = require("../omni/agent-spawn.js");
const identityVerify= require("../omni/identity-verify.js");
const llmRoute      = require("../omni/llm-route.js");
const usbMount      = require("../omni/usb-mount.js");

module.exports = {
  // syscall surface — each is async (args) → { ok, ... }
  request_box_v2: requestBox,
  envelope_announce: announce.omniEnvelopeAnnounce,
  drift_broadcast:   driftBroadcast.omniDriftBroadcast,
  cosign_append:     cosignAppend.omniCosignAppend,
  cosign_verify:     cosignAppend.omniCosignVerify,
  agent_spawn:       agentSpawn.omniAgentSpawn,
  identity_verify:   identityVerify.omniIdentityVerify,
  llm_route:         llmRoute.omniLlmRoute,
  usb_mount:         usbMount.omniUsbMount,
};
