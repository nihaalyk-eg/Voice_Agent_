"""
Langfuse OpenTelemetry setup for LiveKit voice agents.

Usage in any agent entrypoint:

    from langfuse_setup import setup_langfuse

    async def entrypoint(ctx: JobContext):
        trace_provider = setup_langfuse(session_id=ctx.room.name)

        async def _flush():
            await asyncio.to_thread(trace_provider.force_flush)
        ctx.add_shutdown_callback(_flush)
"""

import asyncio
import logging
import os
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.util.types import AttributeValue
from langfuse import Langfuse
from livekit.agents.telemetry import set_tracer_provider


_NOISE_PATTERNS = (
    "ignoring byte stream",
    "adaptive interruption disabled",
    "failed to connect to LiveKit Adaptive Interruption",
    # job process exits 255 on worker shutdown — expected on every Stop click
    "process exited with non-zero exit code 255",
)


class _IgnoreNoise(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return not any(p in record.getMessage() for p in _NOISE_PATTERNS)


logging.getLogger().addFilter(_IgnoreNoise())

# Module-level reference keeps the Langfuse exporter alive (prevents GC mid-session)
_langfuse_client: Langfuse | None = None


def setup_langfuse(
    session_id: str | None = None,
    metadata: dict[str, AttributeValue] | None = None,
) -> TracerProvider:
    """Wire Langfuse as the OTEL exporter for LiveKit agents."""
    global _langfuse_client

    for var in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"):
        if not os.environ.get(var):
            raise EnvironmentError(f"Required environment variable not set: {var}")

    span_meta: dict[str, AttributeValue] = metadata or {}
    if session_id:
        span_meta["langfuse.session.id"] = session_id

    trace_provider = TracerProvider(
        resource=Resource({SERVICE_NAME: "zora-voice-agent"})
    )
    set_tracer_provider(trace_provider, metadata=span_meta if span_meta else None)

    _langfuse_client = Langfuse(
        public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
        secret_key=os.environ["LANGFUSE_SECRET_KEY"],
        base_url=os.environ["LANGFUSE_BASE_URL"],
        tracer_provider=trace_provider,
        should_export_span=lambda span: True,
    )

    return trace_provider
