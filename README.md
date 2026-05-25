# VITTORIA HOME

Service application for clients of VITTORIA furniture company.

See [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md) for the full MVP design.

## Repository layout

- `apps/api` — NestJS backend (REST + WebSocket)
- `apps/admin` — React admin/partner web panel
- `apps/ios` — Native iOS client (Swift / SwiftUI)
- `apps/android` — Native Android client (Kotlin / Jetpack Compose)
- `packages/shared-types` — TypeScript types shared between `api` and `admin`
- `infra` — Local dev Docker Compose; cloud manifests added later
- `docs/superpowers/specs` — Design specifications
- `docs/superpowers/plans` — Implementation plans

## Quick start (backend + admin)

Requires: Node.js 20, pnpm 9, Docker Desktop.

```bash
pnpm install
pnpm dev:infra      # starts postgres, redis, minio, mailhog
pnpm dev:api        # starts NestJS API at http://localhost:3000
pnpm dev:admin      # starts admin SPA at http://localhost:5173
```

Stop infra:
```bash
pnpm dev:infra:down
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup including iOS and Android.
