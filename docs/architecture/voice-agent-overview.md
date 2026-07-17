# Voice Agent: System Overview

## Components

| Component | What it is | Where |
|---|---|---|
| Backend | FastAPI server: REST API, auth, LiveKit room/token management, agent process lifecycle, log streaming | `app/api/server.py` |
| Agent subprocesses | Three interchangeable implementations of the actual conversational agent | `app/agents/{agent,agent_voice_live,agent_realtime}.py` |
| Frontend | React SPA: call controls, live transcript, settings, Customer DB browser | `ui/src/` |
| Postgres | Customer DB (customers, properties, work orders) | `ops/docker-compose.yml`, seeded via `ops/seed/` |
| LiveKit | WebRTC SFU — carries the actual audio between browser and agent | see [livekit-integration.md](livekit-integration.md) |
| Valkey (Redis-compatible) | Cache | `ops/docker-compose.yml` |

The backend never touches raw audio. Its job is orchestration: it spawns/kills the agent subprocess, tells LiveKit which room to create and which worker to dispatch the job to, and mints tokens. All audio flows browser ↔ LiveKit ↔ agent subprocess directly.

## Agent config modes

Set per-call from the Settings panel, persisted in `localStorage` (`ui/src/hooks/useAgentConfig.js`):

- **Simple** — a single free-text system prompt (`AGENT_INSTRUCTIONS` env var).
- **Form Mode** — a JSON schema of `required_fields` the agent should collect from the caller (`AGENT_CONFIG` env var, parsed into a system prompt at agent startup).
- **Customer DB (cdb)** — the agent looks up the caller in Postgres (by caller ID or by name search mid-call), personalizes the greeting, and can create work orders. See below.

## Customer DB mode

- Enabled via `cdb_mode: true` in the `/agent/start/{id}` payload → `AGENT_CDB_MODE=1` env var on the subprocess.
- If a phone number is typed into the "Caller ID" box on the main screen, it's sent as `caller_phone` → `AGENT_CALLER_PHONE` env var. The agent looks this up **before the session starts** via `cdb_tools.lookup_by_phone()` — matching caller ID is done this way, never by asking the caller to speak their phone number aloud, because STT mangles spoken digits too unreliably for fuzzy matching.
- If no caller ID is set (or no match), the agent falls back to asking the caller for their name and calling the `search_customer` tool mid-conversation.
- `app/tools/cdb_tools.py` queries Postgres directly (via `psycopg`, `DATABASE_URL` env var) — there is no separate "customer API" microservice locally; `search_customers`, `lookup_by_phone`, and `create_work_order` are plain SQL against the `customers`/`work_orders` tables.
- The Postgres database is auto-seeded with 100 dummy customers, 5 properties, and 6 work orders on first boot (see [../../README.md](../../README.md) for the local dev setup and re-seeding).
- The **Customer DB** sidebar page (`ui/src/pages/customer-db/CustomerDBApp.jsx`) is a separate, always-available admin view: a searchable table of every seeded customer (via a `GET /customers` REST endpoint, independent of any live call) plus a live tail of the same SSE log stream used during calls.

## The full call lifecycle

1. **Frontend clicks "Start Call"** → `POST /agent/start/{agent_id}` with `{ voice, language, proactive, instructions | agent_config, cdb_mode, caller_phone }`.
2. **Backend** (`start_agent`, under a lock so rapid double-starts can't race):
   - Kills any previously running agent subprocess for this server instance (SIGTERM, then SIGKILL after a grace period).
   - Generates a fresh, unique room name and worker name (a new room per call — reusing one static name raced with LiveKit's worker-deregistration on hangup).
   - Maps the request payload to `AGENT_*` env vars and spawns `python -m app.agents.<module> dev` as a detached subprocess with its stdout/stderr piped back to the server.
   - Waits ~3s for the subprocess to register itself as a LiveKit worker, then creates the LiveKit room with an explicit agent dispatch pointing at that worker (see [livekit-integration.md](livekit-integration.md) for exactly how).
   - Returns `{status, agent, pid, room}` to the frontend.
3. **Frontend joins the room**: fetches a short-lived LiveKit token scoped to that room (`GET /token`), connects via `livekit-client`, and publishes its microphone track.
4. **LiveKit dispatches the pending job** to the matching worker once the browser participant joins — the agent's `entrypoint()` runs, connects to the same room, and (depending on which agent implementation is active) either lets the LiveKit Agents SDK handle STT/LLM/TTS, or opens a raw Azure Voice Live websocket and bridges audio manually.
5. **Logs stream continuously**: the frontend opens an SSE connection to `GET /stream` on mount (before any call starts) and keeps it open — every line the agent subprocess prints (`[customer] ...`, `[workorder] ...`, `[field] ...`, per-turn latency lines) is broadcast to all connected browser tabs and parsed client-side to drive the live UI panels (Customer Lookup, Details Collected, Work Order, Latency Metrics).
6. **Hangup**: frontend disconnects the LiveKit room and calls `POST /agent/stop`, which kills the subprocess. The log tailer emits a `__STOPPED__` sentinel so any other open tab also tears down its connection.

## Auth

Every REST endpoint (including `/token`, the one that mints LiveKit access) requires a valid Keycloak-issued JWT, validated locally (expiry + issuer check, no network round trip, cached until expiry) via a `Depends(auth)` FastAPI dependency. The SSE `/stream` endpoint can't send custom headers, so it accepts the token as a `?token=` query param instead. Keycloak auth gates *whether you can get a LiveKit token at all*; the LiveKit token itself is a separate, short-lived JWT scoped only to the current call's room — decoupling "is this a valid platform user" from "can this browser session join this specific room."
