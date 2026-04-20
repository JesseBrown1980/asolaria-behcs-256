# Item 172 · OpenClaude dispatch patterns

## 1. 8-verb twin
`perceive → classify → score → compare → judge → record → attest → close` — both OpenClaude and ReSono agree on this sequence. Documented in `src/openclaude/twin-map.js` (item 165).

## 2. Bias-correction tier
OpenClaude introduces a third bias-correction tier AFTER `judge` and BEFORE `record`. Item 173 implements this hook.

## 3. Third-system-awareness
OpenClaude assumes a THIRD independent observer (we call it "Shannon-civ" when wired in item 174). The 8-verb sequence on its own is insufficient; the third observer calibrates potentially-biased pair output.

## 4. Wire-protocol agnosticism
OpenClaude pattern does not care whether events travel on BEHCS bus, MQTT, or stdin — it just wants the 8 verbs in order.

## 5. Close is terminal
`close` must NOT be followed by any additional action on the same envelope. Re-opens create a NEW envelope with a new id.
