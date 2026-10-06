# Servidor de tiempo real (Socket.io) para el mapa de buses.
# En el cluster el Ingress solo le envía /socket.io; la API REST la sirve backend-go.
# Construir desde la carpeta backend/:
#   docker build -t <usuario>/transithub-realtime:v1 backend/

# ETAPA 1: Compilación de TypeScript
FROM node:20-alpine AS builder

# Prisma necesita OpenSSL en Alpine para elegir el motor correcto
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate --schema=src/infrastructure/database/prisma/schema.prisma \
 && npm run build

# ETAPA 2: Imagen de ejecución
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]
