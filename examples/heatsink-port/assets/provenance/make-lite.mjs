/**
 * Builds the low-quality model set (`assets/models-lite/`) from `assets/models/` (audit row HP-12): every texture
 * resized to 512 px JPEG, the drone simplified from 55.7k to about 15k triangles, and the 29k-triangle pickup and plants halved. The source set is unchanged and
 * stays the high-quality set. Run from the repo root: `node examples/heatsink-port/assets/provenance/make-lite.mjs`.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "examples/heatsink-port/assets/models";
const OUT = "examples/heatsink-port/assets/models-lite";
const SIMPLIFY = { drone2: 0.27, "pickup-repair": 0.5, "plant-cap": 0.5, "plant-coral": 0.5 };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".glb")).sort()) {
  const name = file.replace(/\.glb$/, "");
  const doc = await io.read(join(SRC, file));
  const steps = [dedup(), weld()];
  if (SIMPLIFY[name]) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY[name], error: 0.002, lockBorder: true }));
  steps.push(textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [512, 512], quality: 85 }), prune());
  await doc.transform(...steps);
  await io.write(join(OUT, file), doc);
  console.log(name);
}
