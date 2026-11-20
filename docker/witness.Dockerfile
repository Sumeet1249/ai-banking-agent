# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* turbo.json ./
COPY packages/core-schema/package.json ./packages/core-schema/
COPY packages/witness/package.json ./packages/witness/

RUN npm ci

COPY packages/core-schema ./packages/core-schema
COPY packages/witness ./packages/witness

RUN npm run build --workspace=@agentguard/core-schema
RUN npm run build --workspace=@agentguard/witness

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/packages/core-schema/package.json ./packages/core-schema/
COPY --from=builder /app/packages/witness/package.json ./packages/witness/

RUN npm ci --production

COPY --from=builder /app/packages/core-schema/dist ./packages/core-schema/dist
COPY --from=builder /app/packages/witness/dist ./packages/witness/dist

RUN mkdir -p /data && chown -R node:node /data

USER node

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "packages/witness/dist/server.js"]
