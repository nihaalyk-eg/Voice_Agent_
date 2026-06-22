"""
Voice Agent backend server.

Run: uv run --project . python server.py
UI:  http://localhost:8080
"""

import asyncio
import json
import os
import signal
from pathlib import Path

import uvicorn
from dotenv import load_dotenv, find_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from livekit.api import LiveKitAPI, AccessToken, VideoGrants
from livekit.protocol.agent_dispatch import RoomAgentDispatch
from livekit.protocol.room import CreateRoomRequest, DeleteRoomRequest, ListRoomsRequest

load_dotenv(find_dotenv())

app = FastAPI()

BASE_DIR  = Path(__file__).parent
PYTHON    = BASE_DIR / ".venv" / "bin" / "python"
ROOM      = "voice-room"
LK_URL    = os.environ["LIVEKIT_URL"]
LK_PUBLIC = os.environ.get("LIVEKIT_PUBLIC_URL", "ws://localhost:7880")
LK_KEY    = os.environ["LIVEKIT_API_KEY"]
LK_SECRET = os.environ["LIVEKIT_API_SECRET"]

AGENTS = {
    "pipeline": {
        "label":      "Pipeline",
        "subtitle":   "Azure STT → LLM → Azure TTS",
        "model":      "gpt-5.4-mini",
        "file":       "agent.py",
        "bench_file": None,
        "e2e_target": 5083,
        "color":      "#6366f1",
    },
    "voice-live": {
        "label":      "Voice Live",
        "subtitle":   "Azure Voice Live API",
        "model":      "gpt-4.1-mini",
        "file":       "agent_voice_live.py",
        "bench_file": "data/bench_voice_live.jsonl",
        "e2e_target": 1237,
        "color":      "#10b981",
    },
    "realtime": {
        "label":      "GPT Realtime",
        "subtitle":   "Voice Live native audio",
        "model":      "gpt-realtime-1.5",
        "file":       "agent_realtime.py",
        "bench_file": "data/bench_realtime.jsonl",
        "e2e_target": 1212,
        "color":      "#f59e0b",
    },
}

# ── State ───────────────────────────────────────────────────────────────────
_proc:          asyncio.subprocess.Process | None = None
_tail_task:     asyncio.Task | None = None
_current_id:    str | None = None
_log_listeners: set[asyncio.Queue] = set()


async def _broadcast(line: str) -> None:
    for q in list(_log_listeners):
        await q.put(line)


async def _tail_process(proc: asyncio.subprocess.Process) -> None:
    if not proc.stdout:
        return
    try:
        while True:
            raw = await proc.stdout.readline()
            if not raw:
                break
            await _broadcast(raw.decode(errors="replace").rstrip())
    except asyncio.CancelledError:
        pass
    except Exception as e:
        await _broadcast(f"[ui] tail error: {e}")
    finally:
        await _broadcast("__STOPPED__")


async def _kill_agent() -> None:
    global _proc, _tail_task, _current_id
    if not _proc:
        return
    if _tail_task and not _tail_task.done():
        _tail_task.cancel()
        try:
            await _tail_task
        except (asyncio.CancelledError, Exception):
            pass
    _tail_task = None
    try:
        _proc.terminate()
        try:
            await asyncio.wait_for(_proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            try:
                pgid = os.getpgid(_proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    except ProcessLookupError:
        pass
    finally:
        _proc       = None
        _current_id = None
        await _broadcast("[ui] agent stopped")


async def _wait_for_worker(delay: float = 3.0) -> None:
    await _broadcast(f"[ui] waiting {delay:.0f}s for worker to register...")
    await asyncio.sleep(delay)


async def _setup_room_dispatch() -> None:
    async with LiveKitAPI(url=LK_URL, api_key=LK_KEY, api_secret=LK_SECRET) as api:
        existing = await api.room.list_rooms(ListRoomsRequest())
        if any(r.name == ROOM for r in existing.rooms):
            await api.room.delete_room(DeleteRoomRequest(room=ROOM))
        await api.room.create_room(CreateRoomRequest(
            name=ROOM,
            empty_timeout=300,
            agents=[RoomAgentDispatch(agent_name="")],
        ))
    await _broadcast(f"[ui] room '{ROOM}' ready — waiting for client to connect...")


# ── API ─────────────────────────────────────────────────────────────────────
@app.get("/agents")
async def get_agents():
    return AGENTS


@app.post("/agent/start/{agent_id}")
async def start_agent(agent_id: str):
    global _proc, _current_id
    if agent_id not in AGENTS:
        return JSONResponse({"error": "unknown agent"}, status_code=400)
    await _kill_agent()
    info  = AGENTS[agent_id]
    _proc = await asyncio.create_subprocess_exec(
        str(PYTHON), info["file"], "dev",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=BASE_DIR,
        start_new_session=True,
    )
    _current_id = agent_id
    _tail_task  = asyncio.create_task(_tail_process(_proc))
    await _broadcast(f"[ui] started {info['label']} (PID {_proc.pid}) — waiting for registration...")
    await _wait_for_worker()
    await _setup_room_dispatch()
    return {"status": "started", "agent": agent_id, "pid": _proc.pid}


@app.post("/agent/stop")
async def stop_agent():
    await _kill_agent()
    return {"status": "stopped"}


@app.get("/agent/status")
async def agent_status():
    running = bool(_proc and _proc.returncode is None)
    return {"running": running, "agent": _current_id if running else None}


@app.get("/bench/{agent_id}")
async def bench_results(agent_id: str):
    if agent_id not in AGENTS:
        return JSONResponse({"error": "unknown"}, status_code=400)
    bench = AGENTS[agent_id]["bench_file"]
    if not bench:
        return {"turns": []}
    path = BASE_DIR / bench
    if not path.exists():
        return {"turns": []}
    text  = await asyncio.to_thread(path.read_text)
    turns = [json.loads(l) for l in text.splitlines() if l.strip()]
    return {"turns": turns}


@app.get("/stream")
async def log_stream():
    queue: asyncio.Queue = asyncio.Queue()
    _log_listeners.add(queue)

    async def gen():
        try:
            while True:
                line = await queue.get()
                yield f"data: {json.dumps(line)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _log_listeners.discard(queue)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/token")
async def get_token():
    token = (
        AccessToken(LK_KEY, LK_SECRET)
        .with_grants(VideoGrants(room_join=True, room=ROOM, can_publish=True, can_subscribe=True))
        .with_identity("browser-user")
        .to_jwt()
    )
    return {"token": token, "url": LK_PUBLIC, "room": ROOM}


@app.get("/")
async def index():
    return FileResponse(BASE_DIR / "frontend" / "index.html")


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8080, reload=False)
