# POC_Voice — Architecture Summary

## Overview

POC_Voice is a proof-of-concept AI-powered maintenance intake system for Finnish housing associations. It handles incoming fault reports from residents via two channels — real-time voice calls and email — and creates structured work orders in a pseudo-ERP system. An operator console provides live monitoring, cost tracking, and work order management.

---

## System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Operator)                        │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌────────────────────┐ │
│  │  Voice   │ │  Email    │ │  Work    │ │ Observability /    │ │
│  │ Console  │ │  Intake   │ │  Orders  │ │ Communications /   │ │
│  │  (SPA)   │ │  (SPA)    │ │  (SPA)   │ │ Customers (SPAs)   │ │
│  └────┬─────┘ └─────┬─────┘ └────┬─────┘ └─────────┬──────────┘ │
│       │ WebRTC      │ REST        │ REST             │ REST        │
└───────┼─────────────┼────────────┼──────────────────┼────────────┘
        │             │            │                  │
        │  ┌──────────▼────────────▼──────────────────▼──────────┐
        │  │              Express Server (Node.js 20)             │
        │  │                     server.js                        │
        │  │                                                      │
        │  │  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
        │  │  │  JWT Auth   │  │  REST Routes │  │  Session  │  │
        │  │  │  (Keycloak) │  │  (CRUD APIs) │  │ Endpoint  │  │
        │  │  └─────────────┘  └──────────────┘  └─────┬─────┘  │
        │  │                                            │         │
        │  │  ┌──────────────────────────────────────┐ │         │
        │  │  │         Email Parser                 │ │         │
        │  │  │  LLM (Azure OpenAI) → Regex Fallback │ │         │
        │  │  └──────────────────────────────────────┘ │         │
        │  └────────────────────────────────────────────┼─────────┘
        │                ┌──────────────┐               │
        │                │  PostgreSQL  │               │
        │                │  16-Alpine   │               │
        │                └──────────────┘               │
        │                ┌──────────────┐               │
        │                │   Valkey 8   │               │
        │                │  (Redis API) │               │
        │                └──────────────┘               │
        │                                               │
        ▼                                               ▼
┌───────────────────┐                    ┌─────────────────────────┐
│  OpenAI Realtime  │                    │      Azure OpenAI        │
│  API (WebRTC)     │                    │  (Email parsing / LLM)   │
│  gpt-realtime-2   │                    │  gpt-5.4-mini deployment │
└───────────────────┘                    └─────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 (Alpine) |
| Framework | Express | 4.19 |
| Database | PostgreSQL | 16 (Alpine) |
| Cache | Valkey (Redis-compatible) | 8 (Alpine) |
| Auth | Keycloak + JWT (jose) | 5.9 |
| Voice AI | OpenAI Realtime API (WebRTC) | gpt-realtime-2 |
| Email AI | Azure OpenAI (primary) / OpenAI (fallback) | gpt-5.4-mini / gpt-4o-mini |
| Frontend | Vanilla HTML/CSS/JS | — |
| Container | Docker + Docker Compose | — |

---

## Directory Structure

```
POC_Voice/
├── server.js                  # Main Express server (1321 lines)
├── package.json
├── Dockerfile
├── docker-compose.yml         # Dev: PostgreSQL + Valkey
├── docker-compose.prod.yml    # Prod: with resource limits + healthchecks
├── db/
│   ├── index.js               # PostgreSQL connection pool
│   ├── migrate.js             # Schema creation (5 tables)
│   └── seed.js                # Fixture loader
├── cache/
│   ├── index.js               # Valkey client + retry logic
│   └── keys.js                # Cache key constants + TTLs
├── data/
│   ├── properties.json        # 5 Helsinki properties
│   ├── customers.json         # 100 residents (20 per property)
│   ├── work_orders.json       # 6 sample WOs (voice + email)
│   ├── communications.json    # Sample transcripts
│   └── email_templates.json   # 4 test email templates
└── public/
    ├── index.html / app.js    # Voice agent console
    ├── work-orders.html/js    # Work order ERP dashboard
    ├── email.html/js          # Email intake interface
    ├── communications.html/js # Call & message history
    ├── customers.html/js      # Resident directory
    ├── observability.html/js  # Cost & metrics dashboard
    ├── shared.js              # Keycloak auth (shared)
    └── style.css              # 1700+ lines, dark theme
```

---

## Backend — server.js

### Authentication

All API routes are protected by a Keycloak JWT middleware. The server fetches the JWKS from the configured Keycloak realm and validates `Authorization: Bearer <token>` on each request. The `/health` endpoint is public.

### REST API Surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness probe (DB + cache) |
| POST | `/api/session` | Generate ephemeral WebRTC token for voice agent |
| GET | `/api/properties` | List all properties (cached 5 min) |
| GET | `/api/customers` | Search residents |
| GET | `/api/customers/by-phone/:phone` | Profile lookup by phone (cached 1 hr) |
| GET | `/api/work-orders` | List all work orders (cached 60 s) |
| POST | `/api/work-orders` | Create work order from voice agent tool call |
| PUT | `/api/work-orders/:id` | Update status / urgency |
| DELETE | `/api/work-orders/:id` | Delete work order |
| GET | `/api/communications` | Fetch call logs and email history |
| POST | `/api/communications` | Log transcript / SMS / escalation |
| POST | `/api/email-intake` | Parse email → create WO (atomic transaction) |
| POST | `/api/escalate` | Log emergency escalation |
| GET | `/api/email-templates` | Fetch test email templates (cached 10 min) |
| GET | `/api/observability/stats` | Cost + performance metrics |

### Voice Session Endpoint (`POST /api/session`)

Generates an ephemeral token to connect directly from the browser to the OpenAI Realtime API. The server:

1. Tries Azure OpenAI first; falls back to standard OpenAI
2. Looks up the caller by phone number in the `customers` table
3. Reads `language_preference` from the customer record (Finnish / Swedish / English)
4. Calls `buildLanguageBlock()` to produce a language-specific instruction block
5. Injects the full system instructions (persona + language + call flow) and attaches six tools

**Language Detection — `buildLanguageBlock(language, isKnownCaller)`**

Called at session-creation time before any instruction is sent to the model.

| Scenario | Behaviour |
|----------|-----------|
| Known caller, `language_preference = 'Finnish'` | System prompt instructs the agent to conduct the entire call in Finnish; includes Finnish greeting, confirmation question, master key ask, urgency line, and wrap-up |
| Known caller, `language_preference = 'Swedish'` | Same, fully in Swedish |
| Known caller, `language_preference = 'English'` | English (current baseline) |
| Unknown caller (no DB record) | Agent is told to auto-detect language from the caller's **first utterance**; defaults to Finnish if unclear; must not switch mid-call |

