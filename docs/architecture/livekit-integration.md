# LiveKit Integration

LiveKit is the WebRTC SFU (selective forwarding unit) that carries audio between the browser and the agent subprocess. This repo runs **self-hosted LiveKit**, not LiveKit Cloud — `livekit.yaml` at the repo root is a full open-source `livekit-server` config (`port: 7880`, `rtc.tcp_port: 7881`, a UDP port range, a TURN relay, Redis-backed), and `.env.example` uses plain `ws://localhost:7880` with dev API keys (`devkey`/`devsecret...`) rather than a `wss://<project>.livekit.cloud` Cloud endpoint. A Cloud deployment wouldn't need you to configure TURN/node-IP yourself the way self-hosting does.

## Rooms

- `ROOM_PREFIX = "voice-room"`. On every `/agent/start/{agent_id}` call, the backend generates a brand-new unique room name: `f"{ROOM_PREFIX}-{uuid.uuid4().hex[:8]}"`.
- **Why a new room per call, not one reused room**: reusing a single static room name raced with LiveKit's worker-deregistration on hangup — a stale, just-killed worker could still look "available" to LiveKit for a moment and get the *new* job dispatched to a dead process, so the agent would never join. A fresh room name per session sidesteps this entirely.
- The previous room is explicitly deleted (`LiveKitAPI(...).room.delete_room(...)`) before the new one is created.

## Agent dispatch

LiveKit supports two dispatch models: **automatic** (any idle worker of a matching "kind" picks up a job) and **explicit/room-based** (a specific worker, identified by `agent_name`, is designated at room-creation time). This repo uses explicit dispatch, because multiple different agent implementations (Pipeline / Voice Live / Realtime) need to be addressable independently, and only one agent subprocess is meant to be running at a time per session.

The mechanism:

1. `server.py` generates a unique `worker_name` per session (`f"{agent_id}-{uuid.uuid4().hex[:8]}"`) and passes it to the spawned agent subprocess as `LIVEKIT_AGENT_NAME`.
2. Each agent file's entrypoint registers as a LiveKit **worker** under that name at startup: `cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name=os.environ.get("LIVEKIT_AGENT_NAME", "")))` — identical in all three agent implementations.
3. When the backend creates the room, it attaches `RoomAgentDispatch(agent_name=worker_name)` to it (`CreateRoomRequest(name=room_name, empty_timeout=300, agents=[RoomAgentDispatch(agent_name=worker_name)])`).
4. LiveKit only routes this room's job to the worker registered under that exact `agent_name` — so even if multiple agent subprocesses were somehow running, each is scoped to its own room/session.

### Sequencing in `start_agent`

Under an `asyncio.Lock` (so rapid double-starts or overlapping requests can't corrupt shared state):

1. Kill any previous agent subprocess (SIGTERM, then SIGKILL of the whole process group after a grace period).
2. Spawn `python -m app.agents.<module> dev` as a detached subprocess (own process group, stdout/stderr piped back to the server for log streaming). The `"dev"` argument is the LiveKit Agents CLI's dev-mode subcommand.
3. Wait ~3 seconds for the subprocess to connect and register as a worker before touching room/dispatch — otherwise the dispatch could be created before the worker exists to receive it.
4. Delete the previous room, create the new one with dispatch attached.

## Frontend connection

- **Token**: `GET /token` (behind the same Keycloak auth as every other endpoint) mints a LiveKit `AccessToken` with `VideoGrants(room_join=True, room=_current_room, can_publish=True, can_subscribe=True)` — scoped to exactly the current session's room, granting bidirectional audio. Returns `{ token, url: LIVEKIT_PUBLIC_URL, room }`.
- **Why two LiveKit URLs**: `server.py` distinguishes `LIVEKIT_URL` (internal — used by the backend's admin `LiveKitAPI` client and for signing tokens) from `LIVEKIT_PUBLIC_URL` (returned to the browser). In a self-hosted/dockerized setup the backend reaches LiveKit over an internal Docker network hostname, while the browser needs the externally-reachable address — a split that wouldn't exist with LiveKit Cloud's single public URL. **This is also the most common local-dev failure mode**: if `LIVEKIT_PUBLIC_URL` is missing or wrong, the browser gets a URL it can't actually reach and fails with "could not establish pc connection."
- **Joining** (`ui/src/pages/voice/VoiceAgentApp.jsx`, `joinRoom()`): constructs `new Room({ adaptiveStream: true, dynacast: true })` from `livekit-client`, fetches the token, registers listeners for `TrackSubscribed`/`TrackUnsubscribed`/`ParticipantConnected`/`ParticipantDisconnected`/`TranscriptionReceived`/`Disconnected`, then `room.connect(url, token, { autoSubscribe: true })`, then `room.localParticipant.setMicrophoneEnabled(true, { deviceId })` to publish the mic track.
- **Playback**: on `TrackSubscribed` for an audio track (the agent's synthesized voice), the frontend calls `track.attach()`. A 20-second watchdog disconnects and surfaces an error if no remote participant (the agent) shows up in time — this is what fires if the agent subprocess crashed or LiveKit never dispatched the job.
- **Transcripts**: arrive via `RoomEvent.TranscriptionReceived`, published by the agent side either automatically (Pipeline agent's `AgentSession`) or manually via `ctx.room.local_participant.publish_transcription(...)` (the two websocket-bridge agents).
- **Visualizer**: a Web Audio API `AnalyserNode` fed by the local mic `MediaStream`, drawn to a canvas via `requestAnimationFrame` — purely cosmetic, not part of the LiveKit data path.
- **Mute**: `room.localParticipant.setMicrophoneEnabled(!current)`.

## Full lifecycle (backend ⇄ LiveKit ⇄ frontend ⇄ agent)

```
Frontend                Backend                  LiveKit              Agent subprocess
   │  POST /agent/start     │                        │                       │
   ├────────────────────────▶                        │                       │
   │                        │  spawn subprocess ──────┼──────────────────────▶│
   │                        │                        │   worker registers    │
   │                        │                        │◀──────────────────────┤
   │                        │  create room + dispatch│                       │
   │                        ├───────────────────────▶│                       │
   │  ◀─ {status, room} ────┤                        │                       │
   │  GET /token            │                        │                       │
   ├────────────────────────▶                        │                       │
   │  ◀─ {token, url} ──────┤                        │                       │
   │  room.connect() ───────┼───────────────────────▶│                       │
   │  publish mic track     │                        │  dispatch job ────────▶│
   │                        │                        │                       │  entrypoint(ctx)
   │                        │                        │◀── join room ─────────┤
   │  ◀════ audio + transcription (direct P2P via SFU) ════════════════════▶ │
   │                        │  GET /stream (SSE) — log tail, opened on mount │
   │◀───────────────────────┤◀──────────────────────────────────────────────┤
```

The backend is only in the critical path at call *start* (spawn + dispatch) and *stop* (kill). Once connected, audio flows browser ↔ LiveKit ↔ agent without the backend relaying it — the backend's ongoing role during a call is just tailing subprocess stdout to the SSE log stream.
