# AI Agent Resources

This directory is intended for **Static Business Context** and **Ground Truth Data**. 

Because LLMs are prone to hallucination, you should avoid hardcoding complex taxonomies or rules directly into the `prompts/`. Instead, provide them here as structured data.

### What goes here?
- `schemas/`: JSON Schemas for data validation or database ERDs.
- `glossary.json`: Domain-specific terms the agent should understand.
- `brand_voice.md`: Strict rules on tone and formatting.
- `rules.json`: Business logic rules that the agent can read dynamically.

Agents should read these files at runtime (or load them into their context window) rather than relying on their base training data.
