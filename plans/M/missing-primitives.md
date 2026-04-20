# Item 142 · Missing omni.* primitives to build

Per 141 inventory. Items 143-150 each implement one. All adhere to `omni.<noun>.<verb>(args)` shape returning `{ ok, ... }`.

- **omni.request.box.v2** · 4-track self-approval (submit, review, approve, execute) with env isolation.
- **omni.envelope.announce** · publish envelope-v1 to federation bus with glyph stamp.
- **omni.drift.broadcast** · thin wrapper over `src/drift/broadcast.js` with omni naming.
- **omni.cosign.append** · thin wrapper over `src/cosign/append-v2.js`.
- **omni.agent.spawn** · thin wrapper over `src/agent/spawner.js` + probe + bind-check.
- **omni.identity.verify** · wrapper over `src/identity/spawner-guard.js` that only verifies (doesn't spawn).
- **omni.llm.route** · wrapper over `src/llm/router.js`.
- **omni.usb.mount** · wrapper that negotiates liris-side TestDisk mount + posts `EVT-USB-MOUNT-READY`.
