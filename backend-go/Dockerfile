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

# Instalar certificados raíz y soporte de zona horaria
RUN apk --no-cache add ca-certificates tzdata \
    && cp /usr/share/zoneinfo/America/Santiago /etc/localtime \
    && echo "America/Santiago" > /etc/timezone

# Crear usuario y grupo sin privilegios de root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copiar únicamente el binario compilado desde la etapa builder
COPY --from=builder /app/server /app/server

# Asignar permisos al usuario de aplicación
RUN chown -R appuser:appgroup /app

USER appuser

# Exponer el puerto estándar del contenedor
EXPOSE 8080

# Variables de entorno por defecto
ENV PORT=8080 \
    GIN_MODE=release

# Ejecutar el servidor
ENTRYPOINT ["/app/server"]
