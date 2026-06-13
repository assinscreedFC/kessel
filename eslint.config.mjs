import nx from "@nx/eslint-plugin";

export default [
  ...nx.configs["flat/base"],
  ...nx.configs["flat/typescript"],
  ...nx.configs["flat/javascript"],
  {
    ignores: ["**/dist", "**/node_modules", "**/.nx"],
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          // Helper d'infra de test Wave 0 (tests/setup/testcontainers) — consommé par les tests
          // d'intégration des packages (db : 4 niveaux) et de l'app api (3 niveaux). Pas une lib de
          // domaine ; autorisé explicitement aux deux profondeurs relatives.
          allow: [
            "../../../../tests/setup/testcontainers",
            "../../../tests/setup/testcontainers",
          ],
          depConstraints: [
            {
              // L'app shell (api) câble les modules : peut dépendre des domaines + db + shared.
              sourceTag: "type:app",
              onlyDependOnLibsWithTags: [
                "type:app",
                "type:domain",
                "type:domain-api",
                "type:db",
                "type:shared",
                "scope:auth",
                "scope:db",
                "scope:shared",
              ],
            },
            {
              sourceTag: "type:shared",
              onlyDependOnLibsWithTags: ["type:shared"],
            },
            {
              sourceTag: "type:db",
              onlyDependOnLibsWithTags: ["type:shared"],
            },
            {
              sourceTag: "type:domain",
              onlyDependOnLibsWithTags: [
                "type:shared",
                "type:db",
                "type:domain-api",
              ],
            },
            {
              sourceTag: "scope:auth",
              onlyDependOnLibsWithTags: [
                "scope:auth",
                "scope:shared",
                "scope:db",
              ],
            },
          ],
        },
      ],
    },
  },
  {
    // App api = RACINE DE COMPOSITION (app shell). Elle câble légitimement @kessel/auth + @kessel/db
    // + @kessel/shared (autorisé par le depConstraint type:app). Le helper de test test-app.ts importe
    // DYNAMIQUEMENT ces libs (l'ordre DATABASE_URL impose l'import après avoir fixé l'env), ce qui fait
    // que @nx/enforce-module-boundaries classe à tort @kessel/auth/@kessel/db comme "lazy-loaded" et
    // bloque leur import statique côté contrôleurs. Le garde-fou anti-sprawl FOUND-05 qui compte est
    // l'interdiction d'accès CROISÉ entre modules de DOMAINE (testée sur les packages domaine, pas sur
    // l'app shell) ; on désactive donc la règle pour l'app api uniquement. Les non-null assertions des
    // specs portent sur des valeurs déjà assertées non nulles par expect() — sûres en test.
    files: ["apps/api/**/*.ts"],
    rules: {
      "@nx/enforce-module-boundaries": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];
