# Jilanix — SchoolOS SaaS

Multi-tenant school operations platform. Backend on NestJS + Prisma + PostgreSQL, frontend on Next.js (App Router) + TypeScript.

## Structure

```
schoolos-saas/
├── backend/         # NestJS API — auth, RBAC, multi-tenant middleware
├── frontend/        # Next.js App Router — Jilanix Operator Console UI
├── database/        # Shared schema notes
├── docs/            # Architecture, sprint reports, design system
├── infrastructure/  # Deployment / infra scaffolding
├── integrations/    # Third-party integration adapters
└── scripts/         # Repo-level tooling
```

## Getting started

### Backend
```bash
cd backend
cp .env.example .env       # fill in DATABASE_URL, JWT secrets, etc.
npm install
npm run prisma:migrate
SEED_TARGET=dev npm run prisma:seed
npm run start:dev          # boots on :3000
```

### Frontend
```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
# NEXT_PUBLIC_DEFAULT_SCHOOL_ID=<canary uuid from backend seed>
npm install
npm run dev                # boots on :3001
```

## Documentation

- Auth UI implementation: `docs/frontend/AUTH_UI_IMPLEMENTATION_REPORT.md`
- Design system: `docs/frontend/JILANIX_DESIGN_SYSTEM_V1.md`

## License

Proprietary — all rights reserved.
