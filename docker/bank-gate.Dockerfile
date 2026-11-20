# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* turbo.json ./
COPY packages/core-schema/package.json ./packages/core-schema/
COPY packages/bank-gate/package.json ./packages/bank-gate/

RUN npm ci

COPY packages/core-schema ./packages/core-schema
COPY packages/bank-gate ./packages/bank-gate

RUN npm run build --workspace=@agentguard/core-schema
RUN npm run build --workspace=@agentguard/bank-gate

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/packages/core-schema/package.json ./packages/core-schema/
COPY --from=builder /app/packages/bank-gate/package.json ./packages/bank-gate/

RUN npm ci --production

COPY --from=builder /app/packages/core-schema/dist ./packages/core-schema/dist
COPY --from=builder /app/packages/bank-gate/dist ./packages/bank-gate/dist

RUN mkdir -p /data && chown -R node:node /data

USER node

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["node", "packages/bank-gate/dist/server.js"]
