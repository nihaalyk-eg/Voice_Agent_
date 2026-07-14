# Institutional Memory & Process

This folder serves as the dynamic "long-term memory" for this agent repository. 

Whenever AI developers (or human engineers) plan major features or make significant architectural decisions, they should log them here.

### Why?
Because AI models are stateless, they forget previous conversations. By forcing AI coding assistants to write their execution plans into this directory *before* modifying code, they leave an auditable trail of context that they (and future AI models) can read back later.

### What goes here?
- `plans/`: Implementation plans (`implementation_plan.md`) written by AI coding assistants.
- `decisions/`: Architecture Decision Records (ADRs). Why did we choose FastAPI over Flask?
- `walkthroughs/`: Summaries of completed refactoring or major features.
