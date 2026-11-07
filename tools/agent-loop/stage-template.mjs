#!/usr/bin/env node
// Stages a shipped template as a monorepo-buildable project so `aura3d verify` can run on it without the published packages:
//   node tools/agent-loop/stage-template.mjs <template> [--out tests/fixtures/agent-loop-seeded/_staged-<template>]
// Copies index.html, src/, public/ and aura.assets.json, and adds the same shared vite.config.ts / tsconfig.json the seeded scenes use
// (aliases to monorepo source). The template's own package.json scripts are replaced by `vite build` / `tsc --noEmit`; verify runs
// the typecheck as its own step. The staged folder is git-ignored; nothing in the template is modified.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [template, ...rest] = process.argv.slice(2);
if (!template) { console.error("usage: stage-template.mjs <template> [--out dir]"); process.exit(2); }
const outIndex = rest.indexOf("--out");
const out = resolve(repoRoot, outIndex >= 0 ? rest[outIndex + 1] : `tests/fixtures/agent-loop-seeded/_staged-${template}`);
const from = join(repoRoot, "templates", template);
if (!existsSync(from)) { console.error(`no template ${template}`); process.exit(2); }
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const entry of ["index.html", "src", "public", "aura.assets.json"]) if (existsSync(join(from, entry))) cpSync(join(from, entry), join(out, entry), { recursive: true });
const shared = join(repoRoot, "tests/fixtures/agent-loop-seeded/_shared");
writeFileSync(join(out, "vite.config.ts"), 'export { default } from "../_shared/vite.config";\n');
cpSync(join(shared, "tsconfig.json"), join(out, "tsconfig.json"));
const original = JSON.parse(readFileSync(join(from, "package.json"), "utf8"));
writeFileSync(join(out, "package.json"), `${JSON.stringify({ name: `staged-${original.name}`, private: true, type: "module", scripts: { build: "vite build", typecheck: "tsc --noEmit" } }, null, 2)}\n`);
console.log(out);
