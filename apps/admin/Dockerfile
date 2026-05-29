# Production image for the admin web panel (React/Vite static served by nginx).
# Build context = repo root:
#   docker build -f apps/admin/Dockerfile --build-arg VITE_API_BASE_URL=https://api.example.com/api/v1 -t vittoria-admin .
FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Boevoy adres API зашивается в статику на этапе сборки:
ARG VITE_API_BASE_URL=https://api.vittoria.app/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @vittoria/admin build

FROM nginx:1.27-alpine
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
