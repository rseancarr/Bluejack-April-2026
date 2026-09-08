# Production image. Two stages: build with dev tools, run as a non-root user with production deps only.
# Needs a persistent volume (or a managed Postgres) for data:
#   DATABASE_URL   file:/data/app.db   (SQLite on a mounted disk)  or  postgresql://…  (after switching the provider)
#   STORAGE_DIR    /data/storage       (uploaded workbooks and documents; Azure Files or a persistent disk)
#   APP_PASSWORD, SESSION_SECRET (32+ random chars), TEAM_MEMBERS, TEAM_TIMEZONE
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NODE_ENV=production
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_URL="file:/data/app.db" STORAGE_DIR="/data/storage"
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/next.config.ts ./
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
# db push creates/updates the SQLite schema on first start (no-op afterwards). For Postgres use `prisma migrate deploy`.
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate && ./node_modules/.bin/next start -p ${PORT}"]
