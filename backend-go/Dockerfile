# ============================================================
# Etapa 1: Builder (Compilación estática del binario en Go)
# ============================================================
FROM golang:1.23-alpine AS builder

WORKDIR /src

# Instalar dependencias del sistema requeridas para la compilación
RUN apk add --no-cache git ca-certificates tzdata

# Copiar manifiestos de dependencias para aprovechar la caché de Docker
COPY go.mod go.sum ./
RUN go mod download

# Copiar el código fuente del microservicio
COPY . .

# Compilar binario estático optimizado (sin símbolos de debug -s -w)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

# ============================================================
# Etapa 2: Runner (Imagen mínima de ejecución Alpine)
# ============================================================
FROM alpine:latest AS runner

WORKDIR /app

# Instalar certificados raíz y configurar zona horaria de Chile (eliminando paquetes temporales)
RUN apk --no-cache add ca-certificates tzdata \
    && cp /usr/share/zoneinfo/America/Santiago /etc/localtime \
    && echo "America/Santiago" > /etc/timezone \
    && apk del tzdata \
    && rm -rf /var/cache/apk/*

# Crear usuario y grupo sin privilegios de root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copiar directamente el binario con los permisos del usuario appuser (evita duplicar capas)
COPY --chown=appuser:appgroup --from=builder /app/server /app/server

USER appuser

# Exponer el puerto estándar del contenedor
EXPOSE 8080

# Variables de entorno por defecto
ENV PORT=8080 \
    GIN_MODE=release

# Ejecutar el servidor
ENTRYPOINT ["/app/server"]
