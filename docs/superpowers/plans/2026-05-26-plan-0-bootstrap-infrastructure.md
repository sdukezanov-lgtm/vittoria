# Plan 0: Bootstrap & Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the VITTORIA HOME monorepo with skeletons for all five subsystems (backend, admin, iOS, Android, infra), a working local dev environment via Docker Compose, and a baseline CI pipeline that runs lint + tests on every PR.

**Architecture:** pnpm monorepo with workspaces for TypeScript projects (`apps/api`, `apps/admin`, `packages/*`). Native mobile apps (`apps/ios`, `apps/android`) live alongside as self-contained projects with their own toolchains. Local dev via Docker Compose (postgres, redis, minio, mailhog). CI on GitHub Actions runs lint+unit tests for api+admin on every PR. No cloud provisioning yet — that happens in Plan 8.

**Tech Stack:**
- Node.js 20 LTS, pnpm 9
- NestJS 10 (api), Vite 5 + React 18 (admin)
- PostgreSQL 16, Redis 7, MinIO (S3-compatible), MailHog (in Docker Compose)
- Xcode 15+ / Swift 5.9+ (iOS)
- Android Studio Hedgehog+ / Kotlin 1.9+ (Android)
- GitHub Actions

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](../specs/2026-05-26-vittoria-home-mvp-design.md)

**Platform note:** This bootstrap is performed on the developer's primary machine. iOS work requires macOS (Xcode). Android work runs on any OS. Backend/admin work runs on any OS. If the team has mixed platforms, Tasks 8 and 9 are deferred to a macOS workstation.

---

## File Structure

After this plan completes, the repo looks like this:

```
vittoria/
├── .editorconfig
├── .gitignore
├── .nvmrc                              ← Node version pin
├── .github/
│   └── workflows/
│       └── ci.yml                      ← lint+test for api+admin
├── README.md
├── CONTRIBUTING.md
├── package.json                        ← pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json                  ← shared TS config
├── .prettierrc
├── .eslintrc.cjs
├── apps/
│   ├── api/                            ← NestJS backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   └── health/
│   │   │       ├── health.module.ts
│   │   │       └── health.controller.ts
│   │   └── test/
│   │       └── health.e2e-spec.ts
│   ├── admin/                          ← React admin/partner panel
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       └── App.test.tsx
│   ├── ios/                            ← scaffolded via Xcode (Task 8)
│   │   └── README.md
│   └── android/                        ← scaffolded via Android Studio (Task 9)
│       └── README.md
├── packages/
│   └── shared-types/                   ← placeholder for OpenAPI-generated types
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts
├── infra/
│   ├── docker-compose.dev.yml
│   └── .env.example
└── docs/
    └── superpowers/
        ├── specs/                      ← already exists
        └── plans/                      ← this file lives here
```

**Responsibility split:**
- `apps/*` — deployable units (one CI job each)
- `packages/*` — shared TypeScript code (types, utilities) consumed by `apps/api` and `apps/admin`
- `infra/` — local dev infrastructure (Docker Compose) and later (Plan 8) Yandex Cloud manifests
- Root `package.json` — workspace orchestration only, no app code

---

## Task 1: Initialize Git Repository and Base Config Files

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `.prettierrc`
- Create: `README.md`
- Create: `CONTRIBUTING.md`

- [ ] **Step 1.1: Initialize git repo**

Run in `c:\sad\Vittoriy`:
```powershell
git init
git branch -M main
```

Expected: `Initialized empty Git repository in c:/sad/Vittoriy/.git/`

- [ ] **Step 1.2: Create `.gitignore`**

Create `.gitignore`:
```gitignore
# OS
.DS_Store
Thumbs.db

# Editors
.vscode/
.idea/
*.swp

# Node
node_modules/
.pnpm-store/
*.log
npm-debug.log*
.npm

# Build outputs
dist/
build/
.next/
out/

# Env
.env
.env.local
.env.*.local

# iOS
apps/ios/Pods/
apps/ios/build/
apps/ios/DerivedData/
apps/ios/*.xcworkspace/xcuserdata/
apps/ios/*.xcodeproj/xcuserdata/

# Android
apps/android/.gradle/
apps/android/build/
apps/android/app/build/
apps/android/local.properties
apps/android/*.iml

# Test
coverage/
.nyc_output/
junit.xml

# Docker
infra/.env
```

