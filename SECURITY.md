# Security Policy

Kessel handles authentication, multi-tenant data isolation, payments, and personal
data (GDPR scope). We take security reports seriously.

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

Report privately through GitHub's [private vulnerability reporting](https://github.com/assinscreedFC/kessel/security/advisories/new)
(Security tab → "Report a vulnerability"). If that is unavailable, contact the
maintainer [@assinscreedFC](https://github.com/assinscreedFC).

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce (proof of concept if possible).
- Affected version / commit and component (e.g. `apps/api`, auth, payments).

We aim to acknowledge reports within 5 business days and to provide a remediation
timeline after triage. Coordinated disclosure is appreciated — please give us a
reasonable window to ship a fix before public disclosure.

## Supported Versions

Kessel is pre-1.x in active development. Security fixes target the latest `main`.
Tagged releases (`v1.0`, `v1.1`, …) are snapshots; fixes are not backported unless
stated otherwise.

| Version | Supported |
|---------|-----------|
| `main`  | ✅ |
| tagged releases | ⚠️ latest tag only |

## Scope

In scope: the Kessel core (this repository) — API, web dashboard, client portal,
domain packages, multi-tenant isolation, auth, and payment flows.

Out of scope: third-party services (Stripe, Anthropic, MinIO), your own deployment
configuration, and the contents of `.env` files (operator responsibility).

## Hardening Notes for Self-Hosters

- Set strong, unique values for `BETTER_AUTH_SECRET` and all credentials in `.env`.
- Never commit `.env`; keep PKCS#12 signing material out of version control.
- Terminate TLS at the reverse proxy (Caddy) and restrict database/MinIO/Redis to
  the internal Docker network.
- Keep the deployment updated with the latest `main` security fixes.
