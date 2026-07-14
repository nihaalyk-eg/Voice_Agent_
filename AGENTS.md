# AI Agent Template Rules

This repository follows the **Universal Agent Template Specification**. 
When developing or modifying code in this repository, you MUST follow these guidelines:

1. **Strict Folder Boundaries:**
   - Business logic MUST stay in `app/`.
   - Infrastructure, Docker, and IaC files MUST stay in `ops/`.
   - The UI MUST stay in `ui/`.
   - Prompts MUST NOT be hardcoded in python files; store them in `prompts/`.

2. **Registry Contract:**
   - Any new settings or configuration parameters required by this agent MUST be declared in `.agent/manifest.json` under `config_schema`.
   - The API MUST expose standard OpenAPI documentation.

3. **Stateless Operations:**
   - This agent is a stateless microservice. It must not rely on local file storage or persistent local databases for business-critical state. State is managed by the central Registry.

4. **Documentation:**
   - Any architectural changes MUST be documented in `docs/project/`.
   - Before implementing large features, write a plan to `docs/process/`.
