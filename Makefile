.PHONY: dev dev-go dev-web build build-go build-web container clean tidy

# Dev: run Go API on :8080 and Vite on :5173 (proxies /api/* and /healthz to :8080).
dev:
	@echo "Run 'make dev-go' and 'make dev-web' in two terminals."

dev-go:
	go run ./cmd/axboard --config ./config/config.yaml --state ./state.yaml --addr :8080

dev-web:
	cd web && npm run dev

# Build: build web, then build single binary embedding web/dist.
build: build-web build-go

build-web:
	cd web && npm ci && npm run build

build-go:
	mkdir -p bin
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/axboard ./cmd/axboard

container:
	podman build -t axboard:latest -f Containerfile .

tidy:
	go mod tidy

clean:
	rm -rf bin
	find internal/web/dist -mindepth 1 ! -name '.placeholder' -delete