- [ ] **Step 1.3: Create `.editorconfig`**

Create `.editorconfig`:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.{kt,kts}]
indent_size = 4

[*.{swift,m,h}]
indent_size = 4

[Makefile]
indent_style = tab
```

- [ ] **Step 1.4: Create `.nvmrc`**

Create `.nvmrc`:
```
20
```

- [ ] **Step 1.5: Create `.prettierrc`**

Create `.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 1.6: Create `README.md`**

Create `README.md`:
```markdown
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
docker compose -f infra/docker-compose.dev.yml up -d
pnpm --filter @vittoria/api dev
pnpm --filter @vittoria/admin dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup including iOS and Android.
```

- [ ] **Step 1.7: Create `CONTRIBUTING.md`**

Create `CONTRIBUTING.md`:
```markdown
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
```

- [ ] **Step 1.8: First commit**

```bash
git add .gitignore .editorconfig .nvmrc .prettierrc README.md CONTRIBUTING.md
git commit -m "chore: initial repo skeleton with base config"
```

Expected: One commit on `main`.

---

## Task 2: Set Up pnpm Workspaces and Shared TypeScript Config

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.eslintrc.cjs`

- [ ] **Step 2.1: Create root `package.json`**

Create `package.json`:
```json
{
  "name": "vittoria",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\""
  },
  "devDependencies": {
    "prettier": "^3.2.5",
    "typescript": "^5.4.5",
    "eslint": "^8.57.0",
    "@typescript-eslint/parser": "^7.7.0",
    "@typescript-eslint/eslint-plugin": "^7.7.0"
  }
}
```

- [ ] **Step 2.2: Create `pnpm-workspace.yaml`**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/api'
  - 'apps/admin'
  - 'packages/*'
```

- [ ] **Step 2.3: Create `tsconfig.base.json`**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- [ ] **Step 2.4: Create root `.eslintrc.cjs`**

Create `.eslintrc.cjs`:
```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, es2022: true },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist', 'build', 'node_modules', 'coverage'],
};
```

- [ ] **Step 2.5: Install dependencies**

Run:
```bash
pnpm install
```

Expected: `node_modules/` is created, `pnpm-lock.yaml` appears at root.

- [ ] **Step 2.6: Update `.gitignore` for lockfile policy**

The default `.gitignore` from Task 1 ignores `node_modules/` but should keep `pnpm-lock.yaml`. Verify:
```bash
git check-ignore pnpm-lock.yaml
```
Expected: empty output (not ignored).

- [ ] **Step 2.7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .eslintrc.cjs pnpm-lock.yaml
git commit -m "chore: pnpm workspace, shared TS and ESLint config"
```

---

## Task 3: Scaffold `apps/api` (NestJS) with Health Endpoint

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/test/health.e2e-spec.ts`
- Create: `apps/api/jest-e2e.json`

- [ ] **Step 3.1: Create `apps/api/package.json`**

Create `apps/api/package.json`:
```json
{
  "name": "@vittoria/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\"",
    "test": "jest --config jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.7",
    "@nestjs/core": "^10.3.7",
    "@nestjs/platform-express": "^10.3.7",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.2",
    "@nestjs/schematics": "^10.1.1",
    "@nestjs/testing": "^10.3.7",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.12.7",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.2",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 3.2: Create `apps/api/tsconfig.json`**

Create `apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "ES2022",
    "outDir": "./dist",
    "rootDir": ".",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "declaration": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3.3: Create `apps/api/nest-cli.json`**