Finnish phrase set injected into system instructions:

| Purpose | Phrase |
|---------|--------|
| Greeting (known) | `Hyvää huomenta, [NAME]! Täällä on Zora, kiinteistöpalvelusi asiakaspalvelija.` |
| Greeting (unknown) | `Hyvää päivää! Täällä Zora, kiinteistöhuollon tuki.` |
| Confirmation | `Onko kaikki tämä oikein?` |
| Master key ask | `Saako isäntäavainta käyttää asuntoosi pääsyyn?` |
| Urgent dispatch | `Lähetän teknikon kahden tunnin kuluessa.` |
| Wrap-up | `Kiitos soitostasi. Hyvää päivänjatkoa!` |

Swedish and English equivalents follow the same structure.

**Agent Tools (7):**

| Tool | What it does |
|------|--------------|
| `get_customer_profile(phone)` | Looks up resident by phone number, returns name/address/apartment/language |
| `get_maintenance_person(address)` | Returns assigned technician name + phone for a property |
| `create_work_order(...)` | Creates a work order record in PostgreSQL, returns WO ID |
| `send_sms_confirmation(...)` | Logs an SMS communication record |
| `escalate_to_operator(...)` | Creates escalation record for emergency handoff |
| `save_call_transcript(...)` | Persists the full call summary and transcript |
| `end_call()` | Disconnects the call — only callable after `save_call_transcript` |

**Agent Call Flow (embedded instructions):**
1. Call `get_customer_profile` silently before speaking — greet by name if found
2. Classify the call: `fault_report`, `door_opening`, `key_loan`, or emergency
3. Gather issue details **one question at a time** — wait for each answer before asking the next
4. Confirm all details verbally before proceeding
5. Create work order, send SMS confirmation
6. Ask "Is there anything else I can help with?" — loop back to step 3 if yes
7. Call `save_call_transcript`
8. Deliver farewell in the correct language, then call `end_call`

### Email Parser (`parseEmailToWorkOrder`)

Two-tier strategy:

**Tier 1 — LLM (Azure OpenAI `gpt-5.4-mini` · fallback: OpenAI `gpt-4o-mini`):** Extracts a structured JSON object from free-text email:
- Property address (matched against known property list)
- Apartment number, common area flag
- Issue description + urgency classification
- Master key permission, special access notes
- Caller phone number (if present in body)

**Tier 2 — Regex Fallback:** Rule-based extraction if LLM fails or is unavailable:
- Finnish/English address patterns
- Apartment number regex
- Finnish common area keywords (`porraskäytävä`, `yhteinen`)
- Pet / gate code detection
- Emergency keywords (`kiireellinen`, `hätä`)

### Work Order Scheduling Logic

```
urgency === 'Urgent'   → "Immediate (Within 2 Hours)"
urgency === 'Standard' → "Next day, 9:00 AM"
```

Technician is auto-assigned by matching the property address to the `properties` table.

---

## Database Schema

### `properties`
Stores the 5 managed Helsinki properties with their assigned technicians.

```
id, address (UNIQUE), technician, technician_phone, company, created_at
```

### `work_orders`
Central ERP table. Populated by both voice agent tool calls and email intake.

```
id (WO-1234), property_address, apartment_number, is_common_area,
issue_description, permit_master_key, special_notes, caller_phone_number,
urgency_level [Standard|Urgent|Emergency|Low], technician, technician_phone,
status [Assigned|In Progress|Completed|Escalated|Pending],
scheduled_time, source [voice|email|sms|manual],
call_category [fault_report|door_opening|key_loan],
transcript_id, sender_email, created_at
```

### `communications`
Unified log for all interactions: call transcripts, SMS confirmations, email intakes, escalations.

```
id (COM-1234), type [call_transcript|sms_confirmation|email_intake|escalation],
timestamp, linked_work_order (FK → work_orders), caller_phone, recipient_phone,
summary, transcript (JSONB [{role, text}]), message, call_category,
duration_seconds, sender_email, original_email (JSONB), extracted_data (JSONB),
status, reason, property_address
```

### `customers`
Resident directory — 100 entries across 5 properties.

```
id, full_name, phone_number (UNIQUE), email, property_address,
apartment_number, language_preference [Finnish|Swedish|English], notes, created_at
```

### `email_templates`
Four pre-built test templates for the email intake demo screen.

```
id, label, from_address, subject, body
```

**Indexes:** On `properties(address)`, `work_orders(status, created_at, source)`, `communications(type, timestamp, linked_work_order)`, `customers(phone_number, property_address)`.

---

## Caching Layer (Valkey)

| Cache Key | TTL | Stores |
|-----------|-----|--------|
| `cache:properties:all` | 300 s | Full properties list |
| `cache:work_orders:all` | 60 s | Full work orders list |
| `cache:email_templates:all` | 600 s | Email templates |
| `cache:customer:<phone>` | 3600 s | Individual customer profile |

Cache invalidation uses pattern-based SCAN on mutations (work order create/update/delete). Write failures are non-blocking — the app degrades gracefully.

---

## Frontend Architecture

All pages are vanilla JS single-page apps served as static files from `public/`. No framework.

### Voice Console (`index.html` + `app.js`)

**Layout:** 3-panel operator console
- **Left:** Phone dialer + animated voice orb + call controls
- **Bottom-left:** Live cost tracker HUD (token counts + running dollar cost)
- **Right:** Live transcript feed + dynamic context extractor

**WebRTC Flow:**
1. `POST /api/session` → ephemeral token + WebRTC URL
2. Browser creates `RTCPeerConnection` to OpenAI Realtime API
3. Local mic stream → audio track on peer connection
4. Incoming audio track → speaker output
5. Data channel carries JSON events (tool calls, transcripts, cost updates)

**Transcript Feed — both sides shown:**
- Azure fires `response.output_audio_transcript.delta/done` (not the standard `response.audio_transcript.*` names) — both are handled with `||` so the app works on both Azure and standard OpenAI
- `response.output_audio_transcript.done` / `response.audio_transcript.done` → `finalizeAgentTranscript()`: finalises the bubble. If no delta arrived first (Azure behaviour where `done` precedes all deltas), creates a bubble directly
- `conversation.item.input_audio_transcription.completed` → appends a user bubble (requires `audio.input.transcription` in `session.update`)
- Duplicate prevention: `lastShownAgentItemId` tracks `event.item_id` — if both Azure and standard events fire for the same turn, the second is ignored

