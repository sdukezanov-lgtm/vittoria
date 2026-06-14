# Production image for the Vittoria API (NestJS). Build context = repo root:
#   docker build -f apps/api/Dockerfile -t vittoria-api .
FROM node:20-bookworm-slim

# Prisma needs openssl at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vittoria/api exec prisma generate
RUN pnpm --filter @vittoria/api build

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3000

# Apply DB migrations, then start. (Safe to re-run; deploy applies only new migrations.)
# Note: `nest build` emits to dist/src/ (src+test share a root), so entry is dist/src/main.js.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/src/main.js"]
