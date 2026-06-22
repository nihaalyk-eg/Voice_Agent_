#!/usr/bin/env bash
set -euo pipefail

# ── Colours ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✗${NC} $*"; exit 1; }
ask()  { echo -e "${CYAN}?${NC}  $*"; }

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}   Zora LiveKit Voice Agent — Setup${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Prerequisites ─────────────────────────────────────────────────────────
echo "Checking prerequisites..."

command -v docker &>/dev/null || err "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
docker info &>/dev/null       || err "Docker is not running. Start Docker Desktop and retry."
ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

command -v uv &>/dev/null || err "uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
ok "uv $(uv --version)"

echo ""

# ── 2. Credentials ───────────────────────────────────────────────────────────
if [ -f .env ]; then
    ok ".env already exists — skipping credential prompts"
    echo "   (delete .env and re-run to reconfigure)"
else
    warn ".env not found — enter your Azure credentials"
    echo ""

    ask "Azure OpenAI endpoint (e.g. https://my-resource.services.ai.azure.com):"
    read -r AZURE_OPENAI_ENDPOINT

    ask "Azure OpenAI API key:"
    read -rs AZURE_OPENAI_API_KEY; echo ""

    ask "Azure OpenAI deployment name (e.g. gpt-4.1-mini):"
    read -r CHAT_DEPLOYMENT_NAME

    ask "Azure Speech region (e.g. swedencentral):"
    read -r AZURE_SPEECH_REGION

    ask "Azure Speech key (press Enter to reuse OpenAI key):"
    read -rs AZURE_SPEECH_KEY_INPUT; echo ""
    AZURE_SPEECH_KEY="${AZURE_SPEECH_KEY_INPUT:-$AZURE_OPENAI_API_KEY}"

    echo ""
    ask "Langfuse base URL (optional, press Enter to skip):"
    read -r LANGFUSE_BASE_URL
    if [ -n "$LANGFUSE_BASE_URL" ]; then
        ask "Langfuse public key:"
        read -r LANGFUSE_PUBLIC_KEY
        ask "Langfuse secret key:"
        read -rs LANGFUSE_SECRET_KEY; echo ""
    fi

    cat > .env <<EOF
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
CHAT_DEPLOYMENT_NAME=${CHAT_DEPLOYMENT_NAME}
OPENAI_API_VERSION=2024-10-21

# Azure Speech
AZURE_SPEECH_KEY=${AZURE_SPEECH_KEY}
AZURE_SPEECH_REGION=${AZURE_SPEECH_REGION}

# LiveKit (local dev defaults — change for production)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_PUBLIC_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
LIVEKIT_NODE_IP=127.0.0.1

# Agent customisation
AGENT_INSTRUCTIONS=You are a helpful, concise voice assistant. Keep responses short and conversational.
AGENT_VOICE=en-US-AvaNeural
EOF

    if [ -n "$LANGFUSE_BASE_URL" ]; then
        cat >> .env <<EOF

# Langfuse observability
LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY}
LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY}
LANGFUSE_BASE_URL=${LANGFUSE_BASE_URL}
EOF
    fi

    ok ".env created"
fi

echo ""

# ── 3. Python deps ───────────────────────────────────────────────────────────
echo "Installing Python dependencies..."
uv sync --frozen -q
ok "Dependencies ready"
echo ""

# ── 4. Docker stack ──────────────────────────────────────────────────────────
echo "Starting Docker stack..."
docker compose up -d --build
echo ""

# ── 5. Health check ──────────────────────────────────────────────────────────
echo "Waiting for UI server..."
for i in $(seq 1 15); do
    if curl -sf http://localhost:8080/agent/status &>/dev/null; then
        break
    fi
    sleep 2
done

if curl -sf http://localhost:8080/agent/status &>/dev/null; then
    ok "Stack is up!"
else
    warn "UI server not responding yet — it may still be starting"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   Done! Open: http://localhost:8080${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "   Select an agent → ▶ Start → 🎤 Connect Mic → speak"
echo ""
echo "   Useful commands:"
echo "     make logs    — stream container logs"
echo "     make stop    — stop all containers"
echo "     make docker  — restart stack"
echo ""

# Auto-open browser on Mac
if command -v open &>/dev/null; then
    open http://localhost:8080
fi
