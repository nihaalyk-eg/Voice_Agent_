"""
Voice Live agent — Azure Voice Live API bridged into a LiveKit room.
"""

import asyncio
import base64
import json
import os
import time
from dataclasses import dataclass, asdict
from pathlib import Path as _Path

from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

import websockets
from livekit import rtc
from livekit.agents import JobContext, WorkerOptions, cli
from langfuse_setup import setup_langfuse

# ── Bench file ─────────────────────────────────────────────────────────────
_DATA = _Path(__file__).parent / "data"
_DATA.mkdir(exist_ok=True)
BENCH_FILE = str(_DATA / "bench_voice_live.jsonl")

# ── Endpoint ────────────────────────────────────────────────────────────────
_BASE  = os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/").removeprefix("https://")
_MODEL = "gpt-4.1-mini"
VOICE_LIVE_URL = (
    f"wss://{_BASE}/voice-live/realtime"
    f"?api-version=2026-04-10&model={_MODEL}"
)

SAMPLE_RATE = 24_000
CHANNELS    = 1

_INSTRUCTIONS = os.environ.get(
    "AGENT_INSTRUCTIONS",
    "You are a helpful, concise voice assistant. Keep every response to two or three sentences.",
)
_VOICE = os.environ.get("AGENT_VOICE", "en-US-AvaNeural")

SESSION_CONFIG = {
    "type": "session.update",
    "session": {
        "modalities": ["text", "audio"],
        "instructions": _INSTRUCTIONS,
        "input_audio_format":  "pcm16",
        "output_audio_format": "pcm16",
        "input_audio_transcription": {"model": "azure-speech", "language": "en"},
        "turn_detection": {
            "type": "azure_semantic_vad",
            "silence_duration_ms": 500,
            "interrupt_response": True,
            "remove_filler_words": True,
        },
        "input_audio_noise_reduction":   {"type": "azure_deep_noise_suppression"},
        "input_audio_echo_cancellation": {"type": "server_echo_cancellation"},
        "voice": {"name": _VOICE, "type": "azure-standard"},
    },
}


# ── Benchmark helpers ────────────────────────────────────────────────────────
@dataclass
class Turn:
    turn: int
    speech_stopped_ms: float | None = None
    first_audio_ms:    float | None = None
    transcript_ms:     float | None = None
    response_done_ms:  float | None = None
    e2e_ms:            float | None = None
    stt_ms:            float | None = None
    agent_text: str = ""
    user_text:  str = ""


def _ms() -> float:
    return time.perf_counter() * 1000


def _print_turn(s: Turn) -> None:
    w = 60
    row = lambda label, val: f"│ {label:<30} {val:>10}"
    fmt = lambda v: f"{v:.0f} ms" if v is not None else "—"
    print(f"\n┌─ Turn #{s.turn} {'─' * (w - 10)}┐")
    if s.user_text:  print(f"│ you: {s.user_text[:w - 7]}")
    if s.agent_text: print(f"│ agent: {s.agent_text[:w - 9]}")
    print(f"│ {'─' * w} │")
    print(row("EOU → first audio (E2E)", fmt(s.e2e_ms)))
    print(row("EOU → transcript (STT)",  fmt(s.stt_ms)))
    if s.response_done_ms and s.speech_stopped_ms:
        print(row("total response duration", fmt(s.response_done_ms - s.speech_stopped_ms)))
    print(f"└{'─' * (w + 2)}┘")


def _save(s: Turn) -> None:
    with open(BENCH_FILE, "a") as f:
        f.write(json.dumps(asdict(s)) + "\n")


# ── Audio stream helper ──────────────────────────────────────────────────────
async def _get_audio_stream(room: rtc.Room, identity: str) -> rtc.AudioStream:
    for p in room.remote_participants.values():
        if p.identity == identity:
            for pub in p.track_publications.values():
                if pub.kind == rtc.TrackKind.KIND_AUDIO and pub.track:
                    return rtc.AudioStream(pub.track, sample_rate=SAMPLE_RATE, num_channels=CHANNELS)

    loop = asyncio.get_running_loop()
    fut: asyncio.Future[rtc.Track] = loop.create_future()

    @room.on("track_subscribed")
    def _on_track(track, _pub, participant) -> None:
        if participant.identity == identity and track.kind == rtc.TrackKind.KIND_AUDIO:
            if not fut.done():
                fut.set_result(track)

    return rtc.AudioStream(await fut, sample_rate=SAMPLE_RATE, num_channels=CHANNELS)


