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
          allow: [],
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
