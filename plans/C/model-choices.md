# Item 033 · Target model choices

Per federation agent role profiles (PLN/EXP/BLD/REV). Two size tiers:

| Tier | Model | Quant | GGUF size | Target hardware | Role fit |
|---|---|---|---|---|---|
| 7B | Llama-3.1-8B-Instruct | Q4_K_M | ~4.7 GB | 16 GB RAM / any CPU | EXP + REV light |
| 7B | Mistral-7B-Instruct-v0.3 | Q4_K_M | ~4.4 GB | 16 GB RAM / any CPU | EXP alt |
| 13B | Llama-3.3-Nemotron-Super-49B-v1 (big) | Q4_K_S | ~28 GB | 64 GB RAM preferred | BLD + PLN |
| 13B | Qwen2.5-Coder-14B-Instruct | Q4_K_M | ~8.3 GB | 24 GB RAM | BLD (code-heavy) |
| 13B | Nous-Hermes-2-Mixtral-8x7B | Q4_K_M | ~26 GB | 64 GB RAM | PLN (reasoning) |

**SHA manifest** — computed on actual download, enforced by item 041 (signed-model/manifest.json).

**Policy:**
- Never download models into repo (`.gitignore` bars them).
- Store models under `signed-model/` (local dir, `.gitignore`d).
- Publish sha manifest + URL in repo (text only).

**Default pick:**
- Low-end applicant: Llama-3.1-8B Q4_K_M
- Mid: Qwen2.5-Coder-14B Q4_K_M
- High: Nemotron-Super-49B Q4_K_S
