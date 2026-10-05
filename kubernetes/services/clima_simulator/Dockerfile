FROM golang:1.27-alpine AS builder

WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/climate-simulator .

FROM alpine:3.22
RUN adduser -D -H -u 10001 appuser
USER appuser
COPY --from=builder /out/climate-simulator /climate-simulator
COPY config.json /config/config.json
ENTRYPOINT ["/climate-simulator"]
