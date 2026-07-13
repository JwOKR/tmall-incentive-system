# ===== Stage 1: Builder =====
FROM node:18-bullseye AS builder
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN ./node_modules/.bin/prisma generate

COPY . .
RUN npm run build

# ===== Stage 2: Runtime =====
FROM node:18-bullseye-slim AS runtime
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev

# Copy generated prisma client + CLI from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Copy compiled dist
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["sh", "-c", "./node_modules/.bin/prisma db push && node dist/index.js"]
