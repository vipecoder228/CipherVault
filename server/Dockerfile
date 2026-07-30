# Multi-stage build: compile TypeScript in a full node image, run the
# compiled JS in a slim image with only production dependencies. Keeps the
# final image free of the TypeScript compiler and dev-only tooling.

FROM node:22-bookworm-slim AS builder
WORKDIR /build

# better-sqlite3 compiles a native addon at install time.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json* ./server/
COPY shared ./shared
WORKDIR /build/server
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev && apt-get purge -y python3 make g++ && npm cache clean --force

COPY --from=builder /build/server/dist ./dist

ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/data

RUN mkdir -p /data && useradd --uid 10001 --create-home --shell /usr/sbin/nologin ciphervault \
  && chown -R ciphervault:ciphervault /data /app
USER ciphervault

EXPOSE 8787
VOLUME ["/data"]

CMD ["node", "dist/server/src/index.js"]
