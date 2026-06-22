# Zora LiveKit Voice Agent

A production-ready voice agent SDK built on [LiveKit Agents](https://docs.livekit.io/agents/) with Azure AI services. Three agent modes, browser mic/speaker UI, per-turn latency benchmarking, and Langfuse tracing — all in Docker.

## Architecture

```
Browser mic ──► LiveKit Server ──► Voice Agent ──► Azure AI
                                        │
                              ┌─────────┴──────────┐
                              │   Three agent modes  │
                              │  ─────────────────  │
                              │  Pipeline  ~5 s E2E  │
                              │  Voice Live ~1.2 s   │
                              │  GPT Realtime ~1.2 s │
                              └─────────────────────┘
```

## Prerequisites

| Tool | Mac | Windows |
|------|-----|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | `brew install --cask docker` | Download installer |
| [uv](https://docs.astral.sh/uv/) | `brew install uv` | `winget install astral-sh.uv` |
| Python 3.11+ | included with uv | included with uv |

**Azure resources required:**
- Azure OpenAI deployment (gpt-4.1-mini or similar)
- Azure AI Speech service (same resource key works for both)

---

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url>
cd voice_agent
cp .env.example .env
```

Edit `.env` and fill in your Azure credentials:
```
AZURE_OPENAI_ENDPOINT=https://your-resource.services.ai.azure.com
AZURE_OPENAI_API_KEY=your-key
CHAT_DEPLOYMENT_NAME=gpt-4.1-mini
AZURE_SPEECH_KEY=your-speech-key
AZURE_SPEECH_REGION=swedencentral
```

### 2. Install dependencies (first time only)

**Mac / Linux:**
```bash
uv sync
```

**Windows (PowerShell):**
```powershell
uv sync
```

### 3. Start the stack

**Mac / Linux:**
```bash
make docker
# or without make:
docker compose up -d --build
```

**Windows (PowerShell):**
```powershell
docker compose up -d --build
```

### 4. Open the UI

Go to **http://localhost:8080**, select an agent, click **▶ Start Agent**, then **🎤 Connect Mic**.

---

## Running options

### Option A — Full Docker (recommended)

```bash
docker compose up -d --build
```

All services run in containers. Browser handles audio via WebRTC.

### Option B — Native (Mac / Linux dev)

```bash
# Start infrastructure only
docker compose up -d postgres valkey livekit

# Run backend natively
uv run --project . python server.py

# In a separate terminal, run an agent
uv run --project . python agent_voice_live.py connect --room voice-room
```

### Option C — Windows native

```powershell
# Start infrastructure
docker compose up -d postgres valkey livekit

# Run backend
uv run --project . python server.py
```

> **Note:** On Windows, use `uv run --project . python ...` for all commands. `make` requires Git Bash or WSL.

---

## Configuration

All settings via environment variables in `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_OPENAI_ENDPOINT` | ✅ | Azure AI Services endpoint URL |
| `AZURE_OPENAI_API_KEY` | ✅ | API key |
| `CHAT_DEPLOYMENT_NAME` | ✅ | Your model deployment name |
| `AZURE_SPEECH_KEY` | ✅ | Azure Speech key (same key works) |
| `AZURE_SPEECH_REGION` | ✅ | e.g. `swedencentral` |
| `LIVEKIT_API_KEY` | ✅ | `devkey` for local dev |
| `LIVEKIT_API_SECRET` | ✅ | `devsecret` for local dev |
| `AGENT_INSTRUCTIONS` | — | Custom system prompt for the agent |
| `AGENT_VOICE` | — | Azure Neural voice (default: `en-US-AvaNeural`) |
| `LANGFUSE_PUBLIC_KEY` | — | Langfuse tracing (optional) |
| `LANGFUSE_SECRET_KEY` | — | Langfuse tracing (optional) |
| `LANGFUSE_BASE_URL` | — | Langfuse server URL (optional) |
| `LIVEKIT_NODE_IP` | — | Set to server IP for EC2 deployment |

### Custom agent personality

```bash
AGENT_INSTRUCTIONS="You are a customer support agent for Acme Corp. Be friendly and brief."
AGENT_VOICE=en-US-JennyNeural
```

---

## Agent modes

| Mode | Model | E2E latency | Best for |
|------|-------|-------------|----------|
| **Pipeline** | gpt-5.4-mini | ~5 s | Maximum control, swap any component |
| **Voice Live** | gpt-4.1-mini | ~1.2 s | Best cost/latency balance |
| **GPT Realtime** | gpt-realtime-1.5 | ~1.2 s | Highest quality transcription |

---

## Deployment (EC2 / Linux server)

```bash
# On your server
git clone <repo-url>
cd voice_agent
cp .env.example .env
# Edit .env — set LIVEKIT_NODE_IP to your server's private IP

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The `docker-compose.prod.yml` override enables host networking so Docker agents can reach LiveKit's WebRTC ports.

---

## Project structure

```
voice_agent/
├── server.py            — FastAPI backend (API + agent lifecycle)
├── frontend/
│   └── index.html       — Browser UI (agent selector + mic client)
├── agent.py             — Pipeline agent (Azure STT → LLM → TTS)
├── agent_voice_live.py  — Voice Live agent (Azure all-in-one)
├── agent_realtime.py    — GPT Realtime agent (native audio)
├── langfuse_setup.py    — OpenTelemetry / Langfuse tracing
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── pyproject.toml
└── .env.example
```

## Adding a custom agent

1. Create `agent_custom.py` following the same pattern as `agent_voice_live.py`
2. Register it in `server.py` under `AGENTS`:

```python
AGENTS = {
    ...
    "custom": {
        "label":      "My Agent",
        "subtitle":   "Custom description",
        "model":      "your-model",
        "file":       "agent_custom.py",
        "bench_file": "data/bench_custom.jsonl",
        "e2e_target": 1000,
        "color":      "#8b5cf6",
    },
}
```

3. Rebuild: `docker compose up -d --build voice-ui`
