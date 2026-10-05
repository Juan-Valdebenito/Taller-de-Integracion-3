# Frontend React compilado y servido como estático por nginx.
# Construir desde la carpeta frontend/:
#   docker build -t <usuario>/transithub-frontend:v1 frontend/

# ETAPA 1: Build de Vite
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ETAPA 2: nginx sin privilegios (escucha en 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080
