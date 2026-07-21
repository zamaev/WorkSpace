# Разработка: бэкенд и фронт отдельно (vite проксирует /api на :8787)
dev-api:
	cd backend && go run .

dev-front:
	cd frontend && npm run dev

test:
	cd backend && go vet ./... && go test ./...
	cd frontend && npm run typecheck && npm test -- --run

build-front:
	cd frontend && npm run build

up:
	docker compose up --build -d

down:
	docker compose down
