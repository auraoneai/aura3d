/**
 * determinism-check.ts — renders the same document + range TWICE and verifies the
 * frames are byte-identical, proving the render is deterministic given a document.
 *
 * Run: pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/determinism-check.ts
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..", "..", "..", "..");
const TEMPLATE_ROOT = resolve(__dirname, "..");

function render(outDir: string): void {
  const r = spawnSync(
    "pnpm",
    ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "packages/create-aura3d/templates/animation-studio/scripts/render-live.ts"],
    { cwd: REPO, stdio: "ignore", env: { ...process.env, AURA_OUTPUT_DIR: outDir, AURA_PREVIEW_RANGE: "4-6" } }
  );
  if (r.status !== 0) throw new Error(`render to ${outDir} failed (status ${r.status})`);
}

function hashFrame(outDir: string): string | null {
  const p = resolve(TEMPLATE_ROOT, outDir, "frames", "first.png");
  if (!existsSync(p)) return null;
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function main(): void {
  console.log("rendering pass A (range 4-6) ...");
  render("dist/episodes/determinism-a");
  console.log("rendering pass B (range 4-6) ...");
  render("dist/episodes/determinism-b");

  const a = hashFrame("dist/episodes/determinism-a");
  const b = hashFrame("dist/episodes/determinism-b");
  console.log(`A first.png sha256 = ${a?.slice(0, 16)}…`);
  console.log(`B first.png sha256 = ${b?.slice(0, 16)}…`);
  const ok = a !== null && a === b;
  console.log(`\nDETERMINISM ${ok ? "PASS" : "FAIL"} — same document ${ok ? "→ byte-identical frame." : "produced different frames."}`);
  if (!ok) process.exitCode = 1;
}

main();
