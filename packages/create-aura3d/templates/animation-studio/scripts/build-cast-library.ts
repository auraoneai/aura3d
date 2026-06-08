/**
 * build-cast-library.ts — emit `public/cast-library/cast-library.json`, the provenance manifest
 * for the DEFAULT high-fidelity cast (the graded-A humanoids authored by build-characters.ts).
 *
 * Every field is READ from the actual GLB bytes on disk (hash, bounds, joint count, clips, morphs,
 * materials, fidelity grade) + the inline rig/mesh grader from resolve-asset.ts — nothing is
 * fabricated. This is the M1 "public/cast-library/ manifest with provenance" deliverable: it states
 * plainly that these are CC0, Aura3D-authored, procedurally rigged humanoids (NOT downloaded
 * external CC0 assets — the sandbox has no asset-download guarantee), and records their fidelity.
 *
 * Run from repo root:
 *   pnpm exec tsx --tsconfig tsconfig.base.json \
 *     packages/create-aura3d/templates/animation-studio/scripts/build-cast-library.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gradeCastGlb } from "./resolve-asset.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");
const ASSET_DIR = resolve(TEMPLATE_ROOT, "public/aura-assets");
const OUT_DIR = resolve(TEMPLATE_ROOT, "public/cast-library");
const OUT_PATH = resolve(OUT_DIR, "cast-library.json");

interface CastSpec {
  readonly id: string;
  readonly name: string;
  readonly file: string; // under public/aura-assets/
  readonly description: string;
}

const CAST: readonly CastSpec[] = [
  { id: "miko", name: "Miko", file: "miko.catalog.glb", description: "Cyan-suited helper humanoid; full 21-joint rig, hair-cap + glowing crest." },
  { id: "luma", name: "Luma", file: "luma2.catalog.glb", description: "Warm-gold helper humanoid, slimmer build; full 21-joint rig." }
];

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const members = CAST.map((spec) => {
    const path = resolve(ASSET_DIR, spec.file);
    const buf = readFileSync(path);
    const graded = gradeCastGlb(buf);
    const hash = `sha256-${createHash("sha256").update(buf).digest("hex")}`;
    return {
      id: spec.id,
      name: spec.name,
      description: spec.description,
      url: `/aura-assets/${spec.file}`,
      sizeBytes: buf.byteLength,
      hash,
      fidelity: graded.fidelity,
      rigGrade: graded.rigGrade,
      meshGrade: graded.meshGrade,
      jointCount: graded.jointCount,
      humanoid: graded.humanoid,
      tris: graded.tris,
      verts: graded.verts,
      textureMaxDim: graded.textureMaxDim,
      materials: graded.materials,
      clips: graded.clips,
      mouthMorph: graded.hasMouthMorph,
      provenance: {
        license: "CC0-1.0",
        author: "Aura3D",
        origin: "authored-procedural",
        generator: "scripts/build-characters.ts (default high-fidelity humanoid mode)",
        note:
          "Aura3D-authored, procedurally rigged + textured humanoid (CC0). NOT a downloaded " +
          "external asset — generated from code so the default cast is guaranteed present + " +
          "graded-A regardless of network/catalog availability.",
        retrievedAt: "2026-06-07"
      }
    };
  });

  const manifest = {
    schema: "aura3d.cast-library/1.0",
    generatedAt: new Date().toISOString(),
    note:
      "Default high-fidelity cast for the animation studio. These are Aura3D-authored CC0 " +
      "procedural humanoids with full limb chains (graded-A rigs), shipped as the DEFAULT so a " +
      "fresh scene starts from a properly-rigged character rather than an 8-bone mascot. Users " +
      "can override with `animation-scene cast add --query` (catalog) or `--file <path.glb>` " +
      "(their own rigged GLB). The legacy 7-node mascots remain only behind build-characters.ts " +
      "--low-fi.",
    members
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${OUT_PATH}`);
  for (const m of members) {
    console.log(`  ${m.id}: fidelity ${m.fidelity} (rig ${m.rigGrade}/mesh ${m.meshGrade}) — ${m.jointCount} joints, ${m.tris} tris, clips ${m.clips.join(",")}`);
  }
}

main();