**Interruption Recovery:**
- `input_audio_buffer.speech_started` fires when the user speaks while the agent is talking; sets `wasInterrupted = true`
- Server VAD automatically truncates the agent's current response and generates a new one from conversation history
- No manual `response.create` nudge is sent — this caused "active response in progress" errors

**Agent-Driven Hang-up (`end_call` tool):**
The agent decides when to hang up — no hardcoded phrase matching or timers:
1. After confirming "anything else?" and receiving "no", agent calls `save_call_transcript` then `end_call`
2. `end_call` execution sets `endCallAfterSpeech = true` and returns a message telling the agent to deliver its farewell
3. When `response.output_audio_transcript.done` fires (agent finished speaking), `hangUp()` is called 800ms later
4. This ensures the farewell audio completes before the line drops
5. `cleanupCall()` resets `endCallAfterSpeech` and clears any pending timer

**Real-time Cost Tracking:**
Token pricing baked into `app.js`:
- Text input: $0.000005 / token
- Text output: $0.00002 / token
- Audio input: $0.00004 / token
- Audio output: $0.00008 / token

Updated live on every server event.

**Dynamic HUD Context Builder:**
Extracts and displays call context in real time as the agent gathers it: resident name, phone, property, apartment, issue, master key permission, assigned technician, urgency, ticket status.

### Other Pages

| Page | Purpose |
|------|---------|
| `work-orders` | ERP table with status badges, urgency, source (voice/email), filter by technician/property |
| `email` | Test email intake — pick template or write custom, see extraction results |
| `communications` | Filterable history of all calls, SMSs, email intakes |
| `customers` | Searchable resident directory |
| `observability` | Aggregated cost metrics, token breakdown, cache hit rate, latency |

### Auth (`shared.js`)

All pages initialize Keycloak.js. Token is refreshed before each API call. User name and avatar are displayed in the sidebar. Logout clears the Keycloak session.

---

## Key Data Flows

### Voice Call

```
Resident calls → Operator clicks "Start Call"
  → POST /api/session
  → Server returns ephemeral token
  → Browser opens WebRTC to OpenAI Realtime
  → Agent greets, identifies caller via get_customer_profile
  → Gathers issue details
  → Agent calls create_work_order (server executes, DB write)
  → Agent calls send_sms_confirmation (server logs communication)
  → Call ends → POST /api/communications (transcript persisted)
  → Cost tracker finalises
```

### Email Intake

```
Resident sends email (or operator submits template)
  → POST /api/email-intake { from, subject, body }
  → Server: parseEmailToWorkOrder()
      ├── LLM call (Azure OpenAI) → structured JSON
      └── Regex fallback (if LLM fails)
  → BEGIN TRANSACTION
      ├── INSERT work_orders
      └── INSERT communications (email_intake)
  → COMMIT
  → Invalidate work_orders cache
  → Return extraction results to frontend
```

---

## Deployment

### Development

```bash
npm install
npm run infra:up          # docker-compose up postgres + valkey
npm run db:migrate        # create tables
npm run db:seed           # load fixtures
npm run dev               # nodemon server on :3000
```

### Production

```bash
docker-compose -f docker-compose.prod.yml up -d
```

Resource limits in `docker-compose.prod.yml`:
- App: 1.0 CPU, 1 GB RAM
- PostgreSQL: 1.0 CPU, 1 GB RAM
- Valkey: 0.5 CPU, 512 MB RAM

Health check: `GET /health` every 30 s (checks DB connection + cache ping).

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI base URL (email LLM, session fallback) |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI key |
| `CHAT_DEPLOYMENT_NAME` | Azure deployment name (e.g. `gpt-5.4-mini`) |
| `PORT` | Server port (default 3000) |
| `KEYCLOAK_URL` | Keycloak base URL |
| `KEYCLOAK_REALM` | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | Backend client ID |
| `KEYCLOAK_CLIENT_SECRET` | Backend client secret |
| `DATABASE_URL` | PostgreSQL connection string |
| `VALKEY_URL` | Valkey/Redis connection string |

---

## Security Notes

- All API routes require a valid Keycloak JWT — no anonymous access
- JWKS fetched from Keycloak at startup; tokens verified cryptographically
- Ephemeral WebRTC tokens are short-lived and scoped per session
- Azure OpenAI key and DB credentials stored in environment, not source code
- SQL queries use parameterised statements via `pg` pool (no interpolation)

---

## Design Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| Vanilla JS frontend | Minimises build complexity for a POC; no bundler needed |
| LLM-first, regex-fallback email parsing | LLM handles Finnish language variation; regex ensures uptime if API is down |
| Ephemeral WebRTC tokens | Browser never holds persistent OpenAI credentials |
| Valkey (Redis API) instead of Redis | Drop-in compatible, open-source, no licensing concerns |
| Dual OpenAI provider (Azure + standard) | Azure for compliance/latency in EU; standard OpenAI as fallback |
| Inline agent tools vs server-side webhooks | Tools execute on same Express server, keeping state consistent without a separate webhook service |
| Language determined at session-creation time | `customers.language_preference` is read in the same DB lookup that already runs before `POST /api/session` returns — zero extra round-trips. Unknown callers get a speech auto-detection instruction instead |
| Finnish default for unknown callers | All properties are in Helsinki; defaulting to Finnish is the statistically correct choice and avoids an English-only fallback for a Finnish-speaking customer base |

---

## UI Screens — Layout & Components

The app is a dark-themed, single-sidebar operator console. All pages share the same sidebar, header pattern, and Keycloak auth.

### Navigation Sidebar (all pages)

```
┌──────────────────┐
│  🎙 Kiinteistö   │  ← brand
├──────────────────┤
│  📞 Voice Agent  │  ← active page
│  ✉  Email Agent  │
│  🛡 Admin ▾      │  ← collapsible accordion
│    🕐 Communications│
│    👥 Customers   │
│    🧾 Work Orders │
│  📈 Observability │
├──────────────────┤
│  [avatar] Operator│  ← Keycloak user name
│  Sign Out        │
└──────────────────┘
```

---

### Screen 1 — Voice Agent Console (`index.html`)

The primary operator screen. Three-panel layout.

