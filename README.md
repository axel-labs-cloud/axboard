# ianua

`ianua` (Latin: *entrance, doorway*) is a homepage/Homarr-style apps dashboard. Single Go binary, embedded React SPA, hand-edited YAML config, no auth, LAN-bound. Drag-and-drop grid of widgets — most importantly clickable app cards with health pings — that acts as the front door to all self-hosted services on `axel-labs.cloud`.

## Quickstart

```sh
# Build (requires Go 1.26 and Node 22)
make build

# Run
cp config/config.example.yaml config/config.yaml
./bin/ianua --config ./config/config.yaml --state ./state.yaml --addr :8080

# Or via podman-compose
podman-compose up -d
# then open http://localhost:8080
```

Open [http://localhost:8080](http://localhost:8080).

## Dev

In two terminals:

```sh
make dev-go     # API on :8080
make dev-web    # Vite on :5173 with /api/* proxy to :8080
```

## Configuration

Edit `config.yaml` in your editor. The server hot-reloads on save (fsnotify + SSE). On parse errors, the UI shows a banner and keeps serving the last-good config — it does not crash. See [config.example.yaml](./config.example.yaml) for the full schema.

Grid layouts (drag positions) live in `state.yaml`, which is machine-managed. Don't edit it by hand.

## What this is not

Not a plugin platform, not a metrics collector, not multi-tenant. See [CLAUDE.md](./CLAUDE.md) for the full design rationale.

## License

MIT.
