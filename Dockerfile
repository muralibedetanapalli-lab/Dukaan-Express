# syntax=docker/dockerfile:1.7
# Production image for Azure Container Apps (or any container host).
#  - Next.js standalone server (small runtime, no dev deps)
#  - Prisma CLI isolated in /app/tools for `migrate deploy` on start-up
#  - Bundled setup script at /app/scripts/setup.mjs (roles, categories, first admin)

ARG NODE_VERSION=22-bookworm-slim

# ---------- build ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall runs `prisma generate`; it only needs a syntactically valid URL at build time
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm ci
COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    JWT_SECRET="build-time-placeholder-not-used-at-runtime-000" \
    npm run build && npm run build:scripts

# ---------- migration tooling (prisma CLI only) ----------
FROM node:${NODE_VERSION} AS tools
WORKDIR /tools
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund prisma@7.10.1 dotenv >/dev/null
COPY prisma ./prisma
COPY prisma.config.ts ./

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app -d /app app

COPY --from=build --chown=app:app /src/.next/standalone ./
COPY --from=build --chown=app:app /src/.next/static ./.next/static
COPY --from=build --chown=app:app /src/public ./public
COPY --from=build --chown=app:app /src/scripts/dist/setup.mjs ./scripts/setup.mjs
COPY --from=build --chown=app:app /src/scripts/cron.mjs ./scripts/cron.mjs
COPY --from=tools --chown=app:app /tools ./tools
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER app
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
