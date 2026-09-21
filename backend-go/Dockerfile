# ETAPA 1: Compilación de Go
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Descargar dependencias aprovechando la caché de Docker
COPY go.mod go.sum ./
RUN go mod download

# Copiar código fuente y compilar
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o backend-go ./cmd/server

# ETAPA 2: Imagen de ejecución ligera
FROM alpine:latest

WORKDIR /app

# Copiar el binario compilado desde la etapa anterior
COPY --from=builder /app/backend-go .

# Puerto por defecto donde escucha la app (ver internal/config/config.go)
EXPOSE 3001

CMD ["./backend-go"]
