#!/usr/bin/env node
// node dist/bundle/cli.js [repoRoot]   writes packages/aura3d-mcp/data/docs-bundle.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocsBundle } from "./build.js";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..", "..");
const repoRoot = resolve(process.argv[2] ?? join(packageRoot, "..", ".."));
const bundle = buildDocsBundle(repoRoot);
const out = join(packageRoot, "data", "docs-bundle.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(bundle)}\n`);
console.log(`aura3d-mcp: wrote ${out} (${bundle.files.length} files, docs ${bundle.docsVersion})`);
