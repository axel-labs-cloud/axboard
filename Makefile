.PHONY: dev dev-go dev-web build build-go build-web container publish clean tidy

# Publish the multi-arch image to GHCR.
#   make publish VERSION=v0.2.0
# Needs: qemu for arm64 (once: sudo dnf install qemu-user-static, or
#   `sudo podman run --rm --privileged docker.io/tonistiigi/binfmt --install arm64`)
# and a ghcr login. arm64 emulation needs rootful podman, hence PODMAN=sudo podman.
REGISTRY ?= ghcr.io/axel-labs-cloud/axboard
VERSION  ?= latest
PODMAN   ?= sudo podman
PLATFORMS ?= linux/amd64,linux/arm64
publish:
	$(PODMAN) build --platform $(PLATFORMS) --manifest $(REGISTRY):$(VERSION) \
	  --build-arg VERSION=$(VERSION) --build-arg BUILD_DATE=$$(date -u +%Y-%m-%dT%H:%M:%SZ) \
	  -f Containerfile .
	$(PODMAN) manifest push --all $(REGISTRY):$(VERSION) docker://$(REGISTRY):$(VERSION)
	$(PODMAN) manifest push --all $(REGISTRY):$(VERSION) docker://$(REGISTRY):latest
	@echo "Pushed $(REGISTRY):$(VERSION) and :latest (amd64 + arm64)."

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
