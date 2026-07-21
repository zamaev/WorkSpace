# 1. фронт
FROM node:22-alpine AS front
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# vite собирает сразу в ../backend/web/dist — воспроизводим структуру
RUN mkdir -p /app/backend/web/dist && npm run build

# 2. бэкенд (CGO не нужен — modernc.org/sqlite чистый Go)
FROM golang:1.26-alpine AS back
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=front /app/backend/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -o /workspace .

# 3. минимальный рантайм
FROM gcr.io/distroless/static-debian12
COPY --from=back /workspace /workspace
ENV WORKSPACE_DB=/data/workspace.db
EXPOSE 8787
ENTRYPOINT ["/workspace"]
