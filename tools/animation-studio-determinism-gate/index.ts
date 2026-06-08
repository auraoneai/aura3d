/**
 * animation-studio-determinism-gate — pins document-hash → render-hash and fails if an
 * UNCHANGED document renders to a DIFFERENT frame. Renders a short window and
 * hashes the frame.
 *
 *   --write   pin (or update) the expected render-hash for this document
 *   (default)  verify the current render against the pin (exit 1 on mismatch)
 *
 * Usage: pnpm exec tsx --tsconfig tsconfig.base.json tools/animation-studio-determinism-gate/index.ts <document.json> [--write]
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..");
const TEMPLATE = resolve(REPO, "packages/create-aura3d/templates/animation-studio");
const PIN_PATH = resolve(REPO, "tests/reports/animation-determinism-pins.json");

function sha(buf: Buffer): string {
  return `sha256-${createHash("sha256").update(buf).digest("hex")}`;
}

function main(): void {
  const args = process.argv.slice(2);
  const docPath = args.find((a) => !a.startsWith("--"));
  const write = args.includes("--write");
  if (!docPath) {
    console.error("usage: animation-studio-determinism-gate <document.json> [--write]");
    process.exitCode = 2;
    return;
  }
  const docHash = sha(readFileSync(resolve(docPath)));

  const r = spawnSync(
    "pnpm",
    ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "packages/create-aura3d/templates/animation-studio/scripts/render-live.ts"],
    { cwd: REPO, stdio: "ignore", env: { ...process.env, AURA_DOCUMENT: resolve(docPath), AURA_OUTPUT_DIR: "dist/episodes/determinism-gate", AURA_PREVIEW_RANGE: "4-6" } }
  );
  if (r.status !== 0) { console.error("render failed"); process.exitCode = 1; return; }
  const frameHash = sha(readFileSync(resolve(TEMPLATE, "dist/episodes/determinism-gate/frames/first.png")));

  const pins: Record<string, string> = existsSync(PIN_PATH) ? JSON.parse(readFileSync(PIN_PATH, "utf8")) : {};
  if (write) {
    pins[docHash] = frameHash;
    mkdirSync(dirname(PIN_PATH), { recursive: true });
    writeFileSync(PIN_PATH, `${JSON.stringify(pins, null, 2)}\n`);
    console.log(`pinned ${docHash.slice(0, 22)}… → ${frameHash.slice(0, 22)}…`);
    return;
  }
  const expected = pins[docHash];
  if (!expected) {
    console.log("no pin for this document; run with --write to pin it.");
    return;
  }
  if (expected === frameHash) {
    console.log("DETERMINISM GATE PASS — render-hash matches the pin for this document.");
  } else {
    console.error(`DETERMINISM GATE FAIL — same document rendered a DIFFERENT frame.\n  expected ${expected.slice(0, 22)}…\n  got      ${frameHash.slice(0, 22)}…`);
    process.exitCode = 1;
  }
}

main();
