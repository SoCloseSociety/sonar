.PHONY: up down dev logs reset db-shell redis-shell backend-shell frontend-shell migrate

up:
	docker compose up -d

down:
	docker compose down

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

reset:
	docker compose down -v
	docker compose up -d

build:
	docker compose build --no-cache

db-shell:
	docker compose exec postgres psql -U sonar -d sonar

redis-shell:
	docker compose exec redis redis-cli

backend-shell:
	docker compose exec backend bash

frontend-shell:
	docker compose exec frontend sh

migrate:
	docker compose exec backend alembic upgrade head

migration:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

status:
	docker compose ps
