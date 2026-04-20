# Item 032 · Mux binaries + configs inventory

"Mux" in our federation = local-LLM routing layer (similar to LiteLLM / Ollama / llama-swap).

## Candidates

| Runtime | Binary | Config | Status |
|---|---|---|---|
| llama.cpp | `llama-server` / `main` | GGUF paths + `-c` ctx + `-t` threads | see item 031 |
| Ollama | `ollama` | `~/.ollama/models/` | not confirmed on either side |
| LiteLLM | Python module | `litellm_config.yaml` | pip-installable |
| Anthropic-CLI | `anthropic_cli` | env `ANTHROPIC_API_KEY` | existing connector in packages-legacy-import/src/connectors/anthropicCliConnector.js |

## Decision

Mux wrapper (item 036) will abstract runtime so Rose/Oracle pick whichever they have. Default selector rules live in `src/llm/pick-runtime.js` (item 038).
