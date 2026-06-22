# Zora LiveKit Voice Agent

A production-ready voice agent SDK built on [LiveKit Agents](https://docs.livekit.io/agents/) with Azure AI services. Three agent modes, browser mic/speaker UI, per-turn latency benchmarking, and Langfuse observability — containerised with Docker.

---

## One-command setup

**Mac / Linux:**
```bash
git clone <repo-url> && cd voice_agent && ./setup.sh
```

**Windows (PowerShell):**
```powershell
git clone <repo-url>; cd voice_agent; .\setup.ps1
```

The setup script will:
1. Check Docker and uv are installed
2. Prompt for your Azure credentials and create `.env`
3. Install Python dependencies via `uv`
4. Build and start the full Docker stack
5. Open **http://localhost:8080** in your browser

---

## Prerequisites

| Tool | Mac | Windows |
|------|-----|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | `brew install --cask docker` | Download installer |
| [uv](https://docs.astral.sh/uv/installation/) | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | `winget install astral-sh.uv` |

**Azure resources required:**
- Azure AI Services resource with an OpenAI model deployment (e.g. `gpt-4.1-mini`)
- Azure Speech service — the same API key works for both Speech and OpenAI on a unified resource

---

## Architecture

```
Browser (mic + speakers)
        │  WebRTC
        ▼
  LiveKit Server ──────────────────────────────────────────────┐
        │                                                        │
        │  audio frames                                          │
        ▼                                                        │
  Voice Agent (Docker)                                          │
  ┌─────────────────────────────────────────────────────┐      │
  │  Pipeline      Azure STT → gpt-5.4-mini → Azure TTS │      │
  │  Voice Live    Azure Voice Live API (gpt-4.1-mini)  │      │
  │  GPT Realtime  Voice Live API (gpt-realtime-1.5)    │      │
  └──────────────────────┬──────────────────────────────┘      │
                         │ OTEL traces                          │
                         ▼                                       │
                    Langfuse                                     │
                                                                 │
  Management UI (http://localhost:8080) ───────────────────────┘
  Agent selector · Start/Stop · Browser mic · Latency bench
```

---

## Project structure

```
voice_agent/
├── setup.sh              ← Mac/Linux one-command setup
├── setup.ps1             ← Windows one-command setup
├── Makefile              ← dev shortcuts
├── .env.example          ← credential template
├── docker-compose.yml    ← full stack (LiveKit · Postgres · Valkey · UI)
├── docker-compose.prod.yml ← EC2/Linux production override
├── Dockerfile
│
├── server.py             ← FastAPI backend (API + agent lifecycle)
├── frontend/
│   └── index.html        ← browser UI (agent selector + mic client)
│
├── agent.py              ← Pipeline agent (Azure STT → LLM → Azure TTS)
├── agent_voice_live.py   ← Voice Live agent (Azure all-in-one ~1.2 s)
├── agent_realtime.py     ← GPT Realtime agent (native audio ~1.2 s)
├── langfuse_setup.py     ← OpenTelemetry / Langfuse tracing setup
│
├── pyproject.toml        ← Python dependencies (managed by uv)
└── uv.lock               ← pinned dependency versions
```

---

## Agent modes

| Mode | Model | E2E latency | Pipeline |
|------|-------|-------------|----------|
| **Pipeline** | gpt-5.4-mini | ~5 s | Azure STT → LLM → Azure TTS |
| **Voice Live** | gpt-4.1-mini | ~1.2 s | Azure Voice Live (all-in-one) |
| **GPT Realtime** | gpt-realtime-1.5 | ~1.2 s | Voice Live with native audio |

**Choosing a mode:**
- **Pipeline** — maximum flexibility; swap any component independently
- **Voice Live** — best cost/latency balance for production
- **GPT Realtime** — highest transcription accuracy, similar latency to Voice Live

---

## Configuration

All settings via `.env`. Run `./setup.sh` to generate it interactively, or copy `.env.example` and fill manually.

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_OPENAI_ENDPOINT` | Azure AI Services endpoint | `https://my-resource.services.ai.azure.com` |
| `AZURE_OPENAI_API_KEY` | API key | `abc123...` |
| `CHAT_DEPLOYMENT_NAME` | Your model deployment name | `gpt-4.1-mini` |
| `AZURE_SPEECH_KEY` | Azure Speech key (same as OpenAI key on unified resource) | `abc123...` |
| `AZURE_SPEECH_REGION` | Azure region | `swedencentral` |
| `LIVEKIT_API_KEY` | LiveKit key (`devkey` for local) | `devkey` |
| `LIVEKIT_API_SECRET` | LiveKit secret (`devsecret` for local) | `devsecret` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_INSTRUCTIONS` | helpful assistant prompt | Custom system prompt |
| `AGENT_VOICE` | `en-US-AvaNeural` | Any [Azure Neural voice](https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts) |
| `LIVEKIT_NODE_IP` | `127.0.0.1` | Set to server IP for cloud deployment |
| `LIVEKIT_PUBLIC_URL` | `ws://localhost:7880` | Browser-facing LiveKit URL |
| `LANGFUSE_PUBLIC_KEY` | — | Langfuse tracing (optional) |
| `LANGFUSE_SECRET_KEY` | — | Langfuse tracing (optional) |
| `LANGFUSE_BASE_URL` | — | Langfuse server URL |

### Customising the agent

Change the personality and voice without touching code:
```bash
AGENT_INSTRUCTIONS="You are a customer support agent for Acme Corp. Be friendly and concise."
AGENT_VOICE=en-US-JennyNeural
```

---

## Running

### Docker (recommended)

```bash
# Mac / Linux
make docker        # or: docker compose up -d --build

# Windows
docker compose up -d --build
```

All services (LiveKit, Postgres, Valkey, voice agent UI) run in containers.

### Native (Mac / Linux dev — faster iteration)

```bash
# Start infrastructure only
docker compose up -d postgres valkey livekit

# Run backend
uv run --project . python server.py

# In a second terminal, run an agent directly
uv run --project . python agent_voice_live.py connect --room voice-room
```

### Available `make` commands

```
make setup       — interactive first-time setup
make docker      — start full Docker stack
make docker-prod — EC2 production (AMD64 + host network)
make dev         — infra in Docker, backend native
make build-amd64 — build AMD64 image for deployment
make stop        — stop all containers
make logs        — stream voice-ui container logs
```

---

## Observability — Langfuse

When `LANGFUSE_*` vars are set, every turn is traced automatically:

```
agent_session
  └─ user_turn          (STT latency, EOU delay)
      └─ agent_turn
          ├─ llm_node   (TTFT, token count, cost)
          └─ tts_node   (TTFB, audio duration)
```

Traces appear at your Langfuse URL within seconds of each conversation turn.

---

## Latency benchmarking

Voice Live and GPT Realtime agents write per-turn latency data to `data/`:

```
data/bench_voice_live.jsonl
data/bench_realtime.jsonl
```

Each line:
```json
{"turn": 1, "e2e_ms": 1237, "stt_ms": 359, "response_done_ms": ..., "user_text": "...", "agent_text": "..."}
```

The UI's **Benchmark** panel shows the last 10 turns with E2E bar charts.

---

## Deployment (EC2 / Linux)

```bash
# 1. Clone on server
git clone <repo-url>
cd voice_agent

# 2. Configure
cp .env.example .env
# Edit .env — set LIVEKIT_NODE_IP to your server's private IP
#             set LIVEKIT_PUBLIC_URL to your public IP or domain

# 3. Launch (AMD64 + host networking)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`docker-compose.prod.yml` enables `network_mode: host` so Docker agents can reach LiveKit's WebRTC UDP ports via the host's port mappings.

---

## Adding a custom agent

1. Create `agent_custom.py` following the pattern in `agent_voice_live.py`
2. Register it in `server.py`:

```python
AGENTS = {
    ...
    "custom": {
        "label":      "My Agent",
        "subtitle":   "Your description",
        "model":      "gpt-4.1",
        "file":       "agent_custom.py",
        "bench_file": "data/bench_custom.jsonl",
        "e2e_target": 1000,
        "color":      "#8b5cf6",
    },
}
```

3. Rebuild: `make docker`

---

## Stack

| Component | Technology |
|-----------|-----------|
| Voice agent framework | [livekit-agents](https://docs.livekit.io/agents/) 1.6 |
| STT | Azure Cognitive Services Speech |
| LLM | Azure OpenAI (gpt-4.1-mini / gpt-5.4-mini) |
| TTS | Azure Neural TTS |
| All-in-one (Voice Live / Realtime) | Azure Voice Live API |
| WebRTC media server | LiveKit Server |
| Backend | FastAPI + uvicorn |
| Observability | Langfuse + OpenTelemetry |
| Package manager | uv |
| Infrastructure | Docker Compose |
