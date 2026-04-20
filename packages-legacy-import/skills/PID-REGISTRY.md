# PID Registry

## Active Session
| Role | PID | OS PID | Machine | IP | Since |
|------|-----|--------|---------|-----|-------|
| Liris | liris-session-17368 | 17368 | DESKTOP-PTSQTIE | 192.168.15.170 | 2026-03-23T20:00:00Z |

## Virtual PID Format
`role-YYYYMMDDHHMMSS-hash` (4 char hash)
Example: `helm-20260324062203-vlmc`

Convergence: both Gaia (IX) and Liris (LX) use identical format.

## PID Lifecycle
```
spawnContextBuilder.buildSpawnContext("helm")
  → mintSpawnPid("helm") → "helm-20260324062203-vlmc"
  → registerSpawnPid("helm", pid) → written to data/spawn-pid-registry.json
  → identity handshake: "I am Helm, spawn-PID helm-20260324062203-vlmc"
  → agent works
  → despawnPid("helm") → moved to history[], capped at 100
  → next spawn gets fresh PID
```

## File-Based Registry
`data/spawn-pid-registry.json` — survives restarts (Liris design, adopted by Gaia)
- `active{}` — currently spawned agents by role
- `history[]` — despawned agents, capped at 100 entries

## Skills Created by PID 17368

| Folder | ID | Title | Date |
|--------|----|-------|------|
| whatsapp-adb-send | whatsapp.adb.send | WhatsApp ADB Send Message | 2026-03-23T23:14:05Z |
| voice-transcribe-local | voice.transcribe.local | Local Voice Transcription (Whisper) | 2026-03-24T04:30:00Z |
| voice-tts-local | voice.tts.local | Local Text-to-Speech (Kitty TTS) | 2026-03-24T04:30:00Z |
| meeting-record | meeting.record | Start Meeting Recording Worker | 2026-03-24T04:30:00Z |
| meeting-caption-ocr | meeting.caption.ocr | Meeting Caption OCR Bridge | 2026-03-24T04:30:00Z |
| voice-meeting-inject | voice.meeting.inject | Voice Meeting Injection — Stealth Listen and Speak | 2026-03-24T04:30:00Z |

## Skills Without PID Attribution

50 of 61 skills have no `createdBy` field. 35 are codex-ref wrappers with host-dependent Codex references.
See skills/CATALOG.md "Codex Reference Wrappers" section for details.

## Cross-Colony PID Tracking

| Colony | Registry Location | Format |
|--------|-------------------|--------|
| Liris (LX) | data/spawn-pid-registry.json | File-based, persistent |
| Gaia (IX) | data/spawn-pid-registry.json | File-based, persistent (merged from Liris) |

Both colonies use the same PID format and file-based registry.
spawnContextBuilder is the PID controller (P-I-D: Proportional-Integral-Derivative).
See LX-122 (identity handshake), LX-249 (self-indexing rule).
