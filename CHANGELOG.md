# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Community-health documentation: `SECURITY.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `CHANGELOG.md`.
- Public-ready `README.md` for the open-source release.

### Changed
- Repository made public; history cleaned to ship code only.

## [1.1.0] — Planning

Client portal + base loop. Roadmap, requirements, and per-phase success criteria
are defined; implementation has not started. Planned scope:

- Project module (signed proposal → project with frozen budget snapshot).
- Stripe payments (Payment Element, deposit on signature, verified webhooks).
- Client portal (magic-link JWT, proposals / payments / project status).
- Public API + outgoing webhooks (`ksl_live_` keys, `/api/v1/`, HMAC-SHA256).
- Full CRM (kanban pipeline, client org, 360 view, activity log, CSV import).
- EU VAT + i18n (per-line VAT, legal mentions, FR/EN).
- SEPA + portal files + per-org branding.

## [1.0.0] — 2026-06-13

Initial milestone: the **AI proposal engine**. The full prospect → AI-generated
priced proposal → public link → PAdES e-sign → won/lost flywheel loop, implemented
and tested.

### Added
- Minimal CRM (contacts, deals, deal status, filterable list).
- Proposal & pricing editor (Tiptap, reusable templates, pricing grid, snapshotted
  priced quote).
- AI proposal generation (brief → priced quote via Claude, strict tool use,
  won/lost flywheel; degrades to 503 without an Anthropic key).
- Server-side PDF export (Puppeteer/Chromium).
- Public client link + e-sign (shareable proposal page, view tracking, PAdES
  signature via pdf-lib + PKCS#12).
- Flywheel data loop (won/lost outcomes recorded for AI calibration).
- Multi-tenant foundation (Better Auth organizations, row-level `orgId` scoping at
  the ORM, RBAC, cross-org negative tests).

[Unreleased]: https://github.com/assinscreedFC/kessel/compare/v1.1...HEAD
[1.1.0]: https://github.com/assinscreedFC/kessel/compare/v1.0...v1.1
[1.0.0]: https://github.com/assinscreedFC/kessel/releases/tag/v1.0
