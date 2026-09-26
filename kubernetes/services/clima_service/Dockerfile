FROM golang:1.27-alpine AS builder

WORKDIR /src/kubernetes/services/clima_service
COPY proto /src/proto
COPY kubernetes/services/clima_service/go.mod kubernetes/services/clima_service/go.sum ./
RUN go mod download
COPY kubernetes/services/clima_service/*.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/climate-service .

FROM alpine:3.22
RUN adduser -D -H -u 10001 appuser
USER appuser
COPY --from=builder /out/climate-service /climate-service
EXPOSE 8080
EXPOSE 9090
ENTRYPOINT ["/climate-service"]
