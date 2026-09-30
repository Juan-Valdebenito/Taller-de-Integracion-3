# Construir desde la RAÍZ del repo (el módulo local ../proto debe estar en el contexto):
#   docker build -f backend-go/Dockerfile -t <usuario>/backend-go:v1 .

# ETAPA 1: Compilación de Go
FROM golang:1.27-alpine AS builder

WORKDIR /src/backend-go

# Descargar dependencias aprovechando la caché de Docker
# (go.mod hace replace del módulo proto => ../proto)
COPY proto /src/proto
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download

# Copiar código fuente y compilar
COPY backend-go/cmd ./cmd
COPY backend-go/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/backend-go ./cmd/server

# ETAPA 2: Imagen de ejecución ligera
FROM alpine:3.22

RUN adduser -D -H -u 10001 appuser
USER appuser

COPY --from=builder /out/backend-go /backend-go

# Puerto por defecto donde escucha la app (ver internal/config/config.go)
EXPOSE 3001

ENTRYPOINT ["/backend-go"]