Create `apps/api/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 3.4: Install api dependencies**

```bash
pnpm install
```

Expected: `apps/api/node_modules` (or hoisted to root) populated.

- [ ] **Step 3.5: Write the failing e2e health test**

Create `apps/api/test/health.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz returns 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 3.6: Create `apps/api/jest-e2e.json`**

Create `apps/api/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testRegex": ".e2e-spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

- [ ] **Step 3.7: Run test to verify it fails (no AppModule yet)**

```bash
pnpm --filter @vittoria/api test
```

Expected: FAIL with "Cannot find module '../src/app.module'".

- [ ] **Step 3.8: Create `apps/api/src/main.ts`**

Create `apps/api/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap();
```

- [ ] **Step 3.9: Create health module and controller**

Create `apps/api/src/health/health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```

Create `apps/api/src/health/health.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

Create `apps/api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule],
})
export class AppModule {}
```

- [ ] **Step 3.10: Run test to verify it passes**

```bash
pnpm --filter @vittoria/api test
```

Expected: PASS — `HealthController (e2e) > GET /healthz returns 200 with status ok`.

- [ ] **Step 3.11: Smoke-run the dev server**

```bash
pnpm --filter @vittoria/api dev
```

In another terminal:
```bash
curl http://localhost:3000/healthz
```

Expected: `{"status":"ok"}`. Stop the server with Ctrl+C.

- [ ] **Step 3.12: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): scaffold NestJS app with health endpoint and e2e test"
```

---

## Task 4: Scaffold `apps/admin` (Vite + React + TypeScript)

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/tsconfig.node.json`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/index.html`
- Create: `apps/admin/src/main.tsx`
- Create: `apps/admin/src/App.tsx`
- Create: `apps/admin/src/App.test.tsx`
- Create: `apps/admin/vitest.config.ts`

- [ ] **Step 4.1: Create `apps/admin/package.json`**

Create `apps/admin/package.json`:
```json
{
  "name": "@vittoria/admin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint \"src/**/*.{ts,tsx}\"",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^15.0.6",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.2.1",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.5",
    "vite": "^5.2.10",
    "vitest": "^1.5.2"
  }
}
```

- [ ] **Step 4.2: Create `apps/admin/tsconfig.json`**

Create `apps/admin/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "useDefineForClassFields": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4.3: Create `apps/admin/tsconfig.node.json`**

Create `apps/admin/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4.4: Create `apps/admin/vite.config.ts`**

Create `apps/admin/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 4.5: Create `apps/admin/vitest.config.ts`**

Create `apps/admin/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
```

- [ ] **Step 4.6: Create `apps/admin/index.html`**

Create `apps/admin/index.html`:
```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VITTORIA HOME — Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4.7: Install admin dependencies**

```bash
pnpm install
```

- [ ] **Step 4.8: Write the failing test**

Create `apps/admin/src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText('VITTORIA HOME — Admin')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.9: Run test to verify it fails (no App yet)**

```bash
pnpm --filter @vittoria/admin test
```

Expected: FAIL — `Cannot find module './App'`.

- [ ] **Step 4.10: Create `apps/admin/src/App.tsx`**

Create `apps/admin/src/App.tsx`:
```tsx
export default function App() {
  return <h1>VITTORIA HOME — Admin</h1>;
}
```

- [ ] **Step 4.11: Create `apps/admin/src/main.tsx`**

Create `apps/admin/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4.12: Add jest-dom setup**

Create `apps/admin/src/setupTests.ts`:
```typescript
import '@testing-library/jest-dom/vitest';
```

Update `apps/admin/vitest.config.ts` to include the setup:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
});
```

- [ ] **Step 4.13: Run test to verify it passes**

```bash
pnpm --filter @vittoria/admin test
```

Expected: PASS — `App > renders the app title`.

- [ ] **Step 4.14: Smoke-run dev server**

```bash
pnpm --filter @vittoria/admin dev
```

Open `http://localhost:5173` in a browser. Expected: page shows "VITTORIA HOME — Admin". Stop with Ctrl+C.

- [ ] **Step 4.15: Commit**

