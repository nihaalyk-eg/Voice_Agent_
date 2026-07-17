# Architecture Docs

Technical documentation for how the Zora Voice Assistant actually works, split by concern:

- **[voice-agent-overview.md](voice-agent-overview.md)** — the system as a whole: components, the full call lifecycle from "Start Call" click to hangup, agent config modes (Simple / Form / Customer DB), and the env-var contract between the backend and the agent subprocess.
- **[agent-implementations.md](agent-implementations.md)** — the three interchangeable agent backends (Pipeline, Voice Live, Realtime API), how each is built, and why their latency profiles differ so much.
- **[livekit-integration.md](livekit-integration.md)** — how LiveKit specifically is used: rooms, agent dispatch, worker registration, token grants, self-hosted vs. Cloud, and the frontend connection flow.

Related docs, not duplicated here:
- Local dev setup (Docker, env vars, Customer DB seeding): [../../README.md](../../README.md)
- Safety/governance framing (capabilities, limitations, failure modes): [../system-card.md](../system-card.md)
