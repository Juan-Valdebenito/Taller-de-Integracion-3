# ============================================================
# Construir desde la RAÍZ del repo:
#   docker build -f backend-go/Dockerfile -t transithub-backend:latest .
# ============================================================

# ETAPA 1: Compilación estática en Go
FROM golang:1.23-alpine AS builder

WORKDIR /src/backend-go

# Instalar herramientas básicas necesarias
RUN apk add --no-cache git ca-certificates tzdata

# Copiar módulo proto y dependencias (go.mod hace replace => ../proto)
COPY proto /src/proto
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download

# Copiar código fuente y compilar binario estático optimizado
COPY backend-go/cmd ./cmd
COPY backend-go/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/backend-go ./cmd/server

# ETAPA 2: Imagen de ejecución ligera Alpine
FROM alpine:3.22

# Configurar zona horaria de Chile y certificados CA
RUN apk --no-cache add ca-certificates tzdata \
    && cp /usr/share/zoneinfo/America/Santiago /etc/localtime \
    && echo "America/Santiago" > /etc/timezone \
    && apk del tzdata \
    && rm -rf /var/cache/apk/*

# Crear usuario sin privilegios
RUN adduser -D -H -u 10001 appuser

# Copiar binario con los permisos adecuados
COPY --chown=appuser:appuser --from=builder /out/backend-go /backend-go

# Exponer puertos de la aplicación
EXPOSE 3001
EXPOSE 8080

ENV PORT=8080 \
    GIN_MODE=release

USER appuser

ENTRYPOINT ["/backend-go"]
