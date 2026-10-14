FROM golang:1.27-alpine AS builder

WORKDIR /src/kubernetes/services/micro_telemetry
COPY kubernetes/services/micro_telemetry/go.mod kubernetes/services/micro_telemetry/go.sum ./
RUN go mod download
COPY kubernetes/services/micro_telemetry/*.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/micro-telemetry .

FROM alpine:3.22
RUN adduser -D -H -u 10001 appuser
USER appuser
COPY --from=builder /out/micro-telemetry /micro-telemetry
EXPOSE 8080
ENTRYPOINT ["/micro-telemetry"]