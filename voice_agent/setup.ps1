# Zora LiveKit Voice Agent — Windows Setup
# Run in PowerShell: .\setup.ps1

$ErrorActionPreference = "Stop"

function ok   { Write-Host "✓  $args" -ForegroundColor Green }
function warn { Write-Host "⚠  $args" -ForegroundColor Yellow }
function err  { Write-Host "✗  $args" -ForegroundColor Red; exit 1 }
function ask  { Write-Host "?  $args" -ForegroundColor Cyan }

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "   Zora LiveKit Voice Agent — Setup" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
Write-Host "Checking prerequisites..."

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    err "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
}
try { docker info 2>&1 | Out-Null } catch { err "Docker is not running. Start Docker Desktop and retry." }
ok "Docker $(docker --version)"

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    err "uv not found. Install: winget install astral-sh.uv"
}
ok "uv $(uv --version)"

Write-Host ""

# ── 2. Credentials ────────────────────────────────────────────────────────────
if (Test-Path .env) {
    ok ".env already exists — skipping credential prompts"
    Write-Host "   (delete .env and re-run to reconfigure)"
} else {
    warn ".env not found — enter your Azure credentials"
    Write-Host ""

    ask "Azure OpenAI endpoint (e.g. https://my-resource.services.ai.azure.com):"
    $AzureEndpoint = Read-Host

    ask "Azure OpenAI API key"
    $AzureKey = Read-Host -AsSecureString
    $AzureKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AzureKey))

    ask "Azure OpenAI deployment name (e.g. gpt-4.1-mini)"
    $Deployment = Read-Host

    ask "Azure Speech region (e.g. swedencentral)"
    $SpeechRegion = Read-Host

    ask "Azure Speech key (press Enter to reuse OpenAI key)"
    $SpeechKeyInput = Read-Host -AsSecureString
    $SpeechKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SpeechKeyInput))
    if ([string]::IsNullOrEmpty($SpeechKeyPlain)) { $SpeechKeyPlain = $AzureKeyPlain }

    ask "Langfuse base URL (optional, press Enter to skip)"
    $LangfuseUrl = Read-Host

    $envContent = @"
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=$AzureEndpoint
AZURE_OPENAI_API_KEY=$AzureKeyPlain
CHAT_DEPLOYMENT_NAME=$Deployment
OPENAI_API_VERSION=2024-10-21

# Azure Speech
AZURE_SPEECH_KEY=$SpeechKeyPlain
AZURE_SPEECH_REGION=$SpeechRegion

# LiveKit (local dev defaults)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_PUBLIC_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
LIVEKIT_NODE_IP=127.0.0.1

# Agent customisation
AGENT_INSTRUCTIONS=You are a helpful, concise voice assistant. Keep responses short and conversational.
AGENT_VOICE=en-US-AvaNeural
"@

    if (-not [string]::IsNullOrEmpty($LangfuseUrl)) {
        ask "Langfuse public key"
        $LfPublic = Read-Host
        ask "Langfuse secret key"
        $LfSecret = Read-Host -AsSecureString
        $LfSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($LfSecret))
        $envContent += @"

# Langfuse observability
LANGFUSE_PUBLIC_KEY=$LfPublic
LANGFUSE_SECRET_KEY=$LfSecretPlain
LANGFUSE_BASE_URL=$LangfuseUrl
"@
    }

    $envContent | Out-File -FilePath .env -Encoding utf8
    ok ".env created"
}

Write-Host ""

# ── 3. Python deps ────────────────────────────────────────────────────────────
Write-Host "Installing Python dependencies..."
uv sync --frozen -q
ok "Dependencies ready"
Write-Host ""

# ── 4. Docker stack ───────────────────────────────────────────────────────────
Write-Host "Starting Docker stack..."
docker compose up -d --build
Write-Host ""

# ── 5. Health check ───────────────────────────────────────────────────────────
Write-Host "Waiting for UI server..."
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        Invoke-WebRequest -Uri http://localhost:8080/agent/status -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true; break
    } catch { Start-Sleep 2 }
}

if ($ready) { ok "Stack is up!" } else { warn "UI server still starting — try again in a moment" }

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "   Done! Open: http://localhost:8080" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "   Select an agent → Start → Connect Mic → speak"
Write-Host ""

Start-Process "http://localhost:8080"
