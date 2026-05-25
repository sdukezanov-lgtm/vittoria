# Contributing to VITTORIA HOME

## Prerequisites

| Subsystem | Required |
|---|---|
| Backend (`apps/api`) | Node.js 20, pnpm 9, Docker Desktop |
| Admin panel (`apps/admin`) | Node.js 20, pnpm 9 |
| iOS (`apps/ios`) | macOS, Xcode 15+ |
| Android (`apps/android`) | Android Studio Hedgehog+, JDK 17 |

## Local development

1. `pnpm install` at the repo root installs all JS dependencies.
2. `docker compose -f infra/docker-compose.dev.yml up -d` starts Postgres, Redis, MinIO, MailHog.
3. `pnpm --filter @vittoria/api dev` runs the NestJS API at `http://localhost:3000`.
4. `pnpm --filter @vittoria/admin dev` runs the admin SPA at `http://localhost:5173`.

## Commits

Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.

## Pull requests

- CI must be green (lint + tests).
- One feature per PR.
- Reference the relevant Plan task in the description.
