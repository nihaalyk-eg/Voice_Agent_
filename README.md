# Voice Agent Template

This repository provides a production-ready, technology-agnostic template for building AI Agents. It currently houses the **Zora Voice Assistant**, a real-time WebRTC AI built on LiveKit, FastAPI, and React.

## Repository Architecture (AI-Native)

This repository strictly adheres to an "Agentic OS" folder structure. This means the folder layout is designed to act as the AI's long-term memory and provide strict boundaries between code, prompts, and documentation.

- **`.agent/`**: Contains the registry manifest (`manifest.json`). This dictates how the agent integrates with the central Agent Registry.
- **`app/`**: Contains the core Python logic (`api/`, `agents/`, `tools/`).
- **`ui/`**: Contains the React frontend.
- **`ops/`**: Contains the `Dockerfile` and `docker-compose.yml`.
- **`prompts/`**: Stores LLM system prompts as text files (Prompts MUST NEVER be hardcoded in Python).
- **`docs/`**: Long-term memory for architectural specs (`project/`) and decision logs (`process/`).

## Local Development

To spin up the Voice Agent locally with its frontend, LiveKit server, and Redis cache:

```bash
docker compose -f ops/docker-compose.yml up -d --build
```

The frontend will be available at `http://localhost:3000` (or `8080`).

## Enforced Guidelines

If you are an AI Coding Assistant working in this repository, you MUST follow the instructions in `AGENTS.md`.
