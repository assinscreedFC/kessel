<div align="center">

# Kessel

**L'OS open source des agences et freelances.** Self-hostable · IA native · EU souverain.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
![Stack](https://img.shields.io/badge/stack-NestJS_·_React_·_Postgres-informational)
![Status](https://img.shields.io/badge/status-v1.0_shipped_·_v1.1_in_progress-success)

</div>

---

Kessel ferme la **boucle client complète** — prospect → brief → proposition (avec e-sign) → projet → temps → facture → portail client — là où les outils US (HoneyBook, Bonsai, Productive) sont fragmentés, chers et non conformes UE.

Le wedge d'entrée est le **moteur de propositions IA** : transformer un brief client brut en **proposition + devis chiffré prêt à signer**, calibré sur vos propositions gagnées passées (IA flywheel, pas un wrapper GPT). Puis on étend module par module vers la boucle complète.

## Pourquoi

- **Fin de la fragmentation** — une boucle reliée, pas un n-ième outil isolé parmi 6 à 8 déconnectés.
- **EU souverain** — TVA UE, régime auto-entrepreneur FR, SEPA, RGPD, données chez vous, Factur-X (à venir). Aucun incumbent US ne le tient.
- **IA flywheel** — le devis apprend de vos propositions gagnées/perdues, par type de client, prix, formulation.
- **Open source, self-hostable** — AGPL-3.0, un `docker compose up`, vos données restent chez vous.

## État du projet

| Milestone | Périmètre | Statut |
|-----------|-----------|--------|
| **v1.0 — Moteur de propositions IA** | CRM minimal, éditeur Tiptap + tarifs, devis chiffré, génération IA calibrée, export PDF, lien client public + e-sign PAdES, flywheel gagné/perdu | ✅ Livré |
| **v1.1 — Portail client + boucle de base** | Portail client unifié, paiement Stripe + SEPA, conversion proposition → projet, CRM complet, API publique + webhooks, multilingue + TVA UE | 🚧 En cours |

Suite (v2) : suivi du temps, facture depuis le temps, Factur-X + hand-off Chorus Pro/PDP, dashboards rentabilité, couche MCP.

## Stack

Modular monolith (monorepo Nx), full-stack TypeScript.

- **Backend** : NestJS + TypeScript
- **Frontend** : React/Vite + Feature-Sliced Design + shadcn/ui
- **ORM** : Prisma (migrations) + Kysely (requêtes typées) · Postgres (champs custom JSONB + GIN)
- **Auth / multi-tenant** : Better Auth (org `org_id`, isolation row-level à l'ORM)
- **e-sign** : pattern Documenso (pdf-lib + PKCS#12 + PAdES)
- **IA** : `@anthropic-ai/sdk` (tool use strict, flywheel sur le gagné/perdu)
- **Self-host** : Docker Compose (api + web + postgres + redis + minio + caddy)

## Démarrage rapide

> Prérequis : Docker + Docker Compose.

```bash
git clone https://github.com/assinscreedFC/kessel.git
cd kessel
cp .env.example .env          # renseigner les secrets (DB, Better Auth, Anthropic…)
docker compose up
```

L'API répond sur `/api/health`, le dashboard est servi via Caddy.

### Développement local

> Prérequis : Node 20+, pnpm 10.

```bash
pnpm install
pnpm nx run-many -t build      # build tous les packages
pnpm nx run-many -t test       # suite de tests (Postgres réel via Testcontainers)
pnpm nx serve web              # dashboard en dev
```

## Architecture

Modular monolith à frontières strictes (`@nx/enforce-module-boundaries`) : un module de domaine n'en importe jamais un autre, l'orchestration cross-domaine vit dans `apps/api`.

```
packages/
  crm/         contacts, deals, pipeline
  proposals/   devis, templates, PDF, e-sign, paiement
  ai/          génération IA + flywheel
  auth/, db/, shared/
apps/
  api/         NestJS (orchestration, controllers)
  web/         dashboard React/Vite
  portal/      portail client (à venir, v1.1)
```

Multi-tenant : chaque modèle est scopé `org_id` (`forOrg(orgId)` via Prisma `$extends`, allow-list `SCOPED_MODELS`) ou scopé via son parent. Tests négatifs cross-org systématiques (anti faux-vert).

## Documents

- **[CAHIER-DES-CHARGES.md](CAHIER-DES-CHARGES.md)** — cadrage complet : vision, marché, slot OSS, architecture, fonctionnalités par phase, directions alternatives. Sourcé.
- **[docs/RESEARCH-APPENDIX.md](docs/RESEARCH-APPENDIX.md)** — rapports de recherche bruts.

## Licence

[AGPL-3.0](LICENSE). Le cœur est libre et self-hostable. Un dossier `/ee` propriétaire (à venir) couvrira les fonctionnalités entreprise (SSO, RBAC avancé, white-label). La clause réseau AGPL protège contre la copie-revente en SaaS sans contrepartie — structure business inspirée d'Odoo (community + Enterprise + intégrateur + marketplace futur).
