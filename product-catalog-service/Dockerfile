# ---- Stage 1: build & compile TypeScript -----------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
# --ignore-scripts: better-sqlite3 ships a prebuilt musl binary; skipping its
# implicit node-gyp compile means no Python/g++ toolchain is needed in the image.
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---- Stage 2: clean production execution layout -----------------------------
FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Writable home for the SQLite database and the install-time store config.
# Mount a volume here to keep them across container recreation.
RUN mkdir -p /app/data && chown appuser:appgroup /app/data
ENV DATABASE_PATH=/app/data/app.db \
    STORE_CONFIG_PATH=/app/data/store.config.json
VOLUME ["/app/data"]

USER appuser

EXPOSE 5001

CMD ["node", "dist/server.js"]
