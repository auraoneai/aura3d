/**
 * C-39 lane command registrations — PRD 15.
 *
 * Registers the `aura3d codemod <name> <glob> [--write|--dry-run|--report]`
 * dispatcher and this lane's codemods (`renderer-imports`, T2.11).
 */

import { globSync } from "node:fs";
import { readFileSync, writeFileSync } from "node:fs";
import { registerCliCommand, registerCodemod, codemodFor } from "../../contracts/commands.js";
import { createRendererImportsCodemod } from "../../codemods/renderer-imports.js";
import { createRendererModeCodemod } from "../../codemods/renderer-mode.js";
import { createLeanImportsCodemod } from "../../codemods/lean-imports.js";
import { createDevtoolsImportsCodemod, createEngineEntryImportsCodemod } from "../../codemods/engine-entry-imports.js";

registerCodemod(createRendererImportsCodemod());
registerCodemod(createRendererModeCodemod());
registerCodemod(createLeanImportsCodemod());
registerCodemod(createDevtoolsImportsCodemod());
registerCodemod(createEngineEntryImportsCodemod());

registerCliCommand({
  name: "codemod",
  owner: "prd15",
  summary: "Run a registered codemod over a file glob (renderer-imports, …).",
  usage: "aura3d codemod <name> <glob> [--write] [--dry-run] [--report]",
  async run(argv, io) {
    const name = argv[0];
    const glob = argv[1];
    if (!name || !glob) {
      io.stderr("usage: aura3d codemod <name> <glob> [--write] [--dry-run] [--report]");
      return 2;
    }
    const mod = codemodFor(name);
    if (!mod) {
      io.stderr(`unknown codemod: ${name}`);
      return 2;
    }
    const write = argv.includes("--write");
    const report = argv.includes("--report");
    const files = globSync(glob, { cwd: io.cwd, exclude: (p) => p.includes("node_modules") }).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".html"));
    const allRows: unknown[] = [];
    let changed = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const { code, rows } = mod.transform(source, file);
      allRows.push(...rows);
      if (code !== source) {
        changed++;
        if (write) writeFileSync(file, code);
      }
    }
    io.stdout(JSON.stringify({ codemod: name, files: files.length, changed, written: write ? changed : 0, rows: report ? allRows : allRows.filter((r) => (r as { mapping?: string }).mapping !== "exact") }, null, 2));
    return 0;
  }
});