```
┌────────────────────────────────────────────────────────────┐
│ HEADER: Voice Agent Console    [status badge: IDLE/LIVE]   │
├────────────────────────┬───────────────────────────────────┤
│   DIALER CARD          │   LIVE TRANSCRIPT FEED             │
│                        │                                    │
│   [Phone number input] │   Operator: Hello, how can I…     │
│   [Numpad 1-9, *, 0, #]│   Resident: My sink is leaking…   │
│   [🎙 Voice Orb        │   Operator: I see, let me look…   │
│    animated glow ring] │   …                               │
│   [▶ Start Call]       │                                   │
│   [🔇 Mute]            ├───────────────────────────────────┤
│   [🟢 Active bars]     │   DYNAMIC HUD CONTEXT BUILDER      │
│                        │                                    │
│   LIVE COST TRACKER    │   Resident Name   ✅ Aleksi V.    │
│   ┌────────────────┐   │   Phone           ✅ +358 40…     │
│   │ 🎙 Audio In    │   │   Property        ✅ Mannerheim…  │
│   │ 🔊 Audio Out   │   │   Apartment       ✅ A3           │
│   │ 📝 Tokens      │   │   Issue           ⏳ Gathering…  │
│   │ 💰 $0.0024     │   │   Master Key      ⏳ —           │
│   └────────────────┘   │   Technician      ⏳ —           │
│                        │   Urgency         ⏳ —           │
│                        │   Ticket          ⏳ —           │
└────────────────────────┴───────────────────────────────────┘
```

**Key UI elements:**
- **Voice Orb:** Animated microphone with a glowing pulsing ring that activates during a live call. Ring color shifts violet (idle) → cyan (speaking) → orange (agent processing).
- **Visualizer Bars:** Two rows of animated frequency bars — one for mic input level, one for agent output level.
- **Cost Tracker HUD:** Updates in real time on every token event. Shows audio-in, audio-out, text token counts, and a running dollar total.
- **Dynamic HUD:** Each field starts as `—` (pending) and flips to ✅ with the extracted value as the agent gathers information during the call. Fields: Resident Name, Phone, Property Address, Apartment Number, Issue Description, Master Key Permission, Technician Assigned, Urgency Level, Ticket Status.
- **Escalation Banner:** A full-width emergency alert strip shown when `escalate_to_operator` fires — with dismiss button.
- **Status Badge:** Top-right badge — `OFF-LINE`, `CONNECTING`, `LIVE`, `PROCESSING`.

---

### Screen 2 — Email Agent (`email.html`)

Three-region layout: full-height left form panel + right column with two stacked cards.

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER: Email Agent            [● AI Agent Ready]                    │
├────────────────────────────┬─────────────────────────────────────────┤
│  LEFT — FORM PANEL         │  RIGHT TOP — AI EXTRACTION RESULTS      │
│                            │                                         │
│  Quick Templates:          │  [empty / processing orb / result]      │
│  [Leaking Pipe] [Elevator] │                                         │
│  [Heating] [Parking Light] │  On success shows:                      │
│                            │   WO-5075 Created                       │
│  From (Sender Email)       │   [Matched Customer] [AI Agent] [1.2s]  │
│  [input + magnifier icon]  │                                         │
│  ┌─────────────────────┐   │   Resident profile card (if matched):   │
│  │ Known Resident      │   │     initials avatar, name, phone        │
│  │ AV Aleksi Virtanen  │   │                                         │
│  │ +358 40 123 4567    │   │   Extraction Grid (2-col):              │
│  │ Mannerheimintie A3  │   │   Property (full-width)                 │
│  │ Language: Finnish   │   │   Apartment  |  Contact Phone           │
│  │ Notes: Has a dog    │   │   Master Key |  Technician              │
│  │ Address pre-fill    │   │   Scheduled  |                          │
│  └─────────────────────┘   │   Issue Description (full-width)        │
│      OR                    │   Special Notes (full-width)            │
│  ┌─────────────────────┐   │                                         │
│  │ Unknown Sender      │   ├─────────────────────────────────────────┤
│  │ AI will auto-create │   │  RIGHT BOTTOM — RECENTLY PROCESSED      │
│  └─────────────────────┘   │                                         │
│                            │  #WO-5075  01.06.2026  14:32           │
│  Subject: [input]          │  liisa.virtanen@gmail.com               │
│  Body:    [textarea]       │  Slow drip under kitchen sink           │
│                            │  Hämeentie 23, Helsinki  [processed]    │
│  [Robot Process with AI]   │                                         │
│                            │  #WO-7221  26.05.2026  14:20           │
│                            │  anna.koskinen@email.fi                 │
│                            │  Bathroom faucet dripping               │
│                            │  Hämeentie 23, Helsinki  [processed]    │
└────────────────────────────┴─────────────────────────────────────────┘
```

**Key features:**

- **Live sender resolution** — as the operator types into the From field, a debounced lookup (500 ms) fires `GET /api/customers/by-email/:email`. A card appears inline below the input:
  - **Known Resident card** — shows initials avatar, full name, phone, property, apartment, language preference, notes, and a hint that address/apartment will be pre-filled by AI.
  - **Unknown Sender card** — informs the operator that AI will attempt to extract details from the email body and auto-create a customer record if name + phone are found.
- **Template auto-triggers lookup** — loading a quick template also fires the sender lookup for the pre-filled From address, and the Subject placeholder updates to hint the known property.
- **Processing animation** — while the API call is in-flight, the results panel shows a 4-step animated sequence (each step activates every ~800 ms):
  1. Parsing email content
  2. Matching customer profile
  3. LLM extraction
  4. Creating work order
- **Rich extraction results** — the result card shows:
  - WO ID confirmation header with green check icon
  - Three meta-badges: `Matched Customer` / `New Customer Created`, `AI Agent` / `Regex Fallback`, elapsed seconds
  - Matched resident profile card (initials avatar, name, phone, email) or new resident card
  - Urgency tag (red for Urgent/Emergency, green for Standard)
  - 2-column extraction grid: Property, Apartment, Contact Phone, Master Key (YES/NO icon badges), Technician, Scheduled Time, Issue Description, Special Notes
- **Recently Processed feed** — bottom-right card loads the last 10 `email_intake` communications on page load via `GET /api/communications?type=email_intake&limit=10`. New submissions prepend a flashing new entry. Each entry shows: WO ID, Finnish-locale timestamp, sender email, issue excerpt, property address, status badge.

---

### Screen 3 — Work Orders (`work-orders.html`)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: Work Orders                  [🔍 Search]             │
│         Filters: [Technician ▾] [Property ▾] [Status ▾]    │
├──────┬───────────────┬──────────┬────────────┬──────────────┤
│ ID   │ Issue         │ Status   │ Urgency    │ Source       │
├──────┼───────────────┼──────────┼────────────┼──────────────┤
│WO-xxx│ Radiator cold │ 🟡 In Prog│ Standard   │ 📞 voice    │
│WO-xxx│ Sink leaking  │ 🟠 Assigned│ 🔴 Urgent │ ✉ email    │
│WO-xxx│ Light bulb    │ ✅ Completed│ Standard │ 📞 voice   │
│ …   │ …             │ …        │ …          │ …            │
└──────┴───────────────┴──────────┴────────────┴──────────────┘
```

