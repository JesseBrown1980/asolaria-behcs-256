# BEHCS Omnidirectional Mirror — White Room Engineering Plan

**BEHCS** = Brown (Jesse) - Edens (Dan) - Hilbert (Peter) - Chiqueto (Rayssa) - Smith (Felipe)

## What the OLD system was

ADB-based unidirectional control:
- Acer → Phone: tap, swipe, type, key, intent (ADB shell input)
- Phone → Acer: screenshots (ADB screencap pipe), Termux stdout
- NO phone-initiated messages to acer
- NO phone-to-phone communication
- NO stealth/shadow modes
- Dashboard is view-only from phone browser (mobile-console.html)

## What the NEW system must be

**Omnidirectional**: every device talks to every device, any direction, any time.

```
     ┌─────────┐     ┌─────────┐
     │  ACER   │◄───►│  LIRIS  │
     │ (Jesse) │     │(Rayssa) │
     └────┬────┘     └────┬────┘
          │               │
    ┌─────┼───────────────┼─────┐
    │     │    BEHCS BUS   │     │
    │     ▼               ▼     │
    │  ┌──────┐      ┌───────┐  │
    │  │FALCON│◄────►│FELIPE │  │
    │  │(Jesse│      │(Smith)│  │
    │  │ S24) │      │ A06)  │  │
    │  └──┬───┘      └───┬───┘  │
    │     │              │      │
    │     ▼              ▼      │
    │  ┌──────┐     ┌───────┐   │
    │  │BEAST │     │  DAN   │   │
    │  │(S22U)│     │(remote)│   │
    │  └──────┘     └───────┘   │
    └───────────────────────────┘
```

## Three modes per channel

1. **REAL (visible)** — messages appear in terminal/dashboard, logged, audited
2. **SHADOW** — messages flow but are only visible in shadow-mode dashboards, logged to shadow audit
3. **STEALTH** — encrypted end-to-end, no dashboard display, logged only to vault

Each channel between any two devices operates in one of these three modes independently.

## Task List

### Phase 0: BEHCS Bus Protocol
- [ ] Define the universal message envelope (cube-addressed, 47D tagged)
- [ ] Define the 256-hash symbol system (BEHCS encoding)
- [ ] Message types: heartbeat, command, data, inference, cosign, error
- [ ] Mode field: real | shadow | stealth

### Phase 1: Transport Layer
- [ ] HTTP endpoint on every device: `/behcs/send` + `/behcs/receive` + `/behcs/health`
- [ ] Device registry with auto-discovery (mDNS or broadcast)
- [ ] Bearer token auth per device pair (from vault)
- [ ] ADB reverse for USB-connected phones → localhost tunnel
- [ ] WiFi direct for LAN devices
- [ ] GitHub webhook for Dan (remote participant)

### Phase 2: Phone → Computer (the missing direction)
- [ ] Termux HTTP server on Falcon (port 4913 mirrored)
- [ ] Phone-initiated messages to acer via `/behcs/send`
- [ ] Phone push notifications via web push (already have `mobile-push-sw.js`)
- [ ] Falcon Claude Code → acer agent-keyboard bridge

### Phase 3: Device → Device (phone to phone)
- [ ] Falcon → Felipe via WiFi direct or acer relay
- [ ] Felipe → Falcon same path
- [ ] Beast → any (USB MTP bridge via acer)

### Phase 4: Shadow + Stealth Modes
- [ ] Shadow audit log (separate from main audit)
- [ ] Stealth encryption layer (7zip AES-256 per message)
- [ ] Mode switching per channel via `/behcs/mode`
- [ ] Dashboard toggle: real/shadow/stealth view filter

### Phase 5: Dashboard
- [ ] Unified BEHCS dashboard showing all devices + all channels
- [ ] Real-time message flow visualization
- [ ] Mode indicators per channel (green=real, blue=shadow, red=stealth)
- [ ] Device health heartbeats

### Phase 6: Cube Integration
- [ ] Every message carries 47D cube coordinates
- [ ] Messages flow through hookwall → GNN → shannon gate pipeline
- [ ] Findings indexed in data/cubes/ per device
- [ ] Intersection engine tracks device connectivity as cube points

## Cube Alignment

- Primary: D34 CROSS_COLONY (2685619) — cross-device dispatch
- Primary: D26 OMNIDIRECTIONAL (1030301) — bilateral control
- Secondary: D38 ENCRYPTION (4330747) — stealth mode
- Secondary: D31 SHADOW_MIRROR (2048383) — shadow mode
- Secondary: D44 HEARTBEAT (7189057) — device liveness

## The 256-Hash Symbol System

The BEHCS encoding uses 256 hash symbols to represent the cube language in a device-native format:
- Each symbol is a sha256 hash of a (dim, value) pair
- 256 symbols cover the most-used cube coordinates
- Unknown coordinates fall back to full 47D tuple encoding
- Devices store a local symbol table (256 entries, ~8KB)
- Symbol table syncs via the BEHCS bus itself

This is the BEHCS hypercube language — device-specific, agent-specific, location-aware, time-stamped, linked, chained, cubed.
