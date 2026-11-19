FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ---- Runtime ----
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist/ ./dist/
COPY sql/ ./sql/

ENV NODE_ENV=production
ENV TRANSPORT=stdio
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["node", "dist/index.js"]
