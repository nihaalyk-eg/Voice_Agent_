# ── Build stage for frontend ──────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build/ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build
# Because outDir is ../public, it builds to /build/public

# ── Build stage: install deps with uv ─────────────────────────────────────
FROM python:3.13-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /build

# Copy lock files first — layer is cached until deps change
COPY pyproject.toml uv.lock ./

# Install all deps into .venv (frozen = no resolution, fastest)
RUN uv sync --frozen --no-cache

# ── Runtime image ──────────────────────────────────────────────────────────
FROM python:3.13-slim

WORKDIR /app

# Bring in the pre-built venv from builder
COPY --from=builder /build/.venv ./.venv

# Copy backend source
COPY app/ ./app/
COPY .agent/ ./.agent/
COPY prompts/ ./prompts/

# Copy built frontend assets
COPY --from=frontend-builder /build/public ./public

# Benchmark data goes here — mount a volume at /app/data for persistence
RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8080

CMD ["python", "app/api/server.py"]
