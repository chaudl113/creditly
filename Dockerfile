# syntax=docker/dockerfile:1
# Small runtime image: Next.js standalone server + bundled migrate/seed scripts.
# Start-up applies migrations, runs the idempotent seed, then serves on :3101.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && node scripts/bundle-scripts.mjs

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3101 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/dist/scripts ./scripts
USER node
EXPOSE 3101
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3101/api/health >/dev/null || exit 1
CMD ["sh", "-c", "node scripts/migrate.mjs && node scripts/seed.mjs && exec node server.js"]
