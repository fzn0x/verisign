.PHONY: install dev dev-web build test migrate migrate-remote deploy

install:
	pnpm install

# Worker on :8787 (rebuilds the Go WASM on change); run `make dev-web` alongside.
dev:
	pnpm dev

# Vite dev server on :5173, proxying /api to the Worker.
dev-web:
	pnpm dev:web

build:
	pnpm build

test:
	go test ./...
	pnpm --dir web test

migrate:
	pnpm db:migrate

migrate-remote:
	pnpm db:migrate:remote

deploy:
	pnpm deploy
