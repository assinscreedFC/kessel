# Contributing to Kessel

Thanks for your interest in Kessel — the open-source OS for agencies and freelancers.
Contributions are welcome: bug reports, feature discussion, documentation, and pull
requests.

## Ground Rules

- Be respectful — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Open an issue to discuss larger changes **before** starting significant work.
- Contributions to the AGPL core are accepted under [AGPL-3.0](LICENSE).
- For security issues, **do not** open a public issue — see [SECURITY.md](SECURITY.md).

## Development Setup

> Prerequisites: Node 20+, pnpm 10, Docker (for a local PostgreSQL), Git.

```bash
git clone https://github.com/assinscreedFC/kessel.git
cd kessel
cp .env.example .env          # fill in local secrets
pnpm install
pnpm prisma migrate dev       # apply migrations
pnpm nx serve web             # run the dashboard in dev
```

Run the test suite (spins up a real PostgreSQL via Testcontainers):

```bash
pnpm test                     # vitest run
pnpm nx run-many -t lint      # lint all projects
```

## Architecture & Conventions

Kessel is a modular monolith in an Nx monorepo, full-stack TypeScript.

- **Module boundaries are enforced** (`@nx/enforce-module-boundaries`). A domain
  package (`packages/*`) never imports another; cross-domain orchestration lives in
  `apps/api`. Keep a PR scoped to one module where possible.
- **Multi-tenant isolation is critical.** Every scoped DB query goes through
  `forOrg(orgId)`. Never use the base client directly outside tests. New scoped model
  → add it to `SCOPED_MODELS`; scoped-via-parent → do not.
- **DTOs are whitelisted** (class-validator). Never accept server-controlled fields
  (rates, snapshot prices, `orgId`, protected status) from a client DTO.
- **Money is exposed as `string`** in output DTOs (never `number`); use decimal.js
  for calculation.
- **Errors**: typed NestJS exceptions, fail-closed, no silent swallowing.

## Tests

- Vitest, `*.spec.ts` colocated with the code.
- A **cross-org negative test (IDOR)** is mandatory for every tenant-scoped endpoint.
- Use real PostgreSQL via Testcontainers (no mocking of real I/O).

## Commit & PR

- Conventional commit style: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Keep commits atomic (one logical change per commit).
- Ensure `pnpm test` and `pnpm nx run-many -t lint` pass before opening a PR.
- Describe what changed and why; link the related issue.

## Questions

Open a [GitHub issue](https://github.com/assinscreedFC/kessel/issues) or reach the
maintainer [@assinscreedFC](https://github.com/assinscreedFC).
