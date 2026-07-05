# Free Model Possibility Ladder (2026-07-05)

Status: MEASURED_FABRIC_LIVE for the Asolaria /api/free-agents lane; POSSIBILITY for external free/provider catalogs until a key, local provider, or one-call receipt proves a live completion.

## Level 0 - Measured Fabric Live

Acer fabric /api/free-agents reports five $0 on-demand models:

- opencode/big-pickle
- opencode/hy3-preview-free
- opencode/ling-2.6-flash-free
- opencode/minimax-m2.5-free
- opencode/nemotron-3-super-free

Driver: 	ools/behcs/fabric-real-free-agent-driver.mjs
First verified envelope: 638828a8 from big-pickle 89s VERIFIED

## Level 1 - Liris Proxy Ready

Operator-provided Liris-side receipt states ree-claude-code is cloned at commit 55131019e18aedcf25b4ba85e0a025d2a9e0f1f1 and running a local Claude-compatible proxy at http://127.0.0.1:8082.

Validated Liris local routes in that receipt:

- /health returned healthy.
- / returned provider lmstudio, model lmstudio/local-model.
- /v1/models returned a Claude-compatible model list.
- /v1/messages/count_tokens returned input_tokens=5.

Boundary: no live upstream provider answer was proven in that Liris receipt. LM Studio :1234 and llama.cpp :8080 were not listening, and provider keys were not loaded.

## Level 2 - Proxy Supported, Provider Needed

The proxy/provider layer can become live through configured providers or local servers. These lanes remain POSSIBILITY until a provider key/grant or local server is present and a one-call receipt is sealed.

- DeepSeek direct API: keyed OpenAI/Anthropic-compatible route.
- NVIDIA NIM direct API: keyed route.
- OpenRouter route: keyed router, with free model variants available in catalog.
- LM Studio local: needs local server on 127.0.0.1:1234.
- llama.cpp local: needs local server on 127.0.0.1:8080.

## Level 3 - Public Free Catalog Possibilities

Acer pulled the OpenRouter public model catalog from https://openrouter.ai/api/v1/models on 2026-07-05.

- Total catalog entries: 340
- Free or zero-price candidates extracted: 26

First candidates:

