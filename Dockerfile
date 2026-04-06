FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ---- Runtime ----
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist/ ./dist/
COPY sql/ ./sql/

ENV NODE_ENV=production
ENV TRANSPORT=stdio

ENTRYPOINT ["node", "dist/index.js"]
