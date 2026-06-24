<div align="center">

# Kessel

**The open-source OS for agencies and freelancers.** Self-hostable · AI-native · EU-sovereign.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
![Monorepo: Nx](https://img.shields.io/badge/monorepo-Nx-143055)
![Backend: NestJS](https://img.shields.io/badge/backend-NestJS-e0234e)
![Frontend: React](https://img.shields.io/badge/frontend-React_19-61dafb)
![Database: Postgres](https://img.shields.io/badge/database-Postgres-336791)
![Status: v1.0 shipped · v1.1 planning](https://img.shields.io/badge/status-v1.0_shipped_·_v1.1_planning-success)

</div>

---

## Overview

Kessel closes the **full client loop** for agencies and freelancers — prospect → brief → proposal (with e-sign) → project → time → invoice → client portal — where US-centric tools (HoneyBook, Bonsai, Productive) are fragmented, expensive, and not EU-compliant.

The entry wedge is the **AI proposal engine**: turn a raw client brief into a **proposal plus a priced, ready-to-sign quote**, calibrated on your past won proposals (an AI flywheel, not a GPT wrapper). From that foundation, Kessel expands one module at a time toward the complete loop.

It is a modular monolith, full-stack TypeScript, designed to run with a single `docker compose up` so your data stays on your own infrastructure.

### Why Kessel

- **EU data sovereignty.** Self-host on your own infrastructure (single `docker compose up`); your client data never leaves where you put it. No US-cloud dependency, GDPR-aligned by design.
- **One tool instead of five.** The full client loop in one place, where teams today stitch together a CRM, a proposal tool, a project tracker, a timesheet, and an invoicer.
- **Open-core, not lock-in.** The core is **AGPL-3.0** and free to self-host. A planned proprietary `/ee` module covers enterprise features; the AGPL network clause protects against SaaS resale without contribution (an Odoo-style community + Enterprise structure). See [License](#license).

## Features

### Shipped (v1.0 — AI proposal engine)

- **Minimal CRM** — contacts, deals, and deal status with a filterable list.
- **Proposal & pricing editor** — Tiptap rich-text editor, reusable templates, a pricing grid, and a snapshotted priced quote.
- **AI proposal generation** — brief → priced quote via Claude (`@anthropic-ai/sdk`, strict tool use), calibrated on the won/lost flywheel. Degrades gracefully (503) when no Anthropic key is configured.
- **PDF export** — server-side rendering of the proposal (Puppeteer/Chromium).
- **Public client link + e-sign** — shareable public proposal page, view tracking, and PAdES signature (pdf-lib + PKCS#12, Documenso-style). Signing moves the deal to WON.
- **Flywheel data loop** — won/lost outcomes are recorded into a dataset that feeds back into AI generation.
- **Multi-tenant foundation** — Better Auth organizations, row-level `orgId` scoping at the ORM, RBAC, and cross-org negative tests throughout.

### Planned / WIP (v1.1 — client portal + base loop)

These domains have their module boundaries in place (`@kessel/projects`, `@kessel/portal`, `@kessel/invoicing`, `@kessel/timetrack` are intentional boundary stubs today) but **no feature implementation yet**. Roadmap, requirements, and success criteria are written; phase planning is the next step.

- **Project module** — convert a signed proposal into a project with a frozen budget snapshot and tasks derived from quote lines.
- **Stripe payments** — embedded Payment Element, deposit on signature, verified HMAC webhooks, idempotent updates.
- **Client portal** — third Vite app, magic-link JWT (`role:client`), proposals/payments/project status.
- **Public API + outgoing webhooks** — `ksl_live_` API keys, `/api/v1/`, HMAC-SHA256 webhooks.
- **Full CRM** — kanban pipeline, client org, 360 view, activity log, CSV import.
- **EU VAT + i18n** — per-line VAT, legal mentions, FR/EN switch for dashboard and portal.
- **SEPA + portal files + branding** — SEPA SetupIntent, MinIO upload/download, per-org branding.

> Later milestones (v2) target time tracking, invoicing from time, Factur-X + Chorus Pro/PDP hand-off, profitability dashboards, and an MCP layer.
>
> **Payments — exploration:** alongside the planned Stripe/SEPA path (v1.1), we are exploring [GNU Taler](https://taler.net) as a sovereign, privacy-preserving payment option. This is a roadmap exploration, not a shipped feature.

## Tech Stack

Modular monolith in an **Nx monorepo**, full-stack TypeScript, with strict module boundaries (`@nx/enforce-module-boundaries`): a domain package never imports another, and cross-domain orchestration lives in `apps/api`.

| Layer | Technology |
|-------|-----------|
| Monorepo | Nx 22, pnpm 10 |
| Backend | NestJS 11 + TypeScript |
| Frontend | React 19 / Vite + Feature-Sliced Design + shadcn/ui + TanStack Query |
| Database | PostgreSQL (custom fields via JSONB + GIN) |
| ORM | Prisma (migrations) + Kysely (typed queries) |
| Auth / multi-tenant | Better Auth (org `orgId`, row-level isolation at the ORM) |
| Editor | Tiptap |
| AI | `@anthropic-ai/sdk` (Claude, strict tool use, won/lost flywheel) |
| E-sign | pdf-lib + PKCS#12 + PAdES (Documenso pattern) |
| PDF | Puppeteer / Chromium |
| Storage | MinIO (S3-compatible) |
| Testing | Vitest + Testcontainers (real Postgres) |
| Self-host | Docker Compose (api + web + postgres + redis + minio + caddy) |

## Getting Started

### Self-host with Docker (quickest)

> Prerequisites: Docker + Docker Compose.

```bash
git clone https://github.com/assinscreedFC/kessel.git
cd kessel
cp .env.example .env          # fill in secrets (DB, Better Auth, Anthropic, MinIO…)
docker compose up
```

The API responds on `/api/health`; the dashboard is served through Caddy.

### Local development

> Prerequisites: Node 20+, pnpm 10, and a running PostgreSQL instance (the compose file provides one).

```bash
pnpm install
pnpm prisma migrate dev               # apply migrations (schema in packages/shared/db)
pnpm nx run-many -t build             # build all packages
pnpm nx serve web                     # run the dashboard in dev
```

Run the test suite (spins up a real Postgres via Testcontainers):

```bash
pnpm test                             # vitest run
pnpm nx run-many -t lint              # lint all projects
```

## Environment Variables

Copy `.env.example` to `.env` and fill in real values. Never commit secrets.

| Variable | Description | Example / placeholder |
|----------|-------------|-----------------------|
| `POSTGRES_USER` | Postgres user | `kessel` |
| `POSTGRES_PASSWORD` | Postgres password | `changeme-postgres` |
| `POSTGRES_DB` | Postgres database name | `kessel` |
| `DATABASE_URL` | Connection string used by Prisma and Better Auth | `postgresql://kessel:...@postgres:5432/kessel?schema=public` |
| `BETTER_AUTH_SECRET` | Session/cookie signing key (`openssl rand -hex 32`) | `changeme-32-byte-hex` |
| `BETTER_AUTH_URL` | Trusted public URL (cookies/CSRF) | `http://localhost` |
| `PORT` | NestJS API listen port | `3000` |
| `APP_ORIGIN` | Public origin for client-facing links | `http://localhost` |
| `ANTHROPIC_API_KEY` | Claude API key; absent → AI generation returns 503 | `changeme-anthropic-api-key` |
| `KESSEL_AI_MODEL` | Generation model (optional) | `claude-sonnet-4-6` |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO root credentials | `kessel` / `changeme-minio` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO access keys used by the API | `kessel` / `changeme-minio` |
| `MINIO_BUCKET` | Bucket for signed PDFs | `kessel-signed` |
| `SIGNING_P12_PATH` | Path to the PKCS#12 cert (path, not a secret) | `/run/secrets/kessel-signing.p12` |
| `SIGNING_P12_PASSPHRASE` | PKCS#12 passphrase (secret) | `changeme-p12-passphrase` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `PUPPETEER_SKIP_DOWNLOAD` | Skip bundled Chromium download in container | `true` |
| `PUPPETEER_EXECUTABLE_PATH` | System Chromium path | `/usr/bin/chromium` |

See `.env.example` for inline notes and key-generation commands.

## Project Structure

```
kessel/
├── apps/
│   ├── api/         NestJS — orchestration, controllers, DTOs, e2e specs
│   │                (contacts, deals, pricing, proposals, public link/sign, RBAC, health)
│   └── web/         React/Vite dashboard (Feature-Sliced Design: app/pages/features/entities)
│
├── packages/
│   ├── ai/          Proposal generation + flywheel (Anthropic generator + fake generator)
│   ├── auth/        Better Auth setup + migrations
│   ├── crm/         Contacts, deals, pipeline
│   ├── proposals/   Quotes, templates, PDF, e-sign, money/token helpers, outcomes, delivery
│   ├── shared/      Cross-cutting contracts, Tiptap extensions
│   │   └── db/      Prisma schema, tenant-scoped client, isolation specs
│   ├── invoicing/   Boundary stub (WIP)
│   ├── portal/      Boundary stub (WIP)
│   ├── projects/    Boundary stub (WIP)
│   └── timetrack/   Boundary stub (WIP)
│
├── docs/            RESEARCH-APPENDIX.md
├── .planning/       Roadmap, requirements, milestone state (GSD workflow)
├── CAHIER-DES-CHARGES.md   Full product spec (vision, market, architecture, phases)
├── docker-compose.yml · Caddyfile · nx.json · pnpm-workspace.yaml
```

Multi-tenancy: every scoped model carries `orgId` and is accessed through `forOrg(orgId)` (Prisma `$extends`, `SCOPED_MODELS` allow-list) or scoped via its parent. Cross-org negative tests are enforced to prevent false-green isolation.

## Status

**Honest snapshot: roughly 55% of the full product vision.** This is a working codebase, not a scaffold.

- **v1.0 — AI proposal engine: shipped.** 6 phases / 25 plans completed (2026-06-13). The full prospect → AI-generated priced proposal → public link → PAdES e-sign → won/lost flywheel loop is implemented and tested (41 spec files, real-Postgres integration tests via Testcontainers).
- **v1.1 — Client portal + base loop: planning.** Roadmap, requirements, and per-phase success criteria are written (8 phases). Implementation has not started (0/8). The `projects`, `portal`, `invoicing`, and `timetrack` packages exist only as module-boundary stubs today.
- **v2 and beyond: not started.** Time tracking, invoicing, Factur-X / Chorus Pro, profitability dashboards, MCP layer.

What works now: CRM (contacts/deals), pricing grid, Tiptap proposal/template editor with autosave, AI generation, PDF export, public proposal page with e-sign, won/lost dataset, multi-tenant auth + RBAC, Docker Compose self-host.

What is WIP: everything in the v1.1 feature list above (projects, payments, client portal, public API/webhooks, full CRM, EU VAT/i18n, SEPA/files/branding).

## Contributing

Kessel is open source and contributions are welcome — issues, bug reports, and pull requests.

- Read [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) for the product vision, architecture, and module roadmap.
- The codebase follows strict Nx module boundaries and multi-tenant isolation conventions; please keep PRs scoped to one module and include tests (Vitest + Testcontainers).
- Contributions to the AGPL core are accepted under AGPL-3.0.

Open an issue to discuss larger changes before starting.

## License

[AGPL-3.0](LICENSE). The core is free and self-hostable. A proprietary `/ee` directory (planned) will cover enterprise features (SSO, advanced RBAC, white-label). The AGPL network clause protects against SaaS resale without contribution — an Odoo-style structure (community + Enterprise + integrator + future marketplace).

---

Maintainer: [@assinscreedFC](https://github.com/assinscreedFC) · Issues and pull requests welcome.
