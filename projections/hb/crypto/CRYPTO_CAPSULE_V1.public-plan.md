# Crypto Capsule V1 Public Projection Plan

Status: redacted projection note for a local-only integrity capsule.

- Capsule: `crypto-profile.v1.local`
- Claims class: `integrity_attestation_only`
- Live base: `47D`
- Overlay: `49D_proposal_only`
- Trinity bindings: `LX-489`, `LX-490`, `LX-491`
- HG256 transport: ASCII-safe UTF-8 hex envelope over the symbolic live glyph view.
- White-room posture: fail-closed, signed capsule plus detached packet intake, clean projection only.
- Mistake policy: accumulate until `2000`, then gulp/checkpoint with append-only evidence.

Public-safe projection targets:
- `projections/hb/crypto/CRYPTO_CAPSULE_V1.attest.json`
- `packets/crypto/crypto-capsule.v1.packet.json`
- `packets/crypto/crypto-capsule.v1.sig`
- `reports/crypto/capsule.gates.json`
- `reports/crypto/capsule.verify.json`

Private runtime materials remain local and are intentionally excluded from this note.
No confidentiality, remote trust, release readiness, or D49 seal claim is implied.
