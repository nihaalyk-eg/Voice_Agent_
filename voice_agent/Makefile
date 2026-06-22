.PHONY: setup dev docker docker-prod build-amd64 stop logs

# First-time setup: create .env and install dependencies
setup:
	@[ -f .env ] || (cp .env.example .env && echo "✓ .env created — fill in your credentials")
	uv sync
	@echo "✓ Dependencies installed. Run 'make dev' to start."

# Run everything natively (Mac local dev)
dev:
	docker compose up -d postgres valkey livekit
	uv run --project . python server.py

# Run full stack in Docker (Linux / EC2)
docker:
	docker compose up -d --build

# Run full stack in Docker for EC2 (AMD64 + host networking)
docker-prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Build AMD64 image for deployment
build-amd64:
	docker build --platform linux/amd64 -t voice-agent:amd64 .

# Stop all containers
stop:
	docker compose down

# Stream logs from voice-ui container
logs:
	docker compose logs -f voice-ui
