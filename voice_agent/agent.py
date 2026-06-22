import asyncio
import os
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

from livekit.agents import AgentSession, Agent, JobContext, WorkerOptions, cli, inference
from livekit.plugins import azure
from livekit.plugins import openai as lk_openai
from langfuse_setup import setup_langfuse

MAX_HISTORY_MESSAGES = 10
INSTRUCTIONS = os.environ.get(
    "AGENT_INSTRUCTIONS",
    "You are a helpful, concise voice assistant. Keep responses short and conversational — two or three sentences max.",
)
VOICE = os.environ.get("AGENT_VOICE", "en-US-JennyNeural")


class VoiceAgent(Agent):
    async def on_user_turn_completed(self, turn_ctx, new_message=None) -> None:
        turn_ctx.truncate(max_items=MAX_HISTORY_MESSAGES)


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    print(f"[agent] room: {ctx.room.name}")

    trace_provider = setup_langfuse(session_id=ctx.room.name)

    async def _flush():
        await asyncio.to_thread(trace_provider.force_flush)

    ctx.add_shutdown_callback(_flush)

    session = AgentSession(
        vad=inference.VAD(
            model="silero",
            min_silence_duration=0.6,
            activation_threshold=0.5,
            prefix_padding_duration=0.5,
        ),
        stt=azure.STT(
            speech_key=os.environ["AZURE_SPEECH_KEY"],
            speech_region=os.environ["AZURE_SPEECH_REGION"],
        ),
        llm=lk_openai.LLM.with_azure(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            azure_deployment=os.environ["CHAT_DEPLOYMENT_NAME"],
            api_version=os.environ.get("OPENAI_API_VERSION", "2024-10-21"),
            model=os.environ["CHAT_DEPLOYMENT_NAME"],
        ),
        tts=azure.TTS(
            speech_key=os.environ["AZURE_SPEECH_KEY"],
            speech_region=os.environ["AZURE_SPEECH_REGION"],
            voice=VOICE,
        ),
    )

    await session.start(
        room=ctx.room,
        agent=VoiceAgent(instructions=INSTRUCTIONS),
    )

    done = asyncio.Event()

    def _on_disconnect(*_):
        done.set()

    ctx.room.on("disconnected", _on_disconnect)
    try:
        await done.wait()
    finally:
        ctx.room.off("disconnected", _on_disconnect)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
