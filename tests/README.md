# AI Agent Evaluation Framework

Because AI Agents are non-deterministic, traditional unit testing is often insufficient. This folder is dedicated to **evaluating** the agent's reasoning and performance.

### Structure

1. **`tests/scenarios/`**
   - End-to-end tests that simulate a user conversation or a specific registry payload (`POST /invoke`).
   - Use these to ensure the agent correctly hits its tools and returns the expected webhook payload.

2. **`tests/evaluations/`**
   - Scripts (or Jupyter Notebooks) that run the agent against a dataset of hundreds of queries to measure its success rate, hallucination rate, and latency.
   - Example: `bench_voice_live.jsonl` data sets should be executed and tracked here.

3. **`tests/unit/`**
   - Standard unit tests (PyTest, Jest) for deterministic functions inside `app/tools/`.
