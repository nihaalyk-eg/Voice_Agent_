# Universal Agent Template Specification

This repository conforms to the Universal Agent Template standard. This structure ensures that any agent (Voice, Text, Background Worker, or IaC) can be ingested by the central Agent Registry automatically.

## Directory Structure
- **`.agent/`**: Contains the `manifest.json` and `openapi.json` which define the contract between this agent and the Registry.
- **`app/`**: Contains the core logic of the agent. This folder is language-agnostic.
- **`docs/`**: Institutional memory. Store architecture specs in `project/` and decision logs in `process/`.
- **`ops/`**: Deployment and infrastructure configurations (Docker, Terraform, etc).
- **`ui/`**: Optional. Any frontend components or SDKs that the Registry can import.
- **`prompts/`**: Stores LLM instructions, keeping them separate from source code.
- **`resources/`**: Static business context (JSON schemas, rules).
- **`tests/`**: Unit tests and AI evaluations.

## Principles
1. **Stateless APIs**: The agent must rely on the Registry for long-term state.
2. **Headless by Default**: This agent should function purely as an API. The `ui/` folder is only for exportable components, not a monolithic web application.
3. **Webhooks for Completion**: For long-running tasks or calls, the agent must accept a webhook URL and POST the final payload (e.g. call transcript) back to the Registry upon completion.
