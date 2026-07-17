"""
Voice Agent backend server.

Run: uv run --project . python server.py
UI:  http://localhost:8080
"""

import asyncio
import base64
import hashlib
import json
import os
import signal
import time
import uuid
from pathlib import Path
from typing import Any

import psycopg
import uvicorn
from dotenv import load_dotenv, find_dotenv
from fastapi import Body, Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from livekit.api import LiveKitAPI, AccessToken, VideoGrants
from livekit.protocol.agent_dispatch import RoomAgentDispatch
from livekit.protocol.room import CreateRoomRequest, DeleteRoomRequest
from pydantic import BaseModel

load_dotenv(find_dotenv())

app = FastAPI()
_bearer = HTTPBearer(auto_error=False)

BASE_DIR   = Path(__file__).parent.parent.parent
PYTHON     = BASE_DIR / ".venv" / "bin" / "python"
ROOM_PREFIX = "voice-room"
LK_URL    = os.environ["LIVEKIT_URL"]
LK_PUBLIC = os.environ.get("LIVEKIT_PUBLIC_URL", "ws://localhost:7880")
LK_KEY    = os.environ["LIVEKIT_API_KEY"]
LK_SECRET = os.environ["LIVEKIT_API_SECRET"]

KEYCLOAK_URL   = os.environ.get("KEYCLOAK_URL")
KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM")

AGENTS = {
    "pipeline": {
        "label":      "Pipeline",
        "subtitle":   "Azure STT → LLM → Azure TTS",
        "model":      os.environ.get("CHAT_DEPLOYMENT_NAME", "gpt-4.1-mini"),
        "module":     "app.agents.agent",
        "bench_file": "data/bench_pipeline.jsonl",
        "e2e_target": 5083,
        "color":      "#6366f1",
    },
    "voice-live": {
        "label":      "Voice Live",
        "subtitle":   "Azure Voice Live API",
        "model":      os.environ.get("CHAT_DEPLOYMENT_NAME", "gpt-4.1-mini"),
        "module":     "app.agents.agent_voice_live",
        "bench_file": "data/bench_voice_live.jsonl",
        "e2e_target": 470,
        "color":      "#eab308",
    },
    "realtime": {
        "label":      "Realtime API",
        "subtitle":   "GPT-4o Realtime API",
        "model":      os.environ.get("REALTIME_DEPLOYMENT_NAME", "gpt-realtime-1.5"),
        "module":     "app.agents.agent_realtime",
        "bench_file": "data/bench_realtime.jsonl",
        "e2e_target": 1212,
        "color":      "#f59e0b",
    },
}


# ── Pydantic models ──────────────────────────────────────────────────────────
class StartPayload(BaseModel):
    voice:        str            = "en-US-JennyNeural"
    language:     str            = "en-US"
    proactive:    bool           = True
    instructions: str | None     = None
    agent_config: dict[str, Any] | None = None
    cdb_mode:     bool           = False
    caller_phone: str | None     = None


# ── Auth: local JWT validation (expiry + issuer) cached until token expiry ───
_token_cache: dict[str, float] = {}

_EXPECTED_ISS = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}"


def _validate_jwt(token: str) -> float:
    """Decode JWT claims without signature verification; return exp timestamp."""
    parts = token.split(".")
    if len(parts) != 3:
        raise PermissionError("Not a valid JWT")
    try:
        payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception as e:
        raise PermissionError(f"JWT decode failed: {e}")

    exp = claims.get("exp")
    if exp is None or exp < time.time():
        raise PermissionError("Token expired")

    iss = claims.get("iss", "")
    if iss != _EXPECTED_ISS:
        raise PermissionError(f"Invalid issuer: {iss!r}")

    return float(exp)


async def auth(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    token: str | None = Query(default=None),
) -> None:
    raw = (creds.credentials if creds else None) or token
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")

    h = hashlib.sha256(raw.encode()).hexdigest()
    now = time.time()
    if _token_cache.get(h, 0) > now:
        return

    try:
        exp = _validate_jwt(raw)
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))

    _token_cache[h] = exp
    expired = [k for k, v in _token_cache.items() if v <= now]
    for k in expired:
        del _token_cache[k]


# ── State ────────────────────────────────────────────────────────────────────
_proc:          asyncio.subprocess.Process | None = None
_tail_task:     asyncio.Task | None = None
_current_id:    str | None = None
_current_room:  str = ROOM_PREFIX
_log_listeners: set[asyncio.Queue] = set()
# Serializes start/stop so rapid double-clicks (or a stale request racing a new
# one) can't interleave and corrupt _proc/_current_room/_current_id.
_lifecycle_lock = asyncio.Lock()


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


async def _setup_room_dispatch(room_name: str, previous_room: str | None, agent_name: str) -> None:
    # Each session gets a brand-new room name. Reusing one static room name across
    # sessions raced with LiveKit's worker-deregistration on hangup: a stale
    # (just-killed) worker could still look "available" to the server for a moment,
    # so the fresh job got dispatched to a dead process and the agent never joined.
    async with LiveKitAPI(url=LK_URL, api_key=LK_KEY, api_secret=LK_SECRET) as api:
        if previous_room:
            try:
                await api.room.delete_room(DeleteRoomRequest(room=previous_room))
            except Exception:
                pass
        await api.room.create_room(CreateRoomRequest(
            name=room_name,
            empty_timeout=300,
            agents=[RoomAgentDispatch(agent_name=agent_name)],
        ))
    await _broadcast(f"[ui] room '{room_name}' ready — waiting for client to connect...")


