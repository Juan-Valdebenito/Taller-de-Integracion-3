# ETAPA 1: Compilación de Go
FROM golang:1.27-alpine AS builder

WORKDIR /src/kubernetes/services/micro_service

# Descargar dependencias aprovechando la caché de Docker
COPY kubernetes/services/micro_service/go.mod kubernetes/services/micro_service/go.sum ./
COPY proto /src/proto
RUN go mod download

# Copiar código fuente y compilar
COPY kubernetes/services/micro_service/*.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o transit-service .

# ETAPA 2: Imagen de ejecución ligera
FROM alpine:latest

WORKDIR /app

# Copiar el binario compilado desde la etapa anterior
COPY --from=builder /src/kubernetes/services/micro_service/transit-service .

# Puerto por defecto donde escucha la app
EXPOSE 3001
EXPOSE 9091

CMD ["./transit-service"]