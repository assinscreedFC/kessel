import { I18nModule, AcceptLanguageResolver } from "nestjs-i18n";
import { join } from "node:path";

// Infra i18n back (Phase 1) — catalogues vides FR/EN. Fallback "fr" : une clé absente retourne la clé
// inchangée (comportement i18n par défaut). AcceptLanguageResolver lit le header Accept-Language
// (localisation des erreurs API = Phase 7, I18N-03). watch:false (pas de hot reload runtime serveur).
// Path résolu depuis __dirname : en build esbuild, les JSON i18n sont copiés à côté du bundle.
export const i18nModuleConfig = I18nModule.forRoot({
  fallbackLanguage: "fr",
  loaderOptions: { path: join(__dirname, "/"), watch: false },
  resolvers: [AcceptLanguageResolver],
});
