FROM golang:1.27-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/climate-service .

FROM alpine:3.22
RUN adduser -D -H -u 10001 appuser
USER appuser
COPY --from=builder /out/climate-service /climate-service
EXPOSE 8080
ENTRYPOINT ["/climate-service"]
