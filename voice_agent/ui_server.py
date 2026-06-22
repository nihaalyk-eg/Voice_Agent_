"""
Simple UI server for selecting and running voice agents.

Run: uv run --project . python ui_server.py
Open: http://localhost:8080
"""

import asyncio
import json
import os
import signal
import subprocess
from pathlib import Path

import uvicorn
from dotenv import load_dotenv, find_dotenv
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from livekit.api import LiveKitAPI, AccessToken, VideoGrants
from livekit.protocol.agent_dispatch import RoomAgentDispatch
from livekit.protocol.room import CreateRoomRequest, DeleteRoomRequest, ListRoomsRequest

load_dotenv(find_dotenv())

app = FastAPI()

BASE_DIR   = Path(__file__).parent
PYTHON     = BASE_DIR / ".venv" / "bin" / "python"
ROOM       = "voice-room"
LK_URL     = os.environ["LIVEKIT_URL"]           # internal (Docker: ws://livekit:7880)
LK_PUBLIC  = os.environ.get("LIVEKIT_PUBLIC_URL", "ws://localhost:7880")  # browser-facing
LK_KEY     = os.environ["LIVEKIT_API_KEY"]
LK_SECRET  = os.environ["LIVEKIT_API_SECRET"]

AGENTS = {
    "pipeline": {
        "label":       "Pipeline",
        "subtitle":    "Azure STT → LLM → Azure TTS",
        "model":       "gpt-5.4-mini",
        "file":        "agent.py",
        "bench_file":  None,   # pipeline uses Langfuse for tracing, no local bench
        "e2e_target":  5083,
        "color":       "#6366f1",
    },
    "voice-live": {
        "label":       "Voice Live",
        "subtitle":    "Azure Voice Live API",
        "model":       "gpt-4.1-mini",
        "file":        "agent_voice_live.py",
        "bench_file":  "data/bench_voice_live.jsonl",
        "e2e_target":  1237,
        "color":       "#10b981",
    },
    "realtime": {
        "label":       "GPT Realtime",
        "subtitle":    "Voice Live native audio",
        "model":       "gpt-realtime-1.5",
        "file":        "agent_realtime.py",
        "bench_file":  "data/bench_realtime.jsonl",
        "e2e_target":  1212,
        "color":       "#f59e0b",
    },
}

# ── State ──────────────────────────────────────────────────────────────────
_proc:          asyncio.subprocess.Process | None = None
_tail_task:     asyncio.Task | None = None
_current_id:    str | None = None
_log_listeners: set[asyncio.Queue] = set()   # set avoids mutation-during-iteration


async def _broadcast(line: str) -> None:
    for q in list(_log_listeners):   # snapshot so removals mid-iter are safe
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


# ── Process management ─────────────────────────────────────────────────────
async def _kill_agent() -> None:
    """Gracefully stop the agent worker (SIGTERM → wait → SIGKILL fallback)."""
    global _proc, _tail_task, _current_id
    if not _proc:
        return

    # Cancel the stdout reader first so it doesn't block
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


# ── Worker + Room management ───────────────────────────────────────────────
async def _wait_for_worker(delay: float = 3.0) -> None:
    """Wait for the agent process to register with the LiveKit server.
    Workers typically register within 1-2 s; 3 s gives safe headroom."""
    await _broadcast(f"[ui] waiting {delay:.0f}s for worker to register...")
    await asyncio.sleep(delay)



async def _setup_room_dispatch() -> None:
    """Always delete + recreate the room with exactly ONE RoomAgentDispatch rule.

    Client.py auto-reconnects after the brief disconnect.
    The rule fires once when the first non-agent participant joins — no more,
    no less. Using a single code path prevents double-dispatch.
    """
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


# ── API ────────────────────────────────────────────────────────────────────
@app.post("/agent/start/{agent_id}")
async def start_agent(agent_id: str):
    global _proc, _current_id

    if agent_id not in AGENTS:
        return JSONResponse({"error": "unknown agent"}, status_code=400)

    # Kill any running agent AND all its child processes (job workers)
    await _kill_agent()

    # 1. Start agent in dev mode first so it can register as a worker
    info  = AGENTS[agent_id]
    _proc = await asyncio.create_subprocess_exec(
        str(PYTHON), info["file"], "dev",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=BASE_DIR,
        start_new_session=True,   # new process group → killpg kills all children
    )
    _current_id = agent_id
    _tail_task = asyncio.create_task(_tail_process(_proc))
    await _broadcast(f"[ui] started {info['label']} (PID {_proc.pid}) — waiting for registration...")

    # 2. Wait for worker to register with LiveKit server before creating room
    await _wait_for_worker()

    # 3. Now setup room — worker is ready, dispatch will succeed immediately
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
            _log_listeners.remove(queue)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


