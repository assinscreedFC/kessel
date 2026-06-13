import { describe, it } from "vitest";

// Wave 0 — RED stub. Le module i18n n'existe pas encore → DOIT échouer.
// L'implémentation est livrée en Wave 1, plan 05.
//
// Le test réel (intégration I18nModule boot) est marqué todo car il dépend de
// apps/api/src/i18n/i18n.module.ts créé en plan 05.
// La ligne d'import ci-dessous provoque un RED déterministe (fichier absent).

// eslint-disable-next-line @typescript-eslint/no-require-imports
import "./i18n/i18n.module";

describe("i18n boot (plan 05)", () => {
  it.todo(
    "I18nModule monte sans erreur, t('inexistante.cle') retourne 'inexistante.cle' (fallback = clé) — implémenté plan 05",
  );
});
