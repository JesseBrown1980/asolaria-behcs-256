# Item 031 · llama.cpp inventory on liris

Target: `C:/Users/rayss/Asolaria-BEHCS-256/` + `C:/Users/rayss/Downloads/`

## Discovery (via direct-wire SMB probe)

- **No llama.cpp binaries** confirmed yet in liris shared paths (`data/cubes/`, `data/votes/`, `data/safety-backups/`).
- Kuromi USB (offline) may hold prior builds per incident 2026-03-30.
- Search-path suggestions for liris to self-inventory:
  - `C:\Users\rayss\llama.cpp\`
  - `C:\Users\rayss\Downloads\llama*.exe`
  - `C:\Users\rayss\Downloads\ggml*.bin` `.gguf`
  - `C:\Users\rayss\Asolaria-BEHCS-256\tools\llm\`

## Acer-side

- No llama.cpp binaries present on acer side.
- `services/gnn-sidecar/` has PyTorch models (5 GNN families); NOT an LLM runtime.

## Action

Request `EVT-LIRIS-LLAMACPP-INVENTORY-REPLY` with found binaries + ggufs + shas. Until received, wrapper (item 035) builds against the CLI contract, not a specific binary.