# ── HTML ───────────────────────────────────────────────────────────────────
HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Zora Voice Agent</title>
<style>
  :root {
    --bg: #0f1117; --surface: #1a1d27; --border: #2d3148;
    --text: #e2e8f0; --muted: #64748b; --green: #10b981;
    --red: #ef4444; --radius: 12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, sans-serif;
         min-height: 100vh; padding: 32px 24px; }
  h1   { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
  .sub { color: var(--muted); font-size: .875rem; margin-bottom: 32px; }

  /* ── Cards ── */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .card  { background: var(--surface); border: 2px solid var(--border); border-radius: var(--radius);
            padding: 20px; cursor: pointer; transition: border-color .2s, transform .1s; }
  .card:hover  { border-color: #4b5563; transform: translateY(-1px); }
  .card.active { border-color: var(--accent, #10b981); }
  .card .dot   { width: 10px; height: 10px; border-radius: 50%; background: var(--accent, #10b981);
                  display: inline-block; margin-right: 8px; }
  .card h2   { font-size: 1.05rem; font-weight: 600; display: flex; align-items: center; }
  .card .sub { font-size: .8rem; color: var(--muted); margin: 4px 0 12px; }
  .card .model { font-size: .75rem; font-family: monospace; background: #0f1117;
                  padding: 3px 8px; border-radius: 6px; display: inline-block; color: #94a3b8; }
  .card .e2e  { font-size: 1.4rem; font-weight: 700; margin-top: 12px; }
  .card .e2e-label { font-size: .7rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }

  /* ── Controls ── */
  .controls { display: flex; gap: 12px; margin-bottom: 28px; }
  button { padding: 10px 24px; border: none; border-radius: 8px; font-size: .9rem;
            font-weight: 600; cursor: pointer; transition: opacity .15s; }
  button:hover   { opacity: .88; }
  button:disabled { opacity: .4; cursor: not-allowed; }
  #btn-start { background: var(--green); color: #fff; }
  #btn-stop  { background: #374151; color: var(--text); }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted);
                 display: inline-block; margin-right: 6px; transition: background .3s; }
  .status-dot.on { background: var(--green); box-shadow: 0 0 6px var(--green); }
  #status-label  { font-size: .85rem; color: var(--muted); display: flex; align-items: center; }

  /* ── Layout ── */
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 720px) { .columns { grid-template-columns: 1fr; } }

  /* ── Log ── */
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
  .panel h3 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 12px; }
  #log  { font-family: monospace; font-size: .78rem; color: #94a3b8; height: 320px;
           overflow-y: auto; white-space: pre-wrap; line-height: 1.6; }
  #log .info  { color: #60a5fa; }
  #log .user  { color: #a78bfa; }
  #log .agent { color: var(--green); }
  #log .err   { color: var(--red); }
  #log .bench { color: #fbbf24; }

  /* ── Bench table ── */
  table { width: 100%; border-collapse: collapse; font-size: .8rem; }
  th { color: var(--muted); text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); font-weight: 500; }
  td { padding: 6px 8px; border-bottom: 1px solid #1e2235; }
  tr:last-child td { border-bottom: none; }
  .bar-wrap { display: flex; align-items: center; gap: 8px; }
  .bar { height: 6px; border-radius: 3px; min-width: 4px; }

  /* ── Mic section ── */
  .mic-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
                  padding: 16px 20px; margin-bottom: 28px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
  #btn-mic { background: #1e2235; color: var(--text); border: 2px solid var(--border); min-width: 160px; }
  #btn-mic.connected { background: #14532d; border-color: var(--green); color: var(--green); }
  #btn-mic.connecting { opacity: .6; }
  .mic-status { font-size: .85rem; color: var(--muted); display: flex; align-items: center; gap: 8px; flex: 1; }
  .bars { display: flex; align-items: flex-end; gap: 3px; height: 24px; }
  .bars span { width: 4px; border-radius: 2px; background: var(--green); transition: height .1s; height: 4px; }
  .bars.active span:nth-child(1) { animation: pulse 0.6s ease infinite alternate; }
  .bars.active span:nth-child(2) { animation: pulse 0.6s ease 0.1s infinite alternate; }
  .bars.active span:nth-child(3) { animation: pulse 0.6s ease 0.2s infinite alternate; }
  .bars.active span:nth-child(4) { animation: pulse 0.6s ease 0.15s infinite alternate; }
  .bars.active span:nth-child(5) { animation: pulse 0.6s ease 0.05s infinite alternate; }
  @keyframes pulse { from { height: 4px; } to { height: 20px; } }
  .transcript { font-size: .8rem; padding: 6px 10px; background: #0f1117; border-radius: 6px;
                 border-left: 2px solid #2d3148; color: #94a3b8; max-width: 500px; flex: 1;
                 min-height: 32px; line-height: 1.4; }
  .transcript .you   { color: #a78bfa; }
  .transcript .agent { color: var(--green); }
</style>
</head>
<body>

<h1>🎙 Zora Voice Agent</h1>
<p class="sub">Select a model, start the agent, then connect your mic.</p>

<div class="cards" id="cards"></div>

<div class="controls">
  <button id="btn-start" disabled>▶ Start Agent</button>
  <button id="btn-stop"  disabled>■ Stop</button>
  <span id="status-label"><span class="status-dot" id="dot"></span>Idle</span>
</div>

<div class="mic-section">
  <button id="btn-mic" onclick="toggleMic()">🎤 Connect Mic</button>
  <div class="mic-status">
    <div class="bars" id="bars"><span></span><span></span><span></span><span></span><span></span></div>
    <span id="mic-label">Not connected</span>
  </div>
  <div class="transcript" id="transcript"><span style="color:var(--muted)">Transcript will appear here…</span></div>
</div>

<div class="columns">
  <div class="panel">
    <h3>Live Log</h3>
    <div id="log"></div>
  </div>
  <div class="panel">
    <h3>Benchmark — last 10 turns</h3>
    <table id="bench-table">
      <thead><tr>
        <th>#</th><th>E2E</th><th>STT</th><th>Total</th>
      </tr></thead>
      <tbody id="bench-body"><tr><td colspan="4" style="color:var(--muted)">Run an agent to see results.</td></tr></tbody>
    </table>
  </div>
</div>

<script>
const AGENTS = AGENTS_JSON;

let selected = null;

// ── Render cards ──────────────────────────────────────────────────────────
function renderCards() {
  const container = document.getElementById('cards');
  container.innerHTML = '';
  for (const [id, a] of Object.entries(AGENTS)) {
    const card = document.createElement('div');
    card.className = 'card' + (id === selected ? ' active' : '');
    card.style.setProperty('--accent', a.color);
    card.innerHTML = `
      <h2><span class="dot" style="background:${a.color}"></span>${a.label}</h2>
      <div class="sub">${a.subtitle}</div>
      <span class="model">${a.model}</span>
      <div class="e2e-label">Measured E2E</div>
      <div class="e2e" id="e2e-${id}" style="color:${a.color}">${a.e2e_target} ms</div>`;
    card.onclick = () => { selected = id; renderCards(); updateButtons(); loadBench(id); };
    container.appendChild(card);
  }
}

function updateButtons() {
  document.getElementById('btn-start').disabled = !selected;
}

// ── Start / stop ──────────────────────────────────────────────────────────
document.getElementById('btn-start').onclick = async () => {
  if (!selected) return;
  await fetch(`/agent/start/${selected}`, { method: 'POST' });
  pollStatus();
};
document.getElementById('btn-stop').onclick = async () => {
  await fetch('/agent/stop', { method: 'POST' });
  pollStatus();
};

async function pollStatus() {
  const r = await fetch('/agent/status').then(r => r.json());
  const dot   = document.getElementById('dot');
  const label = document.getElementById('status-label');
  const stop  = document.getElementById('btn-stop');
  if (r.running) {
    dot.classList.add('on');
    const a = AGENTS[r.agent];
    label.innerHTML = `<span class="status-dot on" id="dot"></span>Running: <strong style="margin-left:5px;color:${a.color}">${a.label}</strong>`;
    stop.disabled = false;
  } else {
    dot.classList.remove('on');
    label.innerHTML = `<span class="status-dot" id="dot"></span>Idle`;
    stop.disabled = true;
  }
}

// ── SSE log ───────────────────────────────────────────────────────────────
const logEl = document.getElementById('log');
function appendLog(text) {
  let cls = '';
  if (text.startsWith('[ui]'))        cls = 'info';
  else if (text.includes('user:'))    cls = 'user';
  else if (text.includes('agent:'))   cls = 'agent';
  else if (text.includes('ERROR'))    cls = 'err';
  else if (text.includes('Turn #'))   cls = 'bench';
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  if (logEl.children.length > 300) logEl.removeChild(logEl.firstChild);
  // refresh bench after each turn
  if (text.includes('Turn #') && selected) setTimeout(() => loadBench(selected), 500);
}

const es = new EventSource('/stream');
es.onmessage = e => {
  const line = JSON.parse(e.data);
  if (line === '__STOPPED__') { pollStatus(); return; }
  appendLog(line);
};

// ── Bench table ───────────────────────────────────────────────────────────
const MAX_E2E = 5500;
async function loadBench(agentId) {
  const r = await fetch(`/bench/${agentId}`).then(r => r.json());
  const tbody = document.getElementById('bench-body');
  const turns = (r.turns || []).slice(-10);
  if (!turns.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">No data yet.</td></tr>';
    return;
  }
  const color = AGENTS[agentId]?.color || '#10b981';
  tbody.innerHTML = turns.map(t => {
    const e2e  = t.e2e_ms   ? Math.round(t.e2e_ms)   : '—';
    const stt  = t.stt_ms   ? Math.round(t.stt_ms)   : '—';
    const dur  = (t.response_done_ms && t.speech_stopped_ms)
                  ? Math.round(t.response_done_ms - t.speech_stopped_ms) : '—';
    const barW = typeof e2e === 'number' ? Math.round(e2e / MAX_E2E * 120) : 0;
    return `<tr>
      <td>${t.turn}</td>
      <td><div class="bar-wrap">
        <div class="bar" style="width:${barW}px;background:${color}"></div>
        <span>${e2e} ms</span>
      </div></td>
      <td>${stt} ms</td>
      <td>${dur} ms</td>
    </tr>`;
  }).join('');

  // Update card E2E with average
  const avg = Math.round(turns.reduce((s,t) => s + (t.e2e_ms||0), 0) / turns.length);
  const el  = document.getElementById(`e2e-${agentId}`);
  if (el && avg) el.textContent = avg + ' ms (avg)';
}

// ── Init ──────────────────────────────────────────────────────────────────
renderCards();
pollStatus();
setInterval(pollStatus, 3000);
</script>

<!-- LiveKit browser client -->
<script src="https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js"></script>
<script>
let _room = null;

async function toggleMic() {
  if (_room) { await disconnectMic(); } else { await connectMic(); }
}

async function connectMic() {
  const btn = document.getElementById('btn-mic');
  btn.textContent = '⏳ Connecting…';
  btn.classList.add('connecting');
  btn.disabled = true;

  // Use local `room` — only assign to global `_room` after successful connect
  // so that the Disconnected event can't null it out mid-setup.
  const room = new LivekitClient.Room({ adaptiveStream: true, dynacast: true });

  try {
    const { token, url, room: roomName } = await fetch('/token').then(r => r.json());

    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind === LivekitClient.Track.Kind.Audio) {
        track.attach();
        document.getElementById('mic-label').textContent = 'Agent speaking (' + participant.identity + ')';
      }
    });
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => { track.detach(); });
    room.on(LivekitClient.RoomEvent.ParticipantConnected, (p) => {
      appendLog('[mic] agent joined: ' + p.identity);
      document.getElementById('mic-label').textContent = 'Connected — speak now';
    });
    room.on(LivekitClient.RoomEvent.TranscriptionReceived, (segments, participant) => {
      const isAgent = participant && participant.identity.startsWith('agent');
      const who = isAgent ? 'agent' : 'you';
      const text = segments.map(s => s.text).join(' ').trim();
      if (!text) return;
      document.getElementById('transcript').innerHTML =
        '<span class="' + who + '"><strong>' + who + ':</strong> ' + text + '</span>';
      appendLog('[' + who + '] ' + text);
    });
    room.on(LivekitClient.RoomEvent.Disconnected, () => { _room = null; _resetMicUI(); });

    await room.connect(url, token, { autoSubscribe: true });
    await room.localParticipant.setMicrophoneEnabled(true);

    _room = room;   // assign globally only after everything succeeded
    btn.textContent = '⏹ Disconnect';
    btn.classList.remove('connecting');
    btn.classList.add('connected');
    btn.disabled = false;
    document.getElementById('bars').classList.add('active');
    document.getElementById('mic-label').textContent = 'Mic active — waiting for agent…';
    appendLog('[mic] connected to ' + roomName);
  } catch(e) {
    appendLog('[mic] error: ' + e.message);
    try { await room.disconnect(); } catch {}
    _resetMicUI();
  }
}

async function disconnectMic() {
  if (_room) { await _room.disconnect(); _room = null; }
  _resetMicUI();
}

function _resetMicUI() {
  const btn = document.getElementById('btn-mic');
  btn.textContent = '🎤 Connect Mic';
  btn.classList.remove('connecting', 'connected');
  btn.disabled = false;
  document.getElementById('bars').classList.remove('active');
  document.getElementById('mic-label').textContent = 'Not connected';
  _room = null;
}
</script>
</body>
</html>
"""

# Inject AGENTS config into the HTML
_agents_json = json.dumps(AGENTS)
HTML = HTML.replace("AGENTS_JSON", _agents_json)


@app.get("/token")
async def get_token():
    """Generate a LiveKit access token for the browser mic/speaker client."""
    token = (
        AccessToken(LK_KEY, LK_SECRET)
        .with_grants(VideoGrants(
            room_join=True,
            room=ROOM,
            can_publish=True,
            can_subscribe=True,
        ))
        .with_identity("browser-user")
        .to_jwt()
    )
    return {"token": token, "url": LK_PUBLIC, "room": ROOM}


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTML


if __name__ == "__main__":
    uvicorn.run("ui_server:app", host="0.0.0.0", port=8080, reload=False)