```bash
git add apps/admin pnpm-lock.yaml
git commit -m "feat(admin): scaffold Vite + React + TS skeleton with smoke test"
```

---

## Task 5: Create `packages/shared-types` Skeleton

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`

This package holds types shared between `apps/api` and `apps/admin`. Initially it exports a single placeholder type. In Plan 1+ it will be populated with OpenAPI-generated types.

- [ ] **Step 5.1: Create `packages/shared-types/package.json`**

Create `packages/shared-types/package.json`:
```json
{
  "name": "@vittoria/shared-types",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint \"src/**/*.ts\"",
    "test": "echo \"no tests yet\" && exit 0",
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 5.2: Create `packages/shared-types/tsconfig.json`**

Create `packages/shared-types/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "composite": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5.3: Create `packages/shared-types/src/index.ts`**

Create `packages/shared-types/src/index.ts`:
```typescript
export const SHARED_TYPES_VERSION = '0.0.0' as const;
```

- [ ] **Step 5.4: Install and verify build**

```bash
pnpm install
pnpm --filter @vittoria/shared-types build
```

Expected: `packages/shared-types/dist/index.js` and `index.d.ts` are created.

- [ ] **Step 5.5: Commit**

```bash
git add packages/shared-types pnpm-lock.yaml
git commit -m "chore: add shared-types package skeleton"
```

---

## Task 6: Create Local Dev Docker Compose

**Files:**
- Create: `infra/docker-compose.dev.yml`
- Create: `infra/.env.example`

Local dev stack: Postgres 16 (db `vittoria_dev`, user `vittoria`, pwd `vittoria`), Redis 7, MinIO (S3-compatible), MailHog (SMTP catcher for future use).

- [ ] **Step 6.1: Create `infra/.env.example`**

Create `infra/.env.example`:
```env
POSTGRES_USER=vittoria
POSTGRES_PASSWORD=vittoria
POSTGRES_DB=vittoria_dev
POSTGRES_PORT=5432

REDIS_PORT=6379

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001

MAILHOG_SMTP_PORT=1025
MAILHOG_HTTP_PORT=8025
```

- [ ] **Step 6.2: Create `infra/docker-compose.dev.yml`**

Create `infra/docker-compose.dev.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-vittoria}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-vittoria}
      POSTGRES_DB: ${POSTGRES_DB:-vittoria_dev}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - vittoria_postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-vittoria}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - vittoria_redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
    command: server /data --console-address ":9001"
    ports:
      - "${MINIO_API_PORT:-9000}:9000"
      - "${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - vittoria_minio:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "${MAILHOG_SMTP_PORT:-1025}:1025"
      - "${MAILHOG_HTTP_PORT:-8025}:8025"

volumes:
  vittoria_postgres:
  vittoria_redis:
  vittoria_minio:
```

- [ ] **Step 6.3: Smoke-test the stack**

```bash
docker compose -f infra/docker-compose.dev.yml up -d
docker compose -f infra/docker-compose.dev.yml ps
```

Expected: all four services are `Up`/`Healthy` (postgres, redis, minio show health; mailhog has no healthcheck and shows `Up`).

- [ ] **Step 6.4: Verify Postgres is reachable**

```bash
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U vittoria -d vittoria_dev -c "SELECT 1;"
```

Expected: output contains `(1 row)`.

- [ ] **Step 6.5: Tear down (optional, keeps volumes)**

```bash
docker compose -f infra/docker-compose.dev.yml down
```

Expected: services removed, volumes retained.

- [ ] **Step 6.6: Commit**

```bash
git add infra/docker-compose.dev.yml infra/.env.example
git commit -m "feat(infra): local dev Docker Compose with postgres, redis, minio, mailhog"
```

---

## Task 7: Add GitHub Actions CI Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

CI runs lint + tests for `@vittoria/api` and `@vittoria/admin` on every PR to `main`. Mobile builds (iOS, Android) are added in later plans.

- [ ] **Step 7.1: Create `.github/workflows/ci.yml`**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package: ['@vittoria/api', '@vittoria/admin', '@vittoria/shared-types']

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm --filter ${{ matrix.package }} lint

      - name: Test
        run: pnpm --filter ${{ matrix.package }} test
```

