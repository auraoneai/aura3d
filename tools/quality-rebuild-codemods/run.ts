/**
 * Runner for the C-39 `core-v2` codemod (PRD-01 §11 item 4).
 *
 *   pnpm exec tsx --tsconfig tsconfig.base.json tools/quality-rebuild-codemods/run.ts \
 *     transform <glob...> [--write] [--report <path>]
 *   pnpm exec tsx --tsconfig tsconfig.base.json tools/quality-rebuild-codemods/run.ts \
 *     evidence [--out docs/project/aura3d-quality-rebuild/evidence/prd01]
 *
 * `transform` prints per-file rows + the rewritten source with --write.
 * `evidence` regenerates `safe-basic-inventory.json` + `ambient-review.json`
 * from `git grep` so the inventory is reproducible (Q-14-1 input).
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transformCoreV2, collectSafeBasicInventory, collectAmbientReview } from "./core-v2";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function grepFiles(pattern: string, spec: readonly string[]): string[] {
  try {
    return execFileSync("git", ["grep", "-l", pattern, "--", ...spec], { cwd: REPO, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function expandGlob(glob: string): string[] {
  // git ls-files accepts pathspec globs directly.
  return execFileSync("git", ["ls-files", glob], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
}

const [mode, ...rest] = process.argv.slice(2);
const write = rest.includes("--write");
const args = rest.filter((a) => !a.startsWith("--"));
const reportPath = rest.includes("--report") ? rest[rest.indexOf("--report") + 1] : undefined;
const outDir = rest.includes("--out") ? rest[rest.indexOf("--out") + 1]! : "docs/project/aura3d-quality-rebuild/evidence/prd01";

if (mode === "transform") {
  const allRows: unknown[] = [];
  let changed = 0;
  for (const glob of args) {
    for (const file of expandGlob(glob)) {
      const source = readFileSync(resolve(REPO, file), "utf8");
      const { code, rows } = transformCoreV2(source, file);
      allRows.push(...rows);
      if (code !== source) {
        changed++;
        if (write) writeFileSync(resolve(REPO, file), code);
        console.log(`${file}: ${code === source ? "unchanged" : write ? "rewritten" : "would rewrite"}`);
      }
    }
  }
  console.log(`\ncore-v2: ${changed} file(s) ${write ? "rewritten" : "would change"}; ${allRows.length} report rows`);
  if (reportPath) {
    mkdirSync(dirname(resolve(REPO, reportPath)), { recursive: true });
    writeFileSync(resolve(REPO, reportPath), JSON.stringify(allRows, null, 2) + "\n");
    console.log(`rows → ${reportPath}`);
  }
} else if (mode === "evidence") {
  const SAFE_BASIC_SPECS = ["apps", "tools", "tests", "templates", "packages", ":!*.json", ":!*.lock"];
  const safeFiles = grepFiles("safe-basic", SAFE_BASIC_SPECS)
    .map((p) => ({ path: p, text: readFileSync(resolve(REPO, p), "utf8") }));
  const inventory = collectSafeBasicInventory(safeFiles);
  const byClass = inventory.reduce<Record<string, number>>((acc, e) => {
    acc[e.classification] = (acc[e.classification] ?? 0) + 1;
    return acc;
  }, {});

  const ambientPaths = Array.from(new Set([...grepFiles("lights.ambient", ["apps"]), ...grepFiles("lights.ambient", ["tools"])]));
  const ambientFiles = ambientPaths.map((p) => ({ path: p, text: readFileSync(resolve(REPO, p), "utf8") }));
  const ambient = collectAmbientReview(ambientFiles);

  const outAbs = resolve(REPO, outDir);
  mkdirSync(outAbs, { recursive: true });
  const inventoryDoc = {
    generatedBy: "tools/quality-rebuild-codemods/run.ts evidence",
    auditBasis: "git grep -l \"safe-basic\" over apps tools tests templates packages (json/lock excluded)",
    files: safeFiles.length,
    entries: inventory.length,
    byClassification: byClass,
    rows: inventory
  };
  const ambientDoc = {
    generatedBy: "tools/quality-rebuild-codemods/run.ts evidence",
    note: "ambient review list for lane 14 retune — effective irradiance changes intensity→intensity/π under physical lighting",
    entries: ambient.length,
    rows: ambient
  };
  writeFileSync(resolve(outAbs, "safe-basic-inventory.json"), JSON.stringify(inventoryDoc, null, 2) + "\n");
  writeFileSync(resolve(outAbs, "ambient-review.json"), JSON.stringify(ambientDoc, null, 2) + "\n");
  console.log(`safe-basic inventory: ${inventory.length} entries in ${safeFiles.length} files → ${outDir}/safe-basic-inventory.json`);
  console.log(`ambient review: ${ambient.length} entries → ${outDir}/ambient-review.json`);
} else {
  console.log("usage: run.ts transform <glob...> [--write] [--report path]");
  console.log("       run.ts evidence [--out dir]");
  process.exitCode = 1;
}
