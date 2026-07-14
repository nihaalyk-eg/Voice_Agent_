# ── Build stage for frontend ──────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Build stage: install deps with uv ─────────────────────────────────────
FROM python:3.13-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy lock files first — layer is cached until deps change
COPY pyproject.toml uv.lock ./

# Install all deps into .venv (frozen = no resolution, fastest)
RUN uv sync --frozen --no-cache

# ── Runtime image ──────────────────────────────────────────────────────────
FROM python:3.13-slim

WORKDIR /app

# Bring in the pre-built venv from builder
COPY --from=builder /app/.venv ./.venv

# Copy backend source
COPY *.py ./

# Copy built frontend assets
COPY --from=frontend-builder /app/public ./public

# Benchmark data goes here — mount a volume at /app/data for persistence
RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8080

CMD ["python", "server.py"]