# ── API ──────────────────────────────────────────────────────────────────────
@app.get("/agents")
async def get_agents(_auth=Depends(auth)):
    return AGENTS


@app.post("/agent/start/{agent_id}")
async def start_agent(
    agent_id: str,
    payload: StartPayload | None = Body(default=None),
    _auth=Depends(auth),
):
    global _proc, _current_id, _current_room
    if agent_id not in AGENTS:
        return JSONResponse({"error": "unknown agent"}, status_code=400)
    if payload is None:
        payload = StartPayload()

    async with _lifecycle_lock:
        await _kill_agent()
        info = AGENTS[agent_id]

        previous_room = _current_room
        _current_room = f"{ROOM_PREFIX}-{uuid.uuid4().hex[:8]}"
        worker_name = f"{agent_id}-{uuid.uuid4().hex[:8]}"

        env = {**os.environ}
        env["LIVEKIT_AGENT_NAME"] = worker_name
        env["AGENT_VOICE"]     = payload.voice
        env["AGENT_LANGUAGE"]  = payload.language
        env["AGENT_PROACTIVE"] = "1" if payload.proactive else "0"

        if payload.agent_config:
            env["AGENT_CONFIG"] = json.dumps(payload.agent_config)
            sp = payload.agent_config.get("system_prompt")
            if sp:
                env["AGENT_INSTRUCTIONS"] = sp
        elif payload.instructions:
            env["AGENT_INSTRUCTIONS"] = payload.instructions

        if payload.cdb_mode:
            env["AGENT_CDB_MODE"] = "1"
            if payload.caller_phone:
                env["AGENT_CALLER_PHONE"] = payload.caller_phone.strip()

        _proc = await asyncio.create_subprocess_exec(
            str(PYTHON), "-m", info["module"], "dev",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=BASE_DIR,
            start_new_session=True,
            env=env,
        )
        _current_id = agent_id
        _tail_task  = asyncio.create_task(_tail_process(_proc))
        await _broadcast(f"[ui] started {info['label']} (PID {_proc.pid}) — waiting for registration...")
        await _wait_for_worker()
        await _setup_room_dispatch(_current_room, previous_room, worker_name)
        return {"status": "started", "agent": agent_id, "pid": _proc.pid, "room": _current_room}


@app.post("/agent/stop")
async def stop_agent(_auth=Depends(auth)):
    async with _lifecycle_lock:
        await _kill_agent()
    return {"status": "stopped"}


@app.get("/agent/status")
async def agent_status(_auth=Depends(auth)):
    running = bool(_proc and _proc.returncode is None)
    return {"running": running, "agent": _current_id if running else None}


@app.get("/customers")
async def list_customers(search: str = Query(default=""), _auth=Depends(auth)):
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return JSONResponse({"error": "DATABASE_URL not configured"}, status_code=503)

    def _query():
        with psycopg.connect(database_url, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, full_name, phone_number, email, property_address,
                           apartment_number, language_preference, notes
                    FROM customers
                    WHERE %(q)s = '' OR full_name ILIKE %(pattern)s OR phone_number ILIKE %(pattern)s
                       OR property_address ILIKE %(pattern)s
                    ORDER BY full_name
                    """,
                    {"q": search, "pattern": f"%{search}%"},
                )
                cols = [d.name for d in cur.description]
                return [dict(zip(cols, row)) for row in cur.fetchall()]

    try:
        rows = await asyncio.to_thread(_query)
    except psycopg.OperationalError as e:
        return JSONResponse({"error": f"database unavailable: {e}"}, status_code=503)
    return {"customers": rows}


@app.get("/bench/{agent_id}")
async def bench_results(agent_id: str, _auth=Depends(auth)):
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


@app.post("/bench/clear/{agent_id}")
async def bench_clear(agent_id: str, _auth=Depends(auth)):
    if agent_id not in AGENTS:
        return JSONResponse({"error": "unknown"}, status_code=400)
    bench = AGENTS[agent_id]["bench_file"]
    if bench:
        path = BASE_DIR / bench
        if path.exists():
            await asyncio.to_thread(path.unlink)
    return {"status": "cleared"}


@app.get("/stream")
async def log_stream(_auth=Depends(auth)):
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
async def get_token(_auth=Depends(auth)):
    token = (
        AccessToken(LK_KEY, LK_SECRET)
        .with_grants(VideoGrants(room_join=True, room=_current_room, can_publish=True, can_subscribe=True))
        .with_identity("browser-user")
        .to_jwt()
    )
    return {"token": token, "url": LK_PUBLIC, "room": _current_room}


# ── Static UI serving ────────────────────────────────────────────────────
public_dir = BASE_DIR / "public"

# Client-side routes handled by the SPA's hand-rolled router (NavContext) —
# served explicitly so a direct navigation/refresh on these paths doesn't 404.
if public_dir.exists():
    @app.get("/customer-db")
    async def customer_db_page():
        return FileResponse(public_dir / "index.html")

    app.mount("/", StaticFiles(directory=public_dir, html=True), name="ui")


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8080, reload=False)
