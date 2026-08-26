# Dockerfile for Fahara Express Backend API
FROM node:20-alpine AS base

WORKDIR /app

# Install OpenSSL for Prisma ORM compatibility on Alpine Linux
RUN apk add --no-cache openssl

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --legacy-peer-deps

# Generate Prisma Client
RUN npx prisma generate

# Copy source files
COPY . .

# Make entrypoint executable
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]

