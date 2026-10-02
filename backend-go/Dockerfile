FROM golang:1.27-alpine AS builder

WORKDIR /src/backend-go

COPY proto /src/proto
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download

COPY backend-go/*.go ./
COPY backend-go/cmd ./cmd
COPY backend-go/internal ./internal

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/backend-go ./cmd/server

FROM alpine:3.22

RUN adduser -D -H -u 10001 appuser
USER appuser

COPY --from=builder /out/backend-go /backend-go

EXPOSE 3001

ENTRYPOINT ["/backend-go"]
