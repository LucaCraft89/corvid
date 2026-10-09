# Corvid sync server. Build context: server/sync
#   docker build -t corvid-sync server/sync
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/corvid-sync ./cmd/corvid-sync

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/corvid-sync /corvid-sync
VOLUME ["/data"]
EXPOSE 8443
ENV CORVID_SYNC_DATA=/data CORVID_SYNC_ADDR=:8443
USER nonroot:nonroot
HEALTHCHECK --interval=30s --timeout=3s CMD ["/corvid-sync", "-healthcheck"]
ENTRYPOINT ["/corvid-sync"]
