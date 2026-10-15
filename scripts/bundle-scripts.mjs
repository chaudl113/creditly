// Bundles the operational scripts (migrate, seed, demo reset) into
// self-contained ESM files so the standalone runtime image needs no
// node_modules beyond what Next.js traced for the server.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const entries = process.argv.slice(2);

await build({
  absWorkingDir: root,
  entryPoints: entries.length ? entries : ["scripts/migrate.mts", "scripts/seed.mts"],
  outdir: "dist/scripts",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  alias: { "@": "./src" },
  // Some CJS dependencies call require() at runtime; give the ESM bundle one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});