Each row shows: WO ID, property, apartment, issue (truncated), status badge, urgency badge, scheduled time, source badge (voice/email), technician name. Clicking a row expands details. Status can be updated inline.

---

### Screen 4 — Communications (`communications.html`)

Filterable log of all system interactions. Tabs/filter: All, Call Transcripts, SMS, Email Intakes, Escalations.

Each entry shows: timestamp, type badge, linked WO ID, caller/sender, summary. Call transcripts expand to show full `[{role, text}]` message thread.

---

### Screen 5 — Customers (`customers.html`)

```
┌───────────────────────────────────────────────────────────┐
│ HEADER: Residents              [🔍 Search by name/phone]  │
├──────────────┬──────────────────┬────────────────┬────────┤
│ Name         │ Phone            │ Property/Apt   │ Lang   │
├──────────────┼──────────────────┼────────────────┼────────┤
│ Aleksi V.    │ +358 40 123 4567 │ Mannerheim A3  │ FI     │
│ Anna K.      │ +358 40 234 5678 │ Mannerheim A5  │ FI     │
│ Mikael L.    │ +358 40 567 8901 │ Mannerheim B2  │ SV     │
│ …            │ …               │ …              │ …      │
└──────────────┴──────────────────┴────────────────┴────────┘
```

Notes column shows pet alerts, gate codes, special access instructions. 100 rows total (20 per property).

---

