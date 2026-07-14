# POC_Voice — Claude Context

## EC2 Instance
- **ID:** i-0c1559c373a0be0e9
- **Type:** t3.small | Ubuntu 24.04
- **Private IP:** 10.31.72.253 (no public IP)
- **Access:** SSM only (`aws ssm send-command --instance-ids i-0c1559c373a0be0e9`)
- **App dir:** /opt/poc-voice

## Public URL
- **Domain:** https://zora.dev.egsync.com (port 3000 exposed via LB)
- **LiveKit proxy:** wss://zora.dev.egsync.com/livekit → nginx → livekit:7880

## Running Containers (docker-compose.prod.yml)
| Container | Image | URL path |
|---|---|---|
| voice_nginx | nginx:alpine | 3000→80 (entry point) |
| voice_agent_service | poc-voice-voice-agent | `/` and `/voice` |
| livekit_server | livekit/livekit-server | host network (7880, 7881, 50000-50200) |
| email_agent_service | poc-voice-email-backend | `/email/api/` |
| email_frontend_service | poc-voice-email-frontend | `/email/` |
| voice_agent_postgres_prod | postgres:16-alpine | 5432 |
| voice_agent_valkey_prod | valkey:8-alpine | 6379 |
| email_mongodb | mongo:7 | 27017 |

## URL Map
- `https://zora.dev.egsync.com/` → voice agent (LiveKit demo)
- `https://zora.dev.egsync.com/voice` → redirect to `/`
- `https://zora.dev.egsync.com/email/` → email / invoice agent frontend
- `https://zora.dev.egsync.com/email/api/` → email agent backend API
- `wss://zora.dev.egsync.com/livekit/` → LiveKit signaling

## Deploy Flow
1. Edit code locally (POC_Voice and/or eg-invoice-assistant)
2. Package BOTH repos into one tarball:
   ```bash
   rm -rf /tmp/poc-voice-staging
   mkdir -p /tmp/poc-voice-staging/email_agent
   # Voice agent (exclude dev artifacts)
   rsync -a \
     --exclude='.claude' --exclude='.env' --exclude='.env.prod' --exclude='.git' \
     --exclude='frontend/node_modules' --exclude='voice_agent/.venv' --exclude='__pycache__' \
     /Users/nikxx/Documents/GitHub/POC_Voice/ /tmp/poc-voice-staging/
   # Email agent backend + frontend
   rsync -a --exclude='.git' --exclude='__pycache__' --exclude='.env' \
     /Users/nikxx/Documents/GitHub/eg-invoice-assistant/Backend \
     /tmp/poc-voice-staging/email_agent/
   rsync -a --exclude='.git' --exclude='node_modules' --exclude='.env.local' \
     /Users/nikxx/Documents/GitHub/eg-invoice-assistant/Frontend \
     /tmp/poc-voice-staging/email_agent/
   tar czf /tmp/poc-voice.tar.gz -C /tmp/poc-voice-staging .
   ```
3. Upload: `aws s3 cp /tmp/poc-voice.tar.gz s3://pitchsync/poc-voice/poc-voice.tar.gz`
4. Presign + SSM deploy — see deploy script pattern below

## SSM Deploy Pattern
```bash
source .env.prod
PRESIGNED_URL=$(aws s3 presign "s3://pitchsync/poc-voice/poc-voice.tar.gz" --expires-in 3600)

# Both files base64-encoded to avoid heredoc/quoting issues in SSM
LK_YAML_B64=$(printf 'port: 7880\nbind_addresses:\n  - ""\nrtc:\n  tcp_port: 7881\n  port_range_start: 50000\n  port_range_end: 50200\n  use_external_ip: false\n  node_ip: 18.198.144.82\n  skip_external_ip_validation: true\n  stun_servers: []\n  turn_servers:\n    - host: "a.relay.metered.ca:80"\n      username: openrelayproject\n      credential: openrelayproject\n      protocol: udp\n    - host: "a.relay.metered.ca:443"\n      username: openrelayproject\n      credential: openrelayproject\n      protocol: tcp\nturn:\n  enabled: true\n  domain: 18.198.144.82\n  udp_port: 3478\nredis:\n  address: localhost:6379\nlogging:\n  level: info\nkeys:\n  %s: %s\n' "$LIVEKIT_API_KEY" "$LIVEKIT_API_SECRET" | base64)

# IMPORTANT: deploy the ENTIRE .env.prod — never hand-pick a subset.
# Dropping vars (esp. LIVEKIT_PUBLIC_URL, AZURE_* keys) silently breaks the
# browser ("could not establish pc connection" = browser got ws://localhost:7880)
# and the agent (Azure plugins need AZURE_OPENAI_*/AZURE_SPEECH_*).
ENV_B64=$(base64 < .env.prod)

aws ssm send-command \
  --instance-ids "i-0c1559c373a0be0e9" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[
    \"set -e\",
    \"cd /opt/poc-voice\",
    \"curl -fsSL '$PRESIGNED_URL' -o poc-voice.tar.gz\",
    \"tar xzf poc-voice.tar.gz && rm poc-voice.tar.gz\",
    \"echo '${LK_YAML_B64}' | base64 -d > livekit.yaml\",
    \"echo '${ENV_B64}' | base64 -d > .env\",
    \"docker compose -f docker-compose.prod.yml down 2>/dev/null || true\",
    \"docker compose -f docker-compose.prod.yml up -d --build\",
    \"sleep 30\",
    \"docker compose -f docker-compose.prod.yml ps\"
  ]"
```