- $(@{id=cognitivecomputations/dolphin-mistral-24b-venice-edition:free; canonical_slug=venice/uncensored; hugging_face_id=cognitivecomputations/Dolphin-Mistral-24B-Venice-Edition; name=Venice: Uncensored (free); created=1752094966; description=Venice Uncensored Dolphin Mistral 24B Venice Edition is a fine-tuned variant of Mistral-Small-24B-Instruct-2501, developed by dphn.ai in collaboration with Venice.ai. This model is designed as an “uncensored” instruct-tuned LLM, preserving...; context_length=32768; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=2024-04-30; expiration_date=; links=}.id) - Venice: Uncensored (free)
- $(@{id=cohere/north-mini-code:free; canonical_slug=cohere/north-mini-code-20260617; hugging_face_id=CohereLabs/North-Mini-Code-1.0; name=Cohere: North Mini Code (free); created=1781723748; description=North Mini Code is Cohere's first agentic coding model and the debut of its North family. A sparse mixture-of-experts model with 30B total parameters and 3B active, it is optimized...; context_length=256000; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=; expiration_date=; links=; reasoning=}.id) - Cohere: North Mini Code (free)
- $(@{id=google/gemma-4-26b-a4b-it:free; canonical_slug=google/gemma-4-26b-a4b-it-20260403; hugging_face_id=google/gemma-4-26B-A4B-it; name=Google: Gemma 4 26B A4B  (free); created=1775227989; description=Gemma 4 26B A4B IT is an instruction-tuned Mixture-of-Experts (MoE) model from Google DeepMind. Despite 25.2B total parameters, only 3.8B activate per token during inference — delivering near-31B quality at...; context_length=262144; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=; expiration_date=; links=; benchmarks=; reasoning=}.id) - Google: Gemma 4 26B A4B  (free)
- $(@{id=google/gemma-4-31b-it:free; canonical_slug=google/gemma-4-31b-it-20260402; hugging_face_id=google/gemma-4-31B-it; name=Google: Gemma 4 31B (free); created=1775148486; description=Gemma 4 31B Instruct is Google DeepMind's 30.7B dense multimodal model supporting text and image input with text output. Features a 256K token context window, configurable thinking/reasoning mode, native function...; context_length=262144; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=; expiration_date=; links=; benchmarks=; reasoning=}.id) - Google: Gemma 4 31B (free)
- $(@{id=google/lyria-3-clip-preview; canonical_slug=google/lyria-3-clip-preview-20260330; hugging_face_id=; name=Google: Lyria 3 Clip Preview; created=1774907255; description=30 second duration clips are priced at $0.04 per clip. Lyria 3 is Google's family of music generation models, available through the Gemini API. With Lyria 3, you can generate...; context_length=1048576; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=; expiration_date=; links=}.id) - Google: Lyria 3 Clip Preview
- $(@{id=google/lyria-3-pro-preview; canonical_slug=google/lyria-3-pro-preview-20260330; hugging_face_id=; name=Google: Lyria 3 Pro Preview; created=1774907286; description=Full-length songs are priced at $0.08 per song. Lyria 3 is Google's family of music generation models, available through the Gemini API. With Lyria 3, you can generate high-quality, 48kHz...; context_length=1048576; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=; expiration_date=; links=}.id) - Google: Lyria 3 Pro Preview
- $(@{id=liquid/lfm-2.5-1.2b-instruct:free; canonical_slug=liquid/lfm-2.5-1.2b-instruct-20260120; hugging_face_id=LiquidAI/LFM2.5-1.2B-Instruct; name=LiquidAI: LFM2.5-1.2B-Instruct (free); created=1768927521; description=LFM2.5-1.2B-Instruct is a compact, high-performance instruction-tuned model built for fast on-device AI. It delivers strong chat quality in a 1.2B parameter footprint, with efficient edge inference and broad runtime support.; context_length=32768; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=; expiration_date=; links=}.id) - LiquidAI: LFM2.5-1.2B-Instruct (free)
- $(@{id=liquid/lfm-2.5-1.2b-thinking:free; canonical_slug=liquid/lfm-2.5-1.2b-thinking-20260120; hugging_face_id=LiquidAI/LFM2.5-1.2B-Thinking; name=LiquidAI: LFM2.5-1.2B-Thinking (free); created=1768927527; description=LFM2.5-1.2B-Thinking is a lightweight reasoning-focused model optimized for agentic tasks, data extraction, and RAG—while still running comfortably on edge devices. It supports long context (up to 32K tokens) and is...; context_length=32768; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=; expiration_date=; links=; reasoning=}.id) - LiquidAI: LFM2.5-1.2B-Thinking (free)
- $(@{id=meta-llama/llama-3.2-3b-instruct:free; canonical_slug=meta-llama/llama-3.2-3b-instruct; hugging_face_id=meta-llama/Llama-3.2-3B-Instruct; name=Meta: Llama 3.2 3B Instruct (free); created=1727222400; description=Llama 3.2 3B is a 3-billion-parameter multilingual large language model, optimized for advanced natural language processing tasks like dialogue generation, reasoning, and summarization. Designed with the latest transformer architecture, it...; context_length=131072; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=2023-12-31; expiration_date=; links=}.id) - Meta: Llama 3.2 3B Instruct (free)
- $(@{id=meta-llama/llama-3.3-70b-instruct:free; canonical_slug=meta-llama/llama-3.3-70b-instruct; hugging_face_id=meta-llama/Llama-3.3-70B-Instruct; name=Meta: Llama 3.3 70B Instruct (free); created=1733506137; description=The Meta Llama 3.3 multilingual large language model (LLM) is a pretrained and instruction tuned generative model in 70B (text in/text out). The Llama 3.3 instruction tuned text only model...; context_length=131072; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=2023-12-31; expiration_date=; links=; benchmarks=}.id) - Meta: Llama 3.3 70B Instruct (free)
- $(@{id=nousresearch/hermes-3-llama-3.1-405b:free; canonical_slug=nousresearch/hermes-3-llama-3.1-405b; hugging_face_id=NousResearch/Hermes-3-Llama-3.1-405B; name=Nous: Hermes 3 405B Instruct (free); created=1723766400; description=Hermes 3 is a generalist language model with many improvements over Hermes 2, including advanced agentic capabilities, much better roleplaying, reasoning, multi-turn conversation, long context coherence, and improvements across the...; context_length=131072; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=2023-12-31; expiration_date=; links=}.id) - Nous: Hermes 3 405B Instruct (free)
- $(@{id=nvidia/nemotron-3-nano-30b-a3b:free; canonical_slug=nvidia/nemotron-3-nano-30b-a3b; hugging_face_id=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16; name=NVIDIA: Nemotron 3 Nano 30B A3B (free); created=1765731275; description=NVIDIA Nemotron 3 Nano 30B A3B is a small language MoE model with highest compute efficiency and accuracy for developers to build specialized agentic AI systems. The model is fully...; context_length=256000; architecture=; pricing=; top_provider=; per_request_limits=; supported_parameters=System.Object[]; default_parameters=; supported_voices=; knowledge_cutoff=; expiration_date=; links=; benchmarks=; reasoning=}.id) - NVIDIA: Nemotron 3 Nano 30B A3B (free)

The complete extracted table is in openrouter-free-models-20260705.csv.

## Level 4 - Adapter Needed

Mistral direct API is a keyed chat-completions API and should be treated as adapter-needed for ree-claude-code unless routed through OpenRouter or a direct Mistral provider adapter is added.

## Boundaries

- POSSIBILITY does not mean live absorbed runtime.
- Free model does not mean unlimited model.
- Public API does not mean no-key API.
- Remote GPU call requires provider availability and one-call HBP/HBI/SHA receipt.
- Do not collapse the measured Asolaria free-agent lane into unverified absence just because a separate provider key is missing.

## Official Source URLs

- https://openrouter.ai/docs/quickstart
- https://openrouter.ai/docs/faq
- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/quick_start/pricing
- https://docs.mistral.ai/api/
- https://docs.mistral.ai/studio-api/conversations/chat-completion