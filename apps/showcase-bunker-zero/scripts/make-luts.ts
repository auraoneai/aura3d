// BZ-18: writes public/aura-assets/luts/*.cube from src/art/lut.ts and prints each sha256.
// Run: node_modules/.bin/tsx --tsconfig tsconfig.base.json apps/showcase-bunker-zero/scripts/make-luts.ts (repo root).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BZ_LUT_SPECS, cubeText } from "../src/art/lut";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/aura-assets/luts");
mkdirSync(out, { recursive: true });
for (const spec of BZ_LUT_SPECS) {
  const text = cubeText(spec);
  writeFileSync(path.join(out, spec.file), text);
  console.log(`  "${spec.file}": "${createHash("sha256").update(text).digest("hex")}",`);
}