## Key Files
- `docker-compose.prod.yml` — prod orchestration (livekit + voice-agent + email-agent + nginx)
- `livekit.yaml` — livekit config (keys injected at deploy time via `printf`, never committed)
- `nginx/default.conf` — routes `/livekit/` → livekit, `/email/api/` → email-backend, `/email/` → email-frontend, `/` → voice-agent
- `.env.prod` — all secrets (gitignored)
- `voice_agent/` — Python FastAPI + LiveKit agents (port 8080)
- `email_agent/Backend/` — Invoice/email FastAPI agent (port 8000, built from eg-invoice-assistant)
- `email_agent/Frontend/` — Invoice/email Next.js UI (port 3000, basePath=/email)

## Email Agent Config Notes
- `DEV_MODE=true` — Keycloak auth bypassed on the A2A JSON-RPC endpoint for demo
- Shares `.env` with voice agent for AWS credentials (Bedrock + S3)
- MongoDB runs as separate container `email_mongodb` (no auth for demo)
- `INVOICE_SECRET_KEY`, `INVOICE_ADMIN_SECRET`, `INVOICE_EXT_SECRET`, `INVOICE_TOKEN` can be added to `.env.prod` for persistent secrets; otherwise demo defaults apply
- `EMAIL_KEYCLOAK_CLIENT_ID` in `.env.prod` to set the frontend Keycloak client (default: `invoice-assistant`)

## S3
- Bucket: `s3://pitchsync/poc-voice/poc-voice.tar.gz`
- Account: 457087769501

## Secrets Location
- All in `.env.prod` (local, gitignored)
- LiveKit keys written into `livekit.yaml` at deploy time via base64 (NEVER use `printf >>` — causes duplicate keys)
- EC2 `.env` written fresh on every deploy via SSM heredoc

## WebRTC Notes
- **Two URLs, do not confuse them:**
  - `LIVEKIT_URL=ws://livekit:7880` — INTERNAL, used by the agent worker + server.py (docker network)
  - `LIVEKIT_PUBLIC_URL=wss://zora.dev.egsync.com/livekit` — BROWSER-FACING, returned by `/token`
  - server.py `/token` returns `LK_PUBLIC` to the browser. If `LIVEKIT_PUBLIC_URL` is unset it
    defaults to `ws://localhost:7880` → browser tries to reach its own machine →
    **"could not establish pc connection"**. This was the regression from partial `.env` deploys.
- LiveKit on `network_mode: host` — bypasses docker NAT
- EIP: `18.198.144.82` (inbound 1:1 NAT → `10.31.72.253`); `--node-ip=18.198.144.82` (hardcoded in
  docker-compose.prod.yml) makes livekit advertise the EIP as its ICE candidate
- `use_external_ip: false` + `skip_external_ip_validation: true` + `stun_servers: []` in livekit.yaml
  prevent STUN from overriding node_ip with the NAT-GW outbound IP `3.76.158.13`
- Built-in TURN at `18.198.144.82:3478` UDP (relay range 30000-40000) for ICE fallback
- ICE port range: UDP 50000-50200 + TCP 7881 (on host via EIP)
- voice-agent + nginx use `extra_hosts: livekit:host-gateway` to reach host-networked livekit
- **Both livekit.yaml AND .env must be written fresh (base64 decode) on every deploy** — never append with `>>`, never hand-pick a subset of .env

## AWS
- Account: 457087769501
- Region: eu-central-1
- User: nikxx@egcops.onmicrosoft.com
