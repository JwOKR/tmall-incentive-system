FROM node:18-bullseye

WORKDIR /app

# Use npmmirror for better connectivity in China
RUN npm config set registry https://registry.npmmirror.com

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client using locally installed binary (avoid npx network fetch)
RUN ./node_modules/.bin/prisma generate

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Start command
CMD ["sh", "-c", "./node_modules/.bin/prisma db push && node dist/index.js"]
