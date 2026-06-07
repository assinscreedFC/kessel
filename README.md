# Kessel

> Nom provisoire. **OS open source pour agences et freelances.** Self hostable, IA native, EU souverain.

La boucle client complete, reliée: prospect, brief, **proposition IA**, projet, temps, **facture Factur-X**, portail client. Fin de la fragmentation 6-8 outils. Les incumbents (HoneyBook, Bonsai, Productive) sont US-first, fermés, et ne gerent pas la conformité européenne. Les OSS existants sont mono-module (Plane = projet, Twenty = CRM) ou legacy (Dolibarr).

## Documents

- **[CAHIER-DES-CHARGES.md](CAHIER-DES-CHARGES.md)** — cadrage complet (vision, marché, slot OSS, archi modular monolith, liste exhaustive des fonctionnalités par phase, directions alternatives, reco). Sourcé.
- **[docs/RESEARCH-APPENDIX.md](docs/RESEARCH-APPENDIX.md)** — rapports de recherche bruts.

## Lien avec Zolv (#3)

Kessel consomme l'API de **Zolv** (agent de support autonome OSS, repo séparé) via MCP, comme cerveau IA pour le support et les relances. Deux produits séparés, interopérables.

## Statut

Cadrage (pré-implémentation). Aucun code. Décisions ouvertes en section 18 (dont NestJS vs FastAPI).

## Stack pressenti

Modular monolith, NestJS + TypeScript (ou FastAPI, a trancher) + Postgres (JSONB) + React/Vite (Feature-Sliced Design + shadcn/ui) + Better Auth + Documenso (e-sign) + factur-x. Self host Docker Compose. Licence pressentie: AGPL-3.0 + /ee.