- [ ] **Step 7.2: Verify the YAML is valid**

Run (requires Node 20):
```bash
node -e "const yaml = require('js-yaml'); const fs = require('fs'); console.log(yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8')));"
```

If `js-yaml` is not installed, install it as a dev dep at the root temporarily:
```bash
pnpm add -D -w js-yaml
node -e "const yaml = require('js-yaml'); const fs = require('fs'); console.log(yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8')));"
pnpm remove -w js-yaml
```

Expected: the YAML parses without error and prints the parsed object.

- [ ] **Step 7.3: Run lint and test locally (CI dry-run)**

```bash
pnpm install --frozen-lockfile
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api test
pnpm --filter @vittoria/admin lint
pnpm --filter @vittoria/admin test
pnpm --filter @vittoria/shared-types lint
pnpm --filter @vittoria/shared-types test
```

Expected: all commands exit 0.

- [ ] **Step 7.4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint and test matrix for api, admin, shared-types"
```

---

## Task 8: Scaffold `apps/ios` (iOS Project)

> **Platform requirement:** This task requires macOS with Xcode 15+. If working on Windows/Linux, create only the README placeholder (Step 8.1), commit it, and defer Steps 8.2–8.7 to an engineer on macOS.

**Files:**
- Create: `apps/ios/README.md`
- Create (via Xcode wizard): `apps/ios/VittoriaHome.xcodeproj/`
- Create: `apps/ios/VittoriaHome/VittoriaHomeApp.swift`
- Create: `apps/ios/VittoriaHome/ContentView.swift`
- Create: `apps/ios/VittoriaHomeTests/VittoriaHomeTests.swift`

- [ ] **Step 8.1: Create `apps/ios/README.md`**

Create `apps/ios/README.md`:
```markdown
# VITTORIA HOME — iOS

Native iOS client (Swift, SwiftUI, Combine, MVVM).

## Requirements

- macOS Sonoma+
- Xcode 15+
- iOS deployment target: 16.0+

## Setup

1. Open `VittoriaHome.xcodeproj` in Xcode.
2. Select scheme `VittoriaHome` and run on a simulator (iPhone 15).
3. Run tests: `Cmd+U`.

## Project layout

- `VittoriaHome/` — app target source
- `VittoriaHomeTests/` — unit tests

Detailed architecture is added in Plan 6.
```

- [ ] **Step 8.2 (macOS only): Create Xcode project via wizard**

In Xcode:
- File → New → Project
- iOS → App → Next
- Product Name: `VittoriaHome`
- Team: (set your team or leave None for dev)
- Organization Identifier: `app.vittoria`
- Interface: SwiftUI
- Language: Swift
- Storage: None
- Tick "Include Tests"
- Save to `apps/ios/` (clear "Create Git repository" — we already have one)

Expected: `apps/ios/VittoriaHome.xcodeproj/`, `apps/ios/VittoriaHome/`, `apps/ios/VittoriaHomeTests/` are created by Xcode.

- [ ] **Step 8.3: Replace generated ContentView with a labeled placeholder**

Replace contents of `apps/ios/VittoriaHome/ContentView.swift`:
```swift
import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("VITTORIA HOME")
                .font(.largeTitle)
                .bold()
            Text("v0.0.0 bootstrap")
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
```

- [ ] **Step 8.4: Write a passing unit test**

Replace contents of `apps/ios/VittoriaHomeTests/VittoriaHomeTests.swift`:
```swift
import XCTest
@testable import VittoriaHome

final class VittoriaHomeTests: XCTestCase {
    func test_appBundle_hasExpectedIdentifier() {
        let identifier = Bundle.main.bundleIdentifier
        XCTAssertNotNil(identifier)
    }
}
```

- [ ] **Step 8.5 (macOS only): Build and run the test from CLI**

```bash
cd apps/ios
xcodebuild \
  -project VittoriaHome.xcodeproj \
  -scheme VittoriaHome \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  test
