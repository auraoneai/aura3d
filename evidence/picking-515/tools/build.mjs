// Bundle the probe page: node evidence/picking-515/tools/build.mjs  (writes evidence/picking-515/dist/, not committed)
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
await build({
  entryPoints: [path.join(here, "../src/main.ts")],
  outfile: path.join(here, "../dist/main.js"),
  bundle: true, format: "esm", target: "es2022", platform: "browser", sourcemap: false, minify: false,
  tsconfig: path.join(root, "tsconfig.base.json"), logLevel: "warning",
  loader: { ".wgsl": "text", ".glsl": "text", ".vert": "text", ".frag": "text" }
});
console.log("built");
