# Voice Agent

This repository provides a production-ready, technology-agnostic architecture for building AI Agents. It currently houses the **Zora Voice Assistant**, a real-time WebRTC AI built on LiveKit, FastAPI, and React.

## Repository Architecture (AI-Native)

This repository strictly adheres to an "Agentic OS" folder structure. This means the folder layout is designed to act as the AI's long-term memory and provide strict boundaries between code, prompts, and documentation.

- **`.agent/`**: Contains the registry manifest (`manifest.json`). This dictates how the agent integrates with the central Agent Registry.
- **`app/`**: Contains the core Python logic (`api/`, `agents/`, `tools/`).
- **`ui/`**: Contains the React frontend.
- **`ops/`**: Contains the `Dockerfile` and `docker-compose.yml`.
- **`prompts/`**: Stores LLM system prompts as text files (Prompts MUST NEVER be hardcoded in Python).
- **`docs/`**: Long-term memory for architectural specs (`project/`) and decision logs (`process/`).

## Local Development

Works the same on macOS, Linux, and Windows — the only requirements are [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + the Compose plugin on Linux) and Python 3.11+ (only needed for the optional re-seed script in step 3).

### 1. Configure environment

Copy the example env file and fill in the required values (Azure OpenAI/Speech keys, LiveKit credentials, Keycloak SSO config):

```bash
cp .env.example .env          # macOS/Linux/Git Bash
copy .env.example .env        # Windows (cmd.exe)
Copy-Item .env.example .env   # Windows (PowerShell)
```

### 2. Start the stack

```bash
docker compose -f ops/docker-compose.yml up -d --build
```

This brings up three containers:

| Container | Purpose | Port |
|---|---|---|
| `voice_agent_ui` | FastAPI backend + built React frontend | `3000` → `8080` |
| `voice_agent_postgres` | Customer DB (customers, properties, work orders) | `55432` → `5432` |
| `voice_agent_valkey` | Cache | `6380` → `6379` |

Open `http://localhost:3000` and sign in via Keycloak.

### 3. Customer DB seed data

On first boot (empty `pgdata` volume), Postgres automatically runs `ops/seed/init/01_seed_customer_db.sql`, which creates the `customers` / `properties` / `work_orders` tables and seeds them with 100 dummy customers, 5 properties, and 6 work orders (fixture data mirrors what's used in production, but it's synthetic — not real PII).

Browse the seeded customers from the app's sidebar under **Customer DB**. To test Customer DB voice mode end-to-end, start a call with **Customer DB** selected as the agent config mode and type one of the seeded phone numbers (e.g. `+358 40 123 4567`) into the Caller ID box — the agent should recognize the customer immediately instead of asking for their name.

If you need to re-seed a container that's already running (e.g. after manually clearing a table), or regenerate the init SQL after editing the fixture JSON in `ops/seed/data/`, run the script with your system's Python 3 command (`python3` on macOS/Linux, `python` on Windows) — it only needs the standard library and the `docker` CLI on your PATH, both already required to run the stack:

```bash
python3 ops/seed/seed_customer_db.py              # re-apply against the running postgres container
python3 ops/seed/seed_customer_db.py --write-sql  # regenerate ops/seed/init/01_seed_customer_db.sql
```

### 4. Resetting

To wipe local state (Postgres data, cache) and start fresh:

```bash
docker compose -f ops/docker-compose.yml down -v
docker compose -f ops/docker-compose.yml up -d --build
```