```

Expected: `TEST SUCCEEDED`.

- [ ] **Step 8.6: Ensure `.gitignore` covers iOS**

Verify `.gitignore` already excludes `apps/ios/Pods/`, `apps/ios/build/`, `apps/ios/DerivedData/`, and user-specific Xcode files (added in Task 1.2). If anything is missing, append it.

- [ ] **Step 8.7: Commit**

On macOS (after Xcode steps):
```bash
git add apps/ios
git commit -m "feat(ios): scaffold Xcode project with bootstrap ContentView and unit test"
```

On non-macOS (README only):
```bash
git add apps/ios/README.md
git commit -m "docs(ios): add placeholder README; full scaffolding deferred to macOS workstation"
```

---

## Task 9: Scaffold `apps/android` (Android Project)

**Files:**
- Create: `apps/android/README.md`
- Create (via Android Studio wizard): `apps/android/` Gradle project
- Modify: generated `MainActivity.kt`
- Create/modify: `apps/android/app/src/test/java/app/vittoria/home/AppSmokeTest.kt`

- [ ] **Step 9.1: Create `apps/android/README.md`**

Create `apps/android/README.md`:
```markdown
# VITTORIA HOME — Android

Native Android client (Kotlin, Jetpack Compose, Coroutines/Flow, MVVM, Hilt).

## Requirements

- Android Studio Hedgehog+
- JDK 17 (bundled with Android Studio)
- min SDK 26 (Android 8.0), target SDK 34

## Setup

1. Open `apps/android/` in Android Studio ("Open existing project").
2. Wait for Gradle sync.
3. Run configuration `app` on an emulator (Pixel 6, API 34).
4. Run tests: `./gradlew test`.

Detailed architecture is added in Plan 7.
```

- [ ] **Step 9.2: Create Android Studio project via wizard**

In Android Studio:
- File → New → New Project
- Phone and Tablet → Empty Activity (Compose)
- Name: `VittoriaHome`
- Package: `app.vittoria.home`
- Save to `apps/android/` (parent directory; Android Studio puts the project inside)
- Minimum SDK: API 26
- Build configuration language: Kotlin DSL (`build.gradle.kts`)

Expected: `apps/android/build.gradle.kts`, `apps/android/app/build.gradle.kts`, `apps/android/app/src/...` are created.

- [ ] **Step 9.3: Replace MainActivity with bootstrap composable**

Replace contents of `apps/android/app/src/main/java/app/vittoria/home/MainActivity.kt`:
```kotlin
package app.vittoria.home

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    BootstrapScreen()
                }
            }
        }
    }
}

@Composable
fun BootstrapScreen() {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "VITTORIA HOME", style = MaterialTheme.typography.headlineMedium)
        Text(text = "v0.0.0 bootstrap", style = MaterialTheme.typography.bodyMedium)
    }
}

@Preview(showBackground = true)
@Composable
fun BootstrapScreenPreview() {
    MaterialTheme { BootstrapScreen() }
}
```

- [ ] **Step 9.4: Replace generated unit test with a smoke test**

Replace `apps/android/app/src/test/java/app/vittoria/home/ExampleUnitTest.kt` (if it exists) with `AppSmokeTest.kt`:
```kotlin
package app.vittoria.home

import org.junit.Assert.assertEquals
import org.junit.Test

