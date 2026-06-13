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
          // d'intégration des packages (Plan 01 SUMMARY). Pas une lib de domaine ; autorisé explicitement.
          allow: ["../../../../tests/setup/testcontainers"],
          depConstraints: [
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
];