# ── Entrypoint ───────────────────────────────────────────────────────────────
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    print(f"[voice-live] room: {ctx.room.name}")

    trace_provider = setup_langfuse(session_id=ctx.room.name)

    async def _flush():
        await asyncio.to_thread(trace_provider.force_flush)

    ctx.add_shutdown_callback(_flush)

    participant = await ctx.wait_for_participant()
    print(f"[voice-live] participant: {participant.identity}")

    out_source = rtc.AudioSource(SAMPLE_RATE, CHANNELS)
    out_track  = rtc.LocalAudioTrack.create_audio_track("voice-live-out", out_source)
    await ctx.room.local_participant.publish_track(
        out_track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE),
    )

    # Set up disconnect event BEFORE opening WebSocket so we never miss it
    done = asyncio.Event()
    ctx.room.on("disconnected", lambda *_: done.set())

    headers = {"api-key": os.environ["AZURE_SPEECH_KEY"]}
    print(f"[voice-live] connecting ({_MODEL})...")

    async with websockets.connect(VOICE_LIVE_URL, additional_headers=headers) as ws:
        await ws.send(json.dumps(SESSION_CONFIG))

        turn_n   = 0
        current: Turn | None = None

        # ── Task 1: mic → Voice Live ─────────────────────────────────────────
        async def send_audio() -> None:
            audio_stream = await _get_audio_stream(ctx.room, participant.identity)
            print("[voice-live] microphone active — speak now")
            try:
                async for event in audio_stream:
                    if isinstance(event, rtc.AudioFrameEvent):
                        b64 = base64.b64encode(bytes(event.frame.data)).decode()
                        try:
                            await ws.send(json.dumps({"type": "input_audio_buffer.append", "audio": b64}))
                        except websockets.exceptions.ConnectionClosed:
                            break
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"[voice-live] send_audio error: {e}")

        # ── Task 2: Voice Live → speaker + bench ─────────────────────────────
        async def recv_audio() -> None:
            nonlocal turn_n, current
            try:
                async for raw in ws:
                    msg = json.loads(raw)
                    t   = msg.get("type", "")

                    if t == "error":
                        print(f"[voice-live] ERROR: {msg.get('error', msg)}")
                    elif t == "session.created":
                        print("[voice-live] session ready")
                    elif t == "input_audio_buffer.speech_started":
                        print("[voice-live] ↑ user speaking")
                    elif t == "input_audio_buffer.speech_stopped":
                        turn_n += 1
                        current = Turn(turn=turn_n, speech_stopped_ms=_ms())
                    elif t == "conversation.item.input_audio_transcription.completed":
                        text = msg.get("transcript", "").strip()
                        print(f"[voice-live] user: {text}")
                        if current and current.transcript_ms is None:
                            current.transcript_ms = _ms()
                            current.user_text = text
                            if current.speech_stopped_ms:
                                current.stt_ms = current.transcript_ms - current.speech_stopped_ms
                    elif t == "response.audio_transcript.done":
                        text = msg.get("transcript", "").strip()
                        print(f"[voice-live] agent: {text}")
                        if current:
                            current.agent_text = text
                    elif t == "response.audio.delta":
                        delta = msg.get("delta", "")
                        if not delta:
                            continue
                        pcm = base64.b64decode(delta)
                        if current and current.first_audio_ms is None:
                            current.first_audio_ms = _ms()
                            if current.speech_stopped_ms:
                                current.e2e_ms = current.first_audio_ms - current.speech_stopped_ms
                        await out_source.capture_frame(rtc.AudioFrame(
                            data=pcm, sample_rate=SAMPLE_RATE,
                            num_channels=CHANNELS, samples_per_channel=len(pcm) // 2,
                        ))
                    elif t == "response.done":
                        print("[voice-live] ↓ agent done")
                        if current:
                            current.response_done_ms = _ms()
                            _print_turn(current)
                            await asyncio.to_thread(_save, current)
                            current = None
            except websockets.exceptions.ConnectionClosed:
                pass
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"[voice-live] recv_audio error: {e}")

        # Run both tasks; cancel the other when one finishes or room disconnects
        send_task = asyncio.create_task(send_audio())
        recv_task = asyncio.create_task(recv_audio())
        stop_task = asyncio.create_task(done.wait())

        try:
            await asyncio.wait(
                {send_task, recv_task, stop_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
        finally:
            for task in (send_task, recv_task, stop_task):
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except (asyncio.CancelledError, Exception):
                        pass


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
