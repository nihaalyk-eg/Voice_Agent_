# System Card: Zora Voice Assistant

## 1. System Overview
**Purpose:** Zora Voice Assistant is a conversational agent designed to interface with users via voice. It leverages LiveKit for WebRTC audio transmission, Azure OpenAI (or GPT-4o Realtime) for LLM orchestration, and Azure Speech for TTS and STT (in pipeline mode).
**Intended Users:** Tenants and callers reporting issues, requiring maintenance, or querying customer records.

## 2. Capabilities
- Multi-turn voice conversation in various languages.
- Real-time customer record lookups using phone numbers or names (`search_customer`).
- Automated maintenance work-order creation based on user-provided issue descriptions (`create_work_order`).

## 3. Out-of-Scope Uses
- Zora is **not** designed or authorized to make financial transactions, authorize payments, or collect credit card information.
- Zora should **not** be used for emergency life-safety dispatching (e.g., 911 equivalents). All emergencies must be routed to human operators.

## 4. Known Limitations
- **Spoken Phone Matching:** The system cannot reliably match a string of spoken digits to a database record due to transcription variability. The system mitigates this by using caller ID directly when available, and falling back to name/address verification.
- **Latency:** Dependent on the Azure OpenAI and Speech endpoints. High network latency can degrade conversational fluidity.

## 5. Failure Modes & Mitigation
- **Hallucination / Misclassification:** The agent may categorize an issue incorrectly. *Mitigation:* Work orders are queued for technician review, and explicit confirmation is built into the tool workflow.
- **Unbounded Execution:** *Mitigation:* A circuit breaker limits the maximum number of tool calls per session to prevent infinite loop errors.
- **Safety / Toxicity:** *Mitigation:* AWS Bedrock Guardrails scan inputs and outputs for PII leaks and toxic content.

## 6. Escalation Path
For safety issues or sustained failures, invoke the `POST /agent/stop` kill switch and contact the AI Governance Owner.
