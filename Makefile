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

# Полная сборка без докера: фронт -> backend/web/dist, бинарь -> bin/workspace
build:
	cd frontend && ([ -d node_modules ] || npm ci) && npm run build
	cd backend && CGO_ENABLED=0 go build -trimpath -o ../bin/workspace .

# Запуск без докера: та же ./data и порт 8787, что и у compose —
# работающий контейнер сначала останови (docker compose down)
run: build
	./bin/workspace

up:
	docker compose up --build -d

down:
	docker compose down
