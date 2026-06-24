import { context } from "esbuild";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { transform as swcTransform } from "@swc/core";

// Dev watch mode : même pipeline SWC que esbuild.mjs (decoratorMetadata) + restart auto via node:child_process.
// Usage : node apps/api/esbuild.dev.mjs
// Requiert : infra docker en cours (postgres:5433 redis minio)
// Env : .env.local (priorité) puis .env — shell > .env.local > .env

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function loadEnvFile(path) {
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {}
}

// .env.local chargé en premier → ses valeurs gagnent sur .env
loadEnvFile(resolve(repoRoot, ".env.local"));
loadEnvFile(resolve(repoRoot, ".env"));
const outDir = resolve(here, "dist");

const alias = {
  "@kessel/db": resolve(repoRoot, "packages/shared/db/src/index.ts"),
  "@kessel/auth": resolve(repoRoot, "packages/auth/src/index.ts"),
  "@kessel/shared": resolve(repoRoot, "packages/shared/src/index.ts"),
  "@kessel/crm": resolve(repoRoot, "packages/crm/src/index.ts"),
  "@kessel/proposals": resolve(repoRoot, "packages/proposals/src/index.ts"),
  "@kessel/ai": resolve(repoRoot, "packages/ai/src/index.ts"),
};

const swcDecoratorMetadataPlugin = {
  name: "swc-decorator-metadata",
  setup(buildApi) {
    buildApi.onLoad({ filter: /\.ts$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      const { code, map } = await swcTransform(source, {
        filename: args.path,
        sourceMaps: true,
        jsc: {
          target: "es2021",
          parser: { syntax: "typescript", decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          keepClassNames: true,
        },
      });
      const withMap = map
        ? `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString("base64")}`
        : code;
      return { contents: withMap, loader: "js" };
    });
  },
};

const banner = {
  js: [
    "import { createRequire as __cr } from 'node:module';",
    "import { fileURLToPath as __ftp } from 'node:url';",
    "import { dirname as __dn } from 'node:path';",
    "const require = __cr(import.meta.url);",
    "const __filename = __ftp(import.meta.url);",
    "const __dirname = __dn(__filename);",
  ].join("\n"),
};

let nodeProc = null;
let restarting = false;

function startNode() {
  if (nodeProc) {
    nodeProc.kill();
    nodeProc = null;
  }
  nodeProc = spawn("node", [resolve(outDir, "main.js")], {
    stdio: "inherit",
    env: process.env,
  });
  nodeProc.on("exit", (code) => {
    if (!restarting && code !== null) {
      console.error(`[dev] api exited (${code})`);
    }
  });
}

const ctx = await context({
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  alias,
  sourcemap: true,
  banner,
  plugins: [swcDecoratorMetadataPlugin],
  entryPoints: [resolve(here, "src/main.ts")],
  outfile: resolve(outDir, "main.js"),
});

await ctx.watch();

let debounce = null;
watch(resolve(outDir, "main.js"), () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    restarting = true;
    console.log("[dev] rebuilt → restart api");
    startNode();
    restarting = false;
  }, 100);
});

// Premier build terminé avant que watch déclenche : lancer manuellement au démarrage.
// esbuild watch déclenche un build initial — on attend 2s pour laisser le temps au premier build.
setTimeout(startNode, 2000);

process.on("SIGINT", () => {
  if (nodeProc) nodeProc.kill();
  ctx.dispose();
  process.exit(0);
});
