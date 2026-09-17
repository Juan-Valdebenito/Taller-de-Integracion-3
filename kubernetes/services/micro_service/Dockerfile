# ETAPA 1: Compilación de Go
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Descargar dependencias aprovechando la caché de Docker
COPY go.mod go.sum ./
RUN go mod download

# Copiar código fuente y compilar
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o transit-service .

# ETAPA 2: Imagen de ejecución ligera
FROM alpine:latest

WORKDIR /app

# Copiar el binario compilado desde la etapa anterior
COPY --from=builder /app/transit-service .

# Puerto por defecto donde escucha la app
EXPOSE 3001

CMD ["./transit-service"]