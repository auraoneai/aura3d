/**
 * GU47 WP-12 AO-P1: writes src/assets/luts/apex-bluehour.cube from src/art/lut.ts (the unit test fails when the committed
 * file and the generator disagree). Run from the repo root:
 *
 *   node_modules/.bin/tsx --tsconfig tsconfig.base.json apps/showcase-roadster-rush/tools/make-apex-lut.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apexBluehourCube } from "../src/art/lut";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../src/assets/luts/apex-bluehour.cube");
mkdirSync(dirname(out), { recursive: true });
const text = apexBluehourCube();
writeFileSync(out, text);
console.log(`wrote ${out} (${text.length} bytes)`);
