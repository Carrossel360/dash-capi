# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # start Next.js dev server

# Build (runs prisma generate first)
npm run build

# Database
npm run db:push      # push schema changes to DB (no migration files)
npm run db:studio    # open Prisma Studio GUI
```

No test suite is configured.

## Environment Variables

Copy `.env.example` to `.env`. Required vars:
- `DATABASE_URL` — Neon pooled connection (PgBouncer)
- `DIRECT_URL` — Neon direct connection (required by Prisma for migrations/schema push)
- `JWT_SECRET` — HS256 signing key (7-day tokens)
- `NEXT_PUBLIC_API_URL` — public URL used inside the generated tracker script
- `CRON_SECRET` — guards `/api/cron/capi`
- `META_TEST_EVENT_CODE` — optional, activates Meta test event mode

## Architecture

### Overview
SaaS dashboard for marketing agencies. Core feature is **Meta Conversions API (CAPI)** — it collects browser events, stores them queued in Postgres, and a Vercel cron fires every minute to flush them to Meta's Graph API.

### Multi-tenancy
All data is scoped to a `Workspace`. Every authenticated API route reads `workspaceId` from the JWT payload (`lib/auth.ts`) and enforces it on every Prisma query. Users belong to workspaces via `WorkspaceMember` with roles (`admin`, `manager`, `attendant`, `viewer`).

### Auth flow
- Login → `POST /api/auth/login` → returns JWT + workspace info
- JWT stored client-side in Zustand (`lib/store/auth.ts`, persisted to `localStorage` under key `carrossel360-auth`)
- Dashboard layout (`app/(dashboard)/layout.tsx`) guards all protected pages: waits for Zustand hydration then redirects unauthenticated users to `/login`
- API routes call `getAuthPayload(req)` from `lib/auth.ts` — returns `null` on invalid/missing token

### CAPI event pipeline
1. **Site tracker** — `GET /api/t/[workspaceId]` serves a JS snippet. Embed with `<script src="…/api/t/{workspaceId}"></script>`. The script captures PageView, Lead (form submit), WhatsAppClick, and phone clicks, then POSTs to `/api/collect`.
2. **Collect endpoint** — `POST /api/collect` (no auth, CORS open) saves a `TrackerEvent` and, for conversion events (`Lead`, `Purchase`, `InitiateCheckout`, `WhatsAppClick`), creates a `CAPIEvent` with `status: queued`.
3. **CRM trigger** — moving a lead to a pipeline stage that has `triggerCapiEvent` set also enqueues a `CAPIEvent` (source: `crm`).
4. **Cron flush** — `GET /api/cron/capi` (Vercel cron, every minute, secured by `CRON_SECRET`) picks up to 50 `queued` events, hashes user data (`lib/utils.ts`), and calls Meta Graph API v21.0 via `lib/meta-capi.ts`. Retries up to 3 attempts; marks `failed` after that.

### Data hashing
`buildHashedUserData` in `lib/utils.ts` SHA-256 hashes email (lowercased+trimmed) and phone (digits only) before sending to Meta. `calculateMatchQuality` scores 0–10 based on which fields are present.

### Frontend routing
Uses Next.js App Router with two route groups:
- `app/(auth)/` — login page, no sidebar
- `app/(dashboard)/` — authenticated pages with `Sidebar` + `Toaster`

Dashboard pages: `dashboard`, `campanhas` (campaigns), `clientes` (clients/CRM), `pipeline` (kanban), `trafego-pago`, `social-media`, `google-business`, `google-local`, `conversas`, `events`, `settings`.

### State management
Zustand (`lib/store/auth.ts`) is the only global store — holds user, JWT token, current workspace, and list of accessible workspaces. All API calls from the client attach `Authorization: Bearer <token>` manually.

### Database
PostgreSQL via Neon. Prisma schema at `prisma/schema.prisma`. Use `db:push` for schema changes (no migration history). `@prisma/client` is listed as a `serverExternalPackage` in `next.config.mjs` to avoid bundling issues.