### Screen 6 — Observability (`observability.html`)

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER: Observability & Cost Tracking                        │
├────────────┬──────────────┬──────────────┬───────────────────┤
│ VOICE CALLS│ EMAIL PARSED │ CACHE HIT    │ AVG LATENCY       │
│  47 total  │  12 total    │  92.4%       │  1.14s            │
│  $1.24     │  $0.18       │              │                   │
├────────────┴──────────────┴──────────────┴───────────────────┤
│  TOKEN BREAKDOWN                                              │
│  Audio Input:  3,240,000 tokens   $0.13                      │
│  Audio Output: 1,820,000 tokens   $0.15                      │
│  Text Input:      48,000 tokens   $0.00                      │
│  Text Output:      8,200 tokens   $0.00                      │
└───────────────────────────────────────────────────────────────┘
```

Metrics are fetched from `GET /api/observability/stats`. Cache hit rate (92.4%) and latency (1.14s ± 0.06s) are simulated with realistic noise on each request to make the dashboard feel live.

---

## Dummy / Seed Data

### Properties (5 entries)

| ID | Address | Technician | Phone | Company |
|----|---------|-----------|-------|---------|
| prop1 | Mannerheimintie 10, Helsinki | Matti Meikäläinen | +358 50 111 2222 | Keskustan Kiinteistöhuolto Oy |
| prop2 | Hämeentie 23, Helsinki | Sanna Sillanpää | +358 50 333 4444 | Kallion Huoltopalvelut |
| prop3 | Runeberginkatu 5, Helsinki | Pekka Puupää | +358 50 555 6666 | Töölön Kiinteistöhuolto |
| prop4 | Fredrikinkatu 15, Helsinki | Matti Meikäläinen | +358 50 111 2222 | Keskustan Kiinteistöhuolto Oy |
| prop5 | Aleksanterinkatu 30, Helsinki | Juha Koivisto | +358 50 999 8888 | Eteläisen Alueen Huolto Oy |

Note: Matti Meikäläinen covers two properties (prop1 + prop4).

---

### Customers (100 entries — 20 per property)

All customers have Finnish phone numbers (+358 40/41/44/45/46/50 prefix range). Most prefer Finnish; a few prefer Swedish (e.g. Mikael Laine — Mannerheim B2). Customer notes include real-world access details baked in:

**Sample notes included:**
- "Has a dog / cat" — technician must be careful at door
- "Gate code: 4521 / 8899 / 3377" — access codes for specific properties
- "Works night shifts, please call before visiting"
- "Elderly resident, moves slowly"
- "Newborn baby in apartment"
- "Allergic to pets"
- "Prefers text messages"
- "Retired, home most of the day"

**Sample customers (first 10 — Mannerheimintie 10):**

| ID | Name | Phone | Apt | Language | Notes |
|----|------|-------|-----|----------|-------|
| cust001 | Aleksi Virtanen | +358 40 123 4567 | A3 | Finnish | Has a dog |
| cust002 | Anna Korhonen | +358 40 234 5678 | A5 | Finnish | — |
| cust003 | Juhani Mäkinen | +358 40 345 6789 | A7 | Finnish | Works night shifts |
| cust005 | Mikael Laine | +358 40 567 8901 | B2 | **Swedish** | Prefers Swedish |
| cust006 | Laura Heikkinen | +358 40 678 9012 | B4 | Finnish | Has young children |
| cust008 | Maria Nieminen | +358 40 890 1234 | B8 | Finnish | Elderly resident |
| cust009 | Antti Koskinen | +358 40 901 2345 | A2 | Finnish | Gate code: 4521 |
| cust011 | Ville Lehtinen | +358 41 123 4567 | A6 | Finnish | Has a cat |
| cust019 | Kari Pitkänen | +358 41 901 2345 | B10 | Finnish | Works from home |

---

### Work Orders (6 seed entries)

| WO ID | Source | Status | Urgency | Property | Apt | Issue |
|-------|--------|--------|---------|----------|-----|-------|
| WO-2501 | voice | Assigned | Standard | Kuisekatu 2, Mäntylä | 1375 | Water leakage in washroom |
| WO-5075 | **email** | Assigned | **Urgent** | Hämeentie 23 | B12 | Slow drip from kitchen sink pipe |
| WO-5649 | voice | **Completed** | Standard | Work Work Triangle, Mangalore | 1134 | No power in apartment |
| WO-9842 | voice | **In Progress** | Standard | Mannerheimintie 10 | Apt A3 | Living room radiator cold (air pocket) |
| WO-9839 | voice | **Completed** | Standard | Runeberginkatu 5 | Common Area | Stairwell light fixture burned out |
| WO-7221 | **email** | Assigned | Standard | Hämeentie 23 | B5 | Bathroom faucet dripping constantly |

Notable special notes in seed WOs:
- WO-5075: "Has a cat, careful at door; available Mon–Fri 8–17"
- WO-9842: "Friendly golden retriever — ring bell first"
- WO-9839: "Main entrance code: 4589#"
- WO-5649: "Regional backup technician assigned" (outside known properties — tests parser fallback)

---

### Email Templates (4 entries for demo testing)

| ID | Label | Sender | Issue | Property | Apt | Special |
|----|-------|--------|-------|----------|-----|---------|
| tpl-1 | Leaking Pipe — Apartment | liisa.virtanen@gmail.com | Kitchen sink drip | Hämeentie 23 | B12 | Cat; available Mon–Fri 8–17; master key OK |
| tpl-2 | Broken Elevator — Common Area | mikko.korhonen@outlook.com | Elevator stuck at 3rd floor | Mannerheimintie 10 | Common area | — |
| tpl-3 | Heating Issue — Apartment | anna.nieminen@yahoo.com | All radiators cold | Fredrikinkatu 15 | 4A | Master key OK |
| tpl-4 | Parking Lot Light — Common Area | jari.makinen@gmail.com | Outdoor light broken for a week | Runeberginkatu 5 | Common area | Gate code: 7712# |

Templates are designed to exercise different extraction scenarios: apartment vs common area, urgent vs standard, master key permission, pet notes, gate codes, phone numbers in body text.

---

## End-to-End Process Flows

### Process 1 — Voice Call (Happy Path)

```
┌─ OPERATOR ──────────────────────────────────────────────────────────────┐
│  1. Opens Voice Agent Console                                           │
│  2. Types resident phone number: +358 40 123 4567                       │
│  3. Clicks "Start Call"                                                 │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ BROWSER → SERVER ──────────────────────────────────────────────────────┐
│  POST /api/session { phone: "+358 40 123 4567" }                        │
│    ├── Verify Keycloak JWT                                              │
│    ├── SELECT from customers WHERE phone_number = callerPhone           │
│    │     ├── Found → callerLanguage = c.language_preference, isKnown=true
│    │     └── Not found → callerLanguage = 'Finnish' (default), isKnown=false
│    ├── buildLanguageBlock(callerLanguage, isKnownCaller)                │
│    │     → injects language-specific phrases + detection instruction   │
│    ├── Attach 6 tool definitions                                        │
│    └── Call Azure OpenAI → generate ephemeral WebRTC token             │
│  Response: { client_secret, sdp_url }                                  │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ BROWSER ↔ OPENAI REALTIME (WebRTC) ────────────────────────────────────┐
│  Browser creates RTCPeerConnection                                      │
│  Opens data channel "oai-events"                                        │
│  Mic audio → audio track → OpenAI Realtime API                         │
│  OpenAI audio → audio track → browser speaker                          │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ AGENT TURN 1: Identify Caller ─────────────────────────────────────────┐
│  Agent emits tool_call: get_customer_profile("+358 40 123 4567")        │
│  Browser forwards to: GET /api/customers/by-phone/+358 40 123 4567      │
│    ├── Check Valkey cache (key: cache:customer:+358 40 123 4567)        │
│    ├── Cache miss → SELECT from customers                               │
│    └── Cache set (TTL 3600s) → return { full_name, property, apt }     │
│  Agent receives: { full_name: "Aleksi Virtanen", property: "Mannerheimintie 10", apt: "A3" }
│  HUD updates: Resident Name ✅, Phone ✅, Property ✅, Apartment ✅     │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ AGENT TURN 2: Gather Issue Details ────────────────────────────────────┐
│  Agent (audio): "Hello Aleksi! I can see you're at Mannerheimintie 10, │
│                  apartment A3. How can I help you today?"               │
│  Resident (audio): "My living room radiator is completely cold."        │
│  Agent: "I see. May I use the master key to access your apartment       │
│          if you're not home?"                                           │
│  Resident: "Yes, that's fine."                                          │
│  HUD updates: Issue ✅, Master Key ✅                                    │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ AGENT TURN 3: Look Up Technician ──────────────────────────────────────┐
│  Agent emits tool_call: get_maintenance_person("Mannerheimintie 10, Helsinki")
│  Browser → GET /api/properties (cached)                                │
│  Returns: { technician: "Matti Meikäläinen", phone: "+358 50 111 2222" }│
│  HUD updates: Technician ✅                                              │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ AGENT TURN 4: Confirm & Create ────────────────────────────────────────┐
│  Agent (audio): "To confirm: radiator fault at Mannerheimintie 10, A3. │
│                  Standard urgency. Matti Meikäläinen will visit         │
│                  tomorrow at 9:00 AM. Shall I proceed?"                │
│  Resident: "Yes please."                                                │
│                                                                         │
│  Agent emits tool_call: create_work_order({                            │
│    property: "Mannerheimintie 10, Helsinki", apartment: "A3",          │
│    issue: "Living room radiator cold", urgency: "Standard",             │
│    permit_master_key: true, caller_phone: "+358 40 123 4567"           │
│  })                                                                     │
│  Browser → POST /api/work-orders                                        │
│    ├── INSERT INTO work_orders (WO-xxxx)                               │
│    ├── Assign technician from properties table                          │
│    ├── Set scheduled_time = "Next day, 9:00 AM"                        │
│    └── Invalidate cache:work_orders:all                                │
│  Returns: { id: "WO-3421", technician: "Matti Meikäläinen" }           │
│  HUD updates: Ticket ✅ WO-3421, Urgency ✅ Standard                    │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ AGENT TURN 5: SMS Confirmation ────────────────────────────────────────┐
│  Agent emits tool_call: send_sms_confirmation({                        │
│    to: "+358 40 123 4567",                                             │
│    message: "WO-3421 created. Matti Meikäläinen arrives tomorrow 9AM." │
│  })                                                                     │
│  Browser → POST /api/communications (type: sms_confirmation)           │
│  Agent tells caller: ticket number, technician name, arrival time      │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ AGENT TURN 6: Anything Else? ──────────────────────────────────────────┐
│  Agent: "Is there anything else I can help you with?"                  │
│    ├── YES → loop back to AGENT TURN 2 for new request                 │
│    └── NO  → proceed to transcript + farewell                          │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ AGENT TURN 7: Save + Farewell + Hang-up ───────────────────────────────┐
│  Agent emits tool_call: save_call_transcript({ summary, work_order })  │
│  Browser → POST /api/communications (type: call_transcript)            │
│                                                                         │
│  Agent emits tool_call: end_call()                                     │
│    → endCallAfterSpeech = true                                         │
│    → tool result: "Deliver farewell, call will disconnect."            │
│                                                                         │
│  Agent speaks farewell: "Kiitos soitostasi. Hyvää päivänjatkoa!"       │
│    → response.output_audio_transcript.done fires                       │
│    → 800ms timer → hangUp()                                            │
│    → RTCPeerConnection closed, streams stopped                         │
│                                                                         │
│  (OR: Operator clicks "End Call" at any time → hangUp() immediately)   │
└────────────────────────────────────────────────────────────────────────┘

