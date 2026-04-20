# Crypto Capsule V1

Status: local-only integrity capsule. This is not a universal security guarantee.

Purpose: define a reusable cryptographic profile and signed capsule that Asolaria lanes can consume through the BEHCS/HG256 path and the white-room flow.

## Current Truth

- This capsule is for integrity, identity binding, and approval attestation of agent artifacts on this host.
- It does not claim confidentiality, remote trust, or full-system security.
- It is bounded to local lanes and local evidence.
- Mistakes remain append-only and the GC rollup threshold stays at `2000` before gulp/checkpoint.

## Threat Model

Protected:

- accidental corruption of capsule content
- unauthorized modification of the signed capsule
- mismatch between clean white-room projection and signed source capsule

Not protected:

- endpoint compromise
- private-key theft
- remote transport trust
- universal device security
- confidentiality of any payload merely because it is signed

## Trinity Binding

- `LX-489_compute`
- `LX-490_hardware`
- `LX-491_omni_GNN_inference`

These are recorded as modality/context bindings for the capsule. They are not proof of stronger runtime guarantees by themselves.

## New Language Binding

- dialect: `BEHCS_HG256`
- live base: `47D`
- overlay: `49D proposal`
- encryption dimension: `D38`
- vault dimension: `D46`
- boundary dimension: `D47`

The capsule includes HG256 glyph bindings for its identity, scope, algorithm, and white-room state.

## White-Room Consumption

The white-room path consumes:

- signed capsule
- signature metadata
- detached transport packet
- detached packet signature
- schema reference
- hookwall policy
- GC policy

It then produces:

- a clean projection with no private key material
- a white-room reference record
- a glyph packet for bounded consumption by agents
- a detached packet plus detached signature for transport-safe agent intake

## Mistake / Gulp Law

- mistakes are append-only
- collect until `2000`
- gulp/checkpoint after threshold
- no proof deletion
- no history rewrite
- no mutation without replayable evidence

## Local Artifacts

Tracked:

- `schemas/crypto/crypto-capsule.v1.schema.json`
- `tools/crypto/crypto-capsule.js`
- `tools/crypto/Generate-Keypair.ps1`
- `tools/crypto/Sign-Capsule.ps1`
- `tools/crypto/Verify-Capsule.ps1`
- `tools/validate/Invoke-CryptoCapsule-Validate.ps1`
- `packets/crypto/crypto-capsule.v1.packet.json`
- `packets/crypto/crypto-capsule.v1.sig`

Local ignored/runtime:

- `data/vault/owner/crypto-capsule/*`
- `data/behcs/capsules/crypto/*`
- `data/behcs/hb2/white_room_capsule_refs.json`
- `data/behcs/hb2/white_room_crypto_capsule.packet.glyph256`
- `data/behcs/maps/crypto-capsule-hookwall-policy.json`
- `data/behcs/maps/crypto-capsule-gc-policy.json`
- `reports/crypto/*`

## Transport / Intake Rules

- detached packet must bind `schemaId`, `signerId`, `owner`, `payloadSha256`, `whiteRoomRefId`, and `gatesReportPath`
- detached packet signature must bind `packetSha256` and `sigSha256`
- HG256 transport stays ASCII-safe on this lane through a UTF-8 hex envelope, even when the live glyph view is symbolic
- agents only consume the clean projection after packet verify and white-room verify both pass

## Allowed Claims

- local cryptographic profile/capsule
- integrity attestation
- signature verify pass/fail
- local white-room clean projection
- local-only, fail-closed, append-only evidence

## Denied Claims

- unhackable
- universally secure
- confidentiality guaranteed
- remote trust
- public-release-ready
- production-ready security

## Acceptance

The capsule is only usable by agents when:

- schema checks pass
- sign/verify roundtrip passes
- clean projection exists
- white-room refs exist
- detached packet and detached packet signature exist
- append-only attest ledger exists
- gates report says pass
- no secret material appears in the clean projection or reports
