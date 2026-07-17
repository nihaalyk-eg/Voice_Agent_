# The Three Agent Implementations

`app/agents/` contains three interchangeable agents, selectable per-call from the sidebar. They share the same env-var contract (see [voice-agent-overview.md](voice-agent-overview.md)) and the same LiveKit worker-registration pattern, but are built very differently internally — because two of them wrap an already-complete speech-to-speech API, while one assembles STT/LLM/TTS as separate stages.

| | Pipeline | Voice Live | Realtime API |
|---|---|---|---|
| File | `app/agents/agent.py` | `app/agents/agent_voice_live.py` | `app/agents/agent_realtime.py` |
| Backing service | Azure Speech (STT+TTS) + Azure OpenAI (LLM) — three separate calls | Azure Voice Live API — one duplex websocket | Azure-hosted GPT Realtime — one duplex websocket |
| LiveKit Agents SDK usage | Full `Agent`/`AgentSession` framework | Raw `JobContext`/`WorkerOptions` only; hand-rolled audio | Raw `JobContext`/`WorkerOptions` only; hand-rolled audio |
| Turn detection | Silero VAD (`inference.VAD`, silence-duration based) | Azure semantic VAD (model-based) | OpenAI-style semantic VAD (model-based) |
| `e2e_target` | 5083 ms | 470 ms | 1212 ms |

## Pipeline (`agent.py`)

The only one of the three built on the LiveKit Agents SDK's high-level abstractions.

- **Entrypoint**: `async def entrypoint(ctx: JobContext)`. Calls `await ctx.connect()`, sets up Langfuse tracing keyed by room name, registers a shutdown hook to flush traces.
- **Session**: a single `AgentSession(vad=..., stt=..., llm=..., tts=...)` wires together:
  - `inference.VAD(model="silero", min_silence_duration=0.6, activation_threshold=0.5, prefix_padding_duration=0.5)` — classic energy-based end-of-utterance detection.
  - `azure.STT` / `azure.TTS` (`livekit.plugins.azure`, using `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`).
  - `openai.LLM.with_azure(...)` (`livekit.plugins.openai`, using `AZURE_OPENAI_ENDPOINT`/`AZURE_OPENAI_API_KEY`/`CHAT_DEPLOYMENT_NAME`).
  - `session.start(room=ctx.room, agent=VoiceAgent(...))` hands off to a subclass of `Agent` — the SDK handles audio track publish/subscribe, STT/TTS orchestration, and interruption automatically.
- **Tools**: `collect_field`, `search_customer`, `create_work_order`, `switch_language` are `@llm.function_tool`-decorated methods on `VoiceAgent`. `switch_language` hot-swaps the live STT/TTS instances via `update_options()` without restarting the session.
- **Customer DB mode**: if `AGENT_CDB_MODE=1` and `AGENT_CALLER_PHONE` is set, looks up the caller via `cdb_tools.lookup_by_phone()` *before* the session starts, to build a personalized greeting and pre-resolve the caller's preferred language. Otherwise falls back to a manual flow asking for the caller's name.
- **History truncation**: conversation history is capped at `MAX_HISTORY_MESSAGES = 10` to bound context size/latency.
- **Metrics**: per-turn latency is read off `AgentSession`'s built-in `ChatMessage.metrics` (via the `conversation_item_added` event) — the only agent of the three that gets this for free from the SDK rather than hand-timing with `time.perf_counter()`. Logged to `data/bench_pipeline.jsonl`.
- **Why it's slower**: STT, LLM, and TTS are three separate network round trips per turn, run in sequence.

## Voice Live (`agent_voice_live.py`)

A raw websocket bridge to Azure's Voice Live API — not built on `AgentSession`, because Voice Live is already a complete speech-to-speech service; there's no separate STT/LLM/TTS to plug in.

- **Entrypoint**: `await ctx.connect()`, then explicitly `await ctx.wait_for_participant()` before doing anything else (unlike Pipeline, where `AgentSession` handles this implicitly).
- **Audio path**: creates its own outbound `rtc.AudioSource`/`rtc.LocalAudioTrack` and publishes it to the room manually. Two concurrent tasks:
  - `send_audio()` — reads mic frames from the LiveKit room, forwards base64 PCM to the websocket as `input_audio_buffer.append` events.
  - `recv_audio()` — reads websocket events (`speech_started`/`speech_stopped`, transcription-completed, function calls, `response.audio.delta`, `response.done`), republishes transcripts into the room and synthesized audio into the LiveKit track.
  - Both run under `asyncio.wait(..., return_when=FIRST_COMPLETED)` alongside a room-disconnect watcher.
- **Session config sent over the websocket**: `turn_detection: { type: "azure_semantic_vad", silence_duration_ms: 500, interrupt_response: true, remove_filler_words: true }`, plus `azure_deep_noise_suppression` and `server_echo_cancellation`.
- **Tool calling**: shared with Realtime API via `app/tools/realtime_tools.py` (`build_cdb_instructions`, `build_tools_schema`, `execute_tool`) since both speak the same OpenAI/Azure Realtime-style tool-calling protocol. On `response.function_call_arguments.done`, executes the tool, replies with `conversation.item.create` (`function_call_output`), then `response.create` to resume the model.
- **Metrics**: hand-timed with `time.perf_counter()` between `speech_stopped` (end of user turn) and the first `response.audio.delta` byte. Logged to `data/bench_voice_live.jsonl`.
- **Why it's fastest**: a single full-duplex connection doing STT+LLM+TTS server-side, with Azure's own low-latency semantic VAD — no separate round trips.

## Realtime API (`agent_realtime.py`)

Structurally near-identical to Voice Live (same author pattern, same shared `realtime_tools.py`) — the difference is the model and turn-detection/transcription config.

- **Model**: `REALTIME_DEPLOYMENT_NAME` env var (default `gpt-realtime-1.5`) — a separate deployment from the chat-completion model used by Pipeline/Voice Live, since this is the GPT Realtime model family.
- **Turn detection**: `turn_detection: { type: "semantic_vad", eagerness: "medium" }` — OpenAI-style, no silence-duration/interrupt/filler-word knobs.
- **Transcription**: `input_audio_transcription: { model: "gpt-4o-transcribe" }` vs. Voice Live's `"azure-speech"`.
- Everything else — audio track publish, `send_audio`/`recv_audio` tasks, CDB/Form-mode branching, bench file (`data/bench_realtime.jsonl`) — mirrors `agent_voice_live.py`.
- **Why it's in between**: full-duplex like Voice Live, but a different model/transcription pipeline with different latency characteristics.

## Cross-cutting

- All three read the same env-var contract from `server.py`: `AGENT_VOICE`, `AGENT_LANGUAGE`, `AGENT_PROACTIVE`, `AGENT_CONFIG` (Form mode), `AGENT_INSTRUCTIONS` (Simple mode), `AGENT_CDB_MODE`, `AGENT_CALLER_PHONE`, `LIVEKIT_AGENT_NAME`.
- All three load the same default system prompt from `prompts/system_prompt.txt`.
- Form mode (a JSON schema of fields to collect) is supported in all three — inline in `agent.py`, via `realtime_tools.build_form_instructions` in the other two.
- All three register as a LiveKit worker identically: `cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name=os.environ.get("LIVEKIT_AGENT_NAME", "")))` — see [livekit-integration.md](livekit-integration.md) for why this specific `agent_name` matters.