┌─ INTERRUPTION SCENARIO (mid-call) ──────────────────────────────────────┐
│  Agent: "Saako isäntäavainta käyttää..." (mid-sentence)                │
│  User speaks (interrupts)                                               │
│    → input_audio_buffer.speech_started fires → wasInterrupted = true  │
│    → Server VAD truncates current agent response automatically         │
│    → New response generated from full conversation history             │
│    → Agent re-asks: "Saako isäntäavainta käyttää asuntoosi pääsyyn?"  │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Process 2 — Email Intake (Happy Path)

```
┌─ OPERATOR ──────────────────────────────────────────────────────────────┐
│  1. Opens Email Agent screen                                            │
│  2. Selects template "Leaking Pipe — Apartment"                         │
│  3. Form pre-fills: From = liisa.virtanen@gmail.com, Subject, Body     │
│     → Template load auto-triggers sender lookup                        │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ LIVE SENDER RESOLUTION (500ms debounce) ───────────────────────────────┐
│  GET /api/customers/by-email/liisa.virtanen@gmail.com                  │
│    ├── Verify Keycloak JWT                                              │
│    └── SELECT FROM customers WHERE email = ?                           │
│                                                                         │
│  Found → render "Known Resident" card:                                 │
│    Name: Liisa Virtanen · Phone: +358 40 888 1111                      │
│    Property: Hämeentie 23 · Apt: B12 · Lang: Finnish                   │
│    Notes: Has a cat                                                     │
│                                                                         │
│  Not found → render "Unknown Sender" card:                             │
│    "AI will extract details and auto-create customer record"            │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼ Operator clicks "Process with AI Email Agent"
┌─ PROCESSING ANIMATION ──────────────────────────────────────────────────┐
│  Results panel shows 4-step progress (800ms per step):                 │
│  1. Parsing email content      (active)                                │
│  2. Matching customer profile  (pending → active)                      │
│  3. LLM extraction             (pending → active)                      │
│  4. Creating work order        (pending → active)                      │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ POST /api/email-intake ────────────────────────────────────────────────┐
│  Body: { from, subject, body }                                          │
│    ├── Verify Keycloak JWT                                              │
│    ├── Fetch properties list (from cache or DB)                        │
│    └── parseEmailToWorkOrder(email, properties)                        │
│                                                                         │
│  LLM TIER (Azure OpenAI gpt-5.4-mini / fallback gpt-4o-mini):          │
│    ├── Prompt: "Extract maintenance request as JSON from this email"   │
│    ├── Include known property address list for matching                │
│    └── Response: {                                                     │
│          property_address: "Hämeentie 23, Helsinki",                   │
│          apartment_number: "B12",                                       │
│          is_common_area: false,                                         │
│          issue_description: "Slow drip under kitchen sink",            │
│          urgency_level: "Urgent",                                       │
│          permit_master_key: true,                                       │
│          special_notes: "Has a cat; available Mon-Fri 8-17",           │
│          caller_phone: "+358 40 888 1111"                               │
│        }                                                               │
│                                                                         │
│  FALLBACK TIER (Regex — if LLM fails):                                 │
│    ├── Extract address via Finnish street name patterns                │
│    ├── Apartment: /apt\.?\s*([A-Z]?\d+[A-Z]?)/i                       │
│    ├── Emergency: /kiireellinen|hätä|urgent/i                          │
│    └── Phone: /\+?358[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}/              │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ ATOMIC DB TRANSACTION ─────────────────────────────────────────────────┐
│  BEGIN                                                                  │
│    ├── INSERT INTO work_orders (WO-5075, source='email', urgency='Urgent')
│    │     ├── Assign technician from properties (Sanna Sillanpää)       │
│    │     └── scheduled_time = "Immediate (Within 2 Hours)"             │
│    └── INSERT INTO communications (type='email_intake',                │
│              original_email JSONB, extracted_data JSONB)               │
│  COMMIT                                                                 │
│  Invalidate cache:work_orders:all                                       │
└────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─ RESPONSE TO FRONTEND ──────────────────────────────────────────────────┐
│  {                                                                      │
│    work_order: { id, property, apartment, urgency, technician, ... },  │
│    extraction_report: { resident_name, ... },                          │
│    customer_matched: true,                                              │
│    known_customer: { full_name, phone_number, email },                 │
│    parsing_method: "llm"                                               │
│  }                                                                      │
│                                                                         │
│  Frontend renders rich result panel:                                   │
│    - WO-5075 Created header with meta-badges                           │
│    - Matched resident profile card (Liisa Virtanen)                    │
│    - Urgency: Urgent (red tag)                                          │
│    - Full extraction grid                                               │
│    - New entry prepended to Recently Processed feed with flash         │
│    - Form reset, sender card cleared                                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Process 3 — Work Order Lifecycle

```
Created (voice or email)
    │
    ▼
[Assigned] ──────────────────── Technician notified (via SMS log)
    │
    ▼
[In Progress] ─────────────────  Operator updates status manually
    │
    ├──→ [Completed] ───────────  Fault resolved
    │
    └──→ [Escalated] ───────────  Emergency detected during call
              │                   (escalate_to_operator tool fires)
              ▼
         Escalation banner shown on operator screen
         POST /api/escalate logs reason + property + phone
```

---

### Process 4 — Emergency Escalation (Voice)

```
Resident (audio): "The ceiling is collapsing, there's water everywhere!"
Agent detects: urgency_level = "Emergency" (keyword detection)
Agent emits tool_call: escalate_to_operator({
    reason: "Ceiling collapse, water flooding",
    caller_phone: "+358 40 123 4567",
    property_address: "Mannerheimintie 10, Helsinki"
})
Browser → POST /api/escalate
  ├── INSERT INTO communications (type='escalation')
  └── INSERT INTO work_orders (status='Escalated', urgency='Emergency')

