# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Build from the sync/ directory:
#   docker build -t corvid-sync-server .
#   docker run -d -p 8443:8443 -v corvid-sync:/data corvid-sync-server
#   docker run --rm -v corvid-sync:/data corvid-sync-server token --db /data/sync.db --account alice
# The server speaks plain HTTP here; put a TLS proxy in front, or mount a
# certificate and add --tls-cert/--tls-key.

FROM golang:1.26.10-trixie AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/corvid-sync-server ./server \
 && mkdir -p /out/data

FROM scratch
COPY --from=build /out/corvid-sync-server /corvid-sync-server
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
VOLUME /data
EXPOSE 8443
ENV CORVID_SYNC_DB=/data/sync.db
ENTRYPOINT ["/corvid-sync-server"]
CMD ["serve", "--listen", ":8443"]
