# AI Incident Runbook

This runbook describes the procedure for responding to AI safety incidents, unbounded execution (runaway agents), and model degradation.

## 1. Kill Switch

To immediately terminate all active agent sessions for a specific deployment or environment:
Invoke the `POST /agent/stop` endpoint.

```bash
# Example
curl -X POST http://localhost:8080/agent/stop -H "Authorization: Bearer <token>"
```
This command forcefully kills the agent subprocess, terminating all WebSocket connections and Audio publishing immediately.

## 2. Model Rollback

If a newly deployed model exhibits regressions or bypasses guardrails:
1. Revert the `CHAT_DEPLOYMENT_NAME` or `REALTIME_DEPLOYMENT_NAME` environment variable to the previous stable version.
2. Restart the backend container (`docker compose restart api` or equivalent).
3. Verify that the agent correctly loads the fallback model.

## 3. Escalation Contacts

In the event of an unresolved incident or data leak:
- **Security Owner:** `security@company.com` (Placeholder)
- **AI Owner:** `ai-lead@company.com` (Placeholder)
- **Compliance:** `compliance@company.com` (Placeholder)

## 4. Postmortem Template

Following an incident, complete the following template and file it in `docs/process/decisions/` or your incident tracker:

```markdown
# Incident Postmortem

**Date:** YYYY-MM-DD
**Authors:** [Names]
**Status:** [Draft / Under Review / Final]

## Summary
[Brief description of the incident, impact, and duration.]

## Timeline
- [HH:MM] Incident started
- [HH:MM] Alert triggered / Issue reported
- [HH:MM] Mitigation applied (e.g. Kill switch triggered)
- [HH:MM] Resolution confirmed

## Root Cause
[Technical explanation of why the guardrails, execution bounds, or model failed.]

## Action Items
- [ ] [Preventative measure 1]
- [ ] [Preventative measure 2]
```
