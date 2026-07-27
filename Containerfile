FROM docker.io/library/node:22-alpine AS web-build
WORKDIR /src
COPY web/package.json web/package-lock.json* ./web/
WORKDIR /src/web
RUN npm ci
WORKDIR /src
RUN mkdir -p internal/web/dist && touch internal/web/dist/.placeholder
COPY web ./web
WORKDIR /src/web
RUN npm run build

FROM docker.io/library/golang:1.26-alpine AS go-build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
COPY --from=web-build /src/internal/web/dist ./internal/web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/axboard ./cmd/axboard

FROM docker.io/library/alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
    && mkdir -p /etc/axboard /var/lib/axboard
COPY --from=go-build /out/axboard /usr/local/bin/axboard
WORKDIR /var/lib/axboard
EXPOSE 8080
# No USER directive: in rootless podman, container root maps to the host
# user who started the daemon — that's how the bind-mounted config/ dir
# stays writable from inside. Switching to a non-root in-container user
# pushes the uid into the subuid range and breaks PUT /api/config (no
# write permission on the bind mount). For LAN-bound homelab use, this
# is the right trade-off.
ENTRYPOINT ["/usr/local/bin/axboard"]
CMD ["--config", "/etc/axboard/config.yaml", "--state", "/var/lib/axboard/state.yaml", "--addr", ":8080"]
