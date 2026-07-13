# ===== Stage 1: Builder =====
FROM node:18-bullseye AS builder
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_GIT_HASH=unknown
ENV VITE_GIT_HASH=$VITE_GIT_HASH
ARG VITE_BUILD_TIME=unknown
ENV VITE_BUILD_TIME=$VITE_BUILD_TIME
RUN npm run build

# ===== Stage 2: Serve =====
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