Browser receives tool result
  └── Shows full-width red banner:
      "EMERGENCY ESCALATION — Transferring to 24/7 operator"
      [Dismiss ✕]
```

---

## Internal Technical Flowcharts

### Voice Agent — Full Technical Flow

```
OPERATOR                     BROWSER (app.js)                SERVER (server.js)            AZURE / OPENAI
──────────                   ────────────────                 ──────────────────            ──────────────
Enter phone number
Click "Start Call"
                             POST /api/session
                             { caller_phone }
                                                              SELECT customers
                                                              WHERE phone = ?
                                                               ├─ Found:
                                                               │   callerLanguage = preference
                                                               │   isKnownCaller = true
                                                               └─ Not found:
                                                                   callerLanguage = 'Finnish'
                                                                   isKnownCaller = false
                                                              buildLanguageBlock()
                                                              Build systemInstructions
                                                              POST /openai/v1/realtime/
                                                                   client_secrets
                                                              { type, model, instructions,
                                                                audio.output.voice }
                                                                                            Return ephemeral token
                             RTCPeerConnection created
                             getUserMedia (mic)
                             createDataChannel('oai-events')
                             createOffer → POST /realtime/calls
                                                                                            SDP answer returned
                             setRemoteDescription
                             Data channel OPEN
                             → session.update sent
                               { instructions, tools,
                                 audio.input.transcription }
                             → response.create (trigger greeting)
                                                                                            get_customer_profile
                                                                                            tool_call fired
                             executeTool('get_customer_profile')
                             GET /api/customers/by-phone/:phone
                             Valkey cache check
                              ├─ HIT: return cached profile
                              └─ MISS: SELECT from DB → cache
                             submitToolResult → response.create
                                                                                            Agent speaks greeting
                             response.output_audio_transcript.done
                             → appendTranscriptBubble('agent')
                             → renderLiveContextTable (HUD update)

GATHER LOOP (one Q at a time):
                                                                                            Agent asks Q1: problem
                             User speaks
                             conversation.item.input_audio_
                               transcription.completed
                             → appendTranscriptBubble('user')
                                                                                            Agent asks Q2, Q3, Q4...
                                                                                            get_maintenance_person
                                                                                            tool_call fired
                             executeTool('get_maintenance_person')
                             properties[] lookup (in-memory)
                             submitToolResult → response.create
                                                                                            Agent confirms all details

                                                                                            create_work_order tool_call
                             executeTool('create_work_order')
                             POST /api/work-orders
                             INSERT work_orders
                             Invalidate cache
                             submitToolResult → response.create
                                                                                            send_sms_confirmation tool
                             POST /api/communications (sms)
                                                                                            "Is there anything else?"
                                                                                             ├─ YES → loop back
                                                                                             └─ NO → continue

                                                                                            save_call_transcript tool
                             POST /api/communications (transcript)
                             submitToolResult → response.create
                                                                                            end_call tool
                             endCallAfterSpeech = true
                             submitToolResult
                                                                                            Agent speaks farewell
                             response.output_audio_transcript.done
                              → endCallAfterSpeech = true
                              → setTimeout 800ms → hangUp()
                             pc.close()
                             localStream.stop()
                             dataChannel.close()
Transcript feed shows
call ended
```

---

### Email Agent — Full Technical Flow

```
OPERATOR                     BROWSER (email.js)              SERVER (server.js)            AZURE OPENAI
──────────                   ──────────────────               ──────────────────            ────────────
Open /email
                             loadEmailTemplates()
                             GET /api/email-templates
                             → render template buttons

                             loadRecentProcessed()
                             GET /api/communications
                               ?type=email_intake&limit=10
                             → render feed entries

                             setupSenderLookup()
                             (input event listener, 500ms debounce)

Select template / type From
                             (500ms debounce fires)
                             GET /api/customers/by-email/:email
                                                               SELECT customers
                                                               WHERE email = ?
                                                                ├─ FOUND:
                                                                │  return customer object
                                                                │  → render Known Resident card
                                                                │    (name, phone, apt, notes)
                                                                └─ NOT FOUND:
                                                                   → render Unknown Sender card
Fill Subject + Body
Click "Process with AI"
                             showProcessingState()
                             (4-step animation @ 800ms each)
                             POST /api/email-intake
                             { from, subject, body }
                                                               Verify Keycloak JWT
                                                               getPropertiesList()
                                                               (Valkey cache or DB)
                                                               parseEmailToWorkOrder()
                                                                ├─ TIER 1: LLM
                                                                │  POST Azure OpenAI
                                                                │  gpt-5.4-mini
                                                                │  → structured JSON:
                                                                │    property_address
                                                                │    apartment_number
                                                                │    is_common_area
                                                                │    issue_description
                                                                │    urgency_level
                                                                │    permit_master_key
                                                                │    special_notes
                                                                │    caller_phone
                                                                │
                                                                └─ TIER 2: Regex fallback
                                                                   (if LLM fails/timeout)
                                                                   Finnish address patterns
                                                                   Apartment regex
                                                                   Emergency keywords
                                                                   Phone regex

                                                               BEGIN TRANSACTION
                                                               INSERT work_orders
                                                                ├─ Assign technician
                                                                │  (match property → technician)
                                                                └─ scheduled_time:
                                                                   Urgent → "Within 2 Hours"
                                                                   Standard → "Next day, 9AM"
                                                               INSERT communications
                                                               (type: email_intake,
                                                                original_email JSONB,
                                                                extracted_data JSONB)
                                                               COMMIT
                                                               Invalidate cache:work_orders:all

                             renderExtractionResults()
                              ├─ WO ID + meta-badges
                              │  (Matched/New, AI/Regex, elapsed)
                              ├─ Resident profile card
                              ├─ Urgency tag (red/green)
                              └─ 2-col extraction grid

                             addProcessedEmailEntry()
                             → prepend to feed with flash
                             → form.reset(), clearSenderCard()
```

---

## Summary

POC_Voice is a vertically integrated AI intake system: voice calls are handled by `gpt-realtime-2` over WebRTC with 7 structured tool calls back to the Express server; emails are parsed by `gpt-5.4-mini` (Azure, with `gpt-4o-mini` as OpenAI fallback, and regex as a final fallback) in an atomic DB transaction. Everything persists to PostgreSQL with Valkey caching in front of hot paths. The operator console is a vanilla JS SPA that surfaces live cost data, a real-time call context builder, and a full work order ERP view — all behind Keycloak JWT auth.