class AppSmokeTest {
    @Test
    fun packageName_isCorrect() {
        assertEquals("app.vittoria.home", AppSmokeTest::class.java.`package`?.name)
    }
}
```

If `ExampleUnitTest.kt` exists, delete it.

- [ ] **Step 9.5: Run the unit test from CLI**

On Linux/macOS:
```bash
cd apps/android
./gradlew testDebugUnitTest
```

On Windows PowerShell:
```powershell
cd apps/android
.\gradlew.bat testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`, test passes.

- [ ] **Step 9.6: Ensure `.gitignore` covers Android**

Verify `.gitignore` already excludes `apps/android/.gradle/`, `apps/android/build/`, `apps/android/app/build/`, `apps/android/local.properties`, `*.iml` (added in Task 1.2). If anything is missing, append it.

- [ ] **Step 9.7: Commit**

```bash
git add apps/android
git commit -m "feat(android): scaffold Android Studio project with Compose bootstrap and unit test"
```

---

## Task 10: Add Root Convenience Scripts and Final README Update

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 10.1: Add dev orchestration scripts to root `package.json`**

Update `package.json` (replace `scripts` section):
```json
{
  "scripts": {
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "dev:infra": "docker compose -f infra/docker-compose.dev.yml up -d",
    "dev:infra:down": "docker compose -f infra/docker-compose.dev.yml down",
    "dev:api": "pnpm --filter @vittoria/api dev",
    "dev:admin": "pnpm --filter @vittoria/admin dev"
  }
}
```

- [ ] **Step 10.2: Verify scripts work**

```bash
pnpm dev:infra
docker ps
```

Expected: postgres, redis, minio, mailhog are listed.

```bash
pnpm dev:infra:down
```

Expected: containers stopped.

- [ ] **Step 10.3: Update root `README.md` Quick Start to reference scripts**

In `README.md`, replace the "Quick start" section with:
```markdown
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
```

- [ ] **Step 10.4: Commit**

```bash
git add package.json README.md
git commit -m "chore: add root dev scripts (dev:infra, dev:api, dev:admin)"
```

---

## Task 11: Final Verification

This task runs all the checks the CI will run, end-to-end, to ensure the bootstrap is complete and reproducible.

- [ ] **Step 11.1: Clean install from lockfile**

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install --frozen-lockfile
```

Expected: install completes without errors, no lockfile changes.

- [ ] **Step 11.2: Run full lint + test matrix**

```bash
pnpm lint
pnpm test
```

Expected: all packages lint and test clean.

- [ ] **Step 11.3: Run the API and admin together**

In separate terminals:
```bash
pnpm dev:infra
pnpm dev:api
pnpm dev:admin
```

Open:
- `http://localhost:3000/healthz` → `{"status":"ok"}`
- `http://localhost:5173` → page shows "VITTORIA HOME — Admin"

Stop with Ctrl+C and `pnpm dev:infra:down`.

- [ ] **Step 11.4: Run Android tests (if Android Studio installed)**

```bash
cd apps/android
./gradlew testDebugUnitTest    # or .\gradlew.bat on Windows
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 11.5: Run iOS tests (macOS only)**

```bash
cd apps/ios
xcodebuild -project VittoriaHome.xcodeproj -scheme VittoriaHome \
  -destination 'platform=iOS Simulator,name=iPhone 15' test
```

Expected: `TEST SUCCEEDED`.

- [ ] **Step 11.6: Push to remote (if remote is configured)**

If a remote `origin` exists:
```bash
git push -u origin main
```

Expected: GitHub Actions CI runs (`lint-and-test` matrix) and passes for all three packages.

If no remote yet: skip this step. Remote setup is part of Plan 8 (production deploy).

---

## Definition of Done

Plan 0 is complete when:

- [x] Git repo initialized with a clean history of 10+ conventional commits.
- [x] `pnpm install --frozen-lockfile` succeeds on a clean clone.
- [x] `pnpm lint` and `pnpm test` exit 0.
- [x] `pnpm dev:infra` brings up postgres/redis/minio/mailhog and they pass healthchecks.
- [x] `GET http://localhost:3000/healthz` returns `{"status":"ok"}` from a fresh `pnpm dev:api`.
- [x] `http://localhost:5173` renders the admin shell from a fresh `pnpm dev:admin`.
- [x] iOS project builds and tests pass (macOS workstation only).
- [x] Android project builds and tests pass.
- [x] GitHub Actions CI is green (if remote is configured).

After Plan 0 lands, proceed to **Plan 1: Backend Foundation** (auth, users, Prisma migrations).

---

**End of Plan 0.**
