#!/usr/bin/env node
/* Static source metrics per app: scene LOC, chars, words, tokens, distinct import modules and API symbols.
   Usage: node static-metrics.mjs <benchRoot> <out.json> [tokenizerModuleDir] */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [benchRoot, out, tokDir] = process.argv.slice(2);
const SCENES = ["baseline", "pbr-viewer", "forest", "skinned-character", "game-loop", "shader-water"];
let encode = null;
let tokenizer = "none (chars/4 estimate)";
try {
  const req = createRequire(join(tokDir ?? ".", "noop.js"));
  encode = req("gpt-tokenizer/encoding/o200k_base").encode;
  tokenizer = "gpt-tokenizer o200k_base (OpenAI BPE; a proxy: Claude's tokenizer is not public)";
} catch { /* fall back */ }

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => (m.includes("glsl") ? m : "")).split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).join("\n");
const loc = (src) => stripComments(src.replace(/\/\* glsl \*\//g, "")).split("\n").length;
const metrics = (file) => {
  const src = readFileSync(file, "utf8");
  const code = stripComments(src.replace(/\/\* glsl \*\//g, ""));
  const modules = new Set();
  const symbols = new Set();
  for (const m of code.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    const spec = m[2];
    if (spec.startsWith(".")) continue;
    modules.add(spec);
    const named = m[1].match(/\{([\s\S]*?)\}/);
    if (named) for (const n of named[1].split(",")) { const name = n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]; if (name) symbols.add(`${spec}:${name}`); }
    else if (!m[1].startsWith("type")) symbols.add(`${spec}:${m[1].trim()}`);
  }
  for (const m of code.matchAll(/\bTHREE\.([A-Za-z0-9_]+)/g)) symbols.add(`three:${m[1]}`);
  const pure = code;
  return {
    loc: loc(src),
    chars: pure.length,
    words: pure.split(/\s+/).filter(Boolean).length,
    tokens: encode ? encode(pure).length : Math.round(pure.length / 4),
    importModules: [...modules].sort(),
    distinctModules: modules.size,
    distinctSymbols: symbols.size
  };
};
const result = { tokenizer, loc: "non-blank, non-comment lines of the scene.ts file (shared neutral glue excluded)", apps: {} };
for (const scene of SCENES) for (const lib of ["three", "aura"]) {
  const dir = join(benchRoot, scene, lib);
  const entry = { scene: metrics(join(dir, "scene.ts")), extraFiles: {} };
  for (const extra of ["assets.generated.ts", "vite.config.ts"]) if (existsSync(join(dir, extra))) entry.extraFiles[extra] = metrics(join(dir, extra)).loc;
  if (lib === "aura") entry.extraFiles["shared/aura-vite.ts"] = metrics(join(benchRoot, "shared/aura-vite.ts")).loc;
  result.apps[`${scene}/${lib}`] = entry;
}
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`wrote ${out} (tokenizer: ${tokenizer})`);
