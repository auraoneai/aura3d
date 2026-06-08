/**
 * preview-server.ts — a watch-and-preview server for the studio loop: it watches a
 * document JSON and renders a short PREVIEW RANGE to PNGs on every edit, so the agent/creator
 * sees changes quickly instead of re-rendering the whole 60s.
 *
 * HONEST: this renders the range per change (windowed, fast-ish via the `#1` readback). The
 * further optimization — keeping the browser/page WARM across edits (no per-render startup) +
 * parallel pages — is the productionization noted in the design doc.
 *
 * Run: AURA_DOCUMENT=<doc.json> AURA_PREVIEW_RANGE=0-6 \
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/preview-server.ts
 */

import { spawnSync } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..", "..", "..", "..");
const DOC = process.env.AURA_DOCUMENT
  ? resolve(process.env.AURA_DOCUMENT)
  : resolve(__dirname, "..", "dist", "generated", "studio-edited.document.json");
const RANGE = process.env.AURA_PREVIEW_RANGE ?? "0-6";
const OUT = process.env.AURA_OUTPUT_DIR ?? "dist/episodes/studio-preview";

function renderPreview(): void {
  const t = Date.now();
  const r = spawnSync(
    "pnpm",
    ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "packages/create-aura3d/templates/animation-studio/scripts/render-live.ts"],
    { cwd: REPO, stdio: "ignore", env: { ...process.env, AURA_DOCUMENT: DOC, AURA_OUTPUT_DIR: OUT, AURA_PREVIEW_RANGE: RANGE } }
  );
  console.log(`preview ${r.status === 0 ? "ok" : "FAILED"} (range ${RANGE}) in ${((Date.now() - t) / 1000).toFixed(1)}s → ${OUT}`);
}

function main(): void {
  if (!existsSync(DOC)) {
    console.error(`document not found: ${DOC}\nGenerate one first (studio.ts / generate-scene.ts).`);
    process.exitCode = 1;
    return;
  }
  console.log(`preview-server watching ${DOC} (range ${RANGE}) ...`);
  renderPreview();
  let pending: NodeJS.Timeout | null = null;
  watch(DOC, () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(renderPreview, 250); // debounce rapid writes
  });
}

main();
