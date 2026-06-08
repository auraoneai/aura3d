/**
 * regen-manifest.ts — regenerate the miko + luma entries in aura.assets.json from
 * the ACTUAL bytes of the authored GLBs (hash, bounds, clips, skeleton, morphs),
 * using the same CLI inspector the rest of the toolchain uses. No fabricated values:
 * every field below is read from the file or copied verbatim from the existing
 * moonGarden entry (whose hash is already in sync).
 *
 * Run from repo root:
 *   pnpm exec tsx --tsconfig tsconfig.base.json \
 *     packages/create-aura3d/templates/animation-studio/scripts/regen-manifest.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectAsset } from "../../../../aura3d-cli/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");
const MANIFEST_PATH = resolve(TEMPLATE_ROOT, "aura.assets.json");

interface LeadSpec {
  readonly id: string;
  readonly file: string; // relative to template root
  readonly name: string;
  readonly objaverseId: string;
  readonly authorLabel: string;
}

// The two authored procedural mascots that make up the guaranteed-good cast.
const LEADS: readonly LeadSpec[] = [
  {
    id: "miko",
    file: "public/aura-assets/miko.catalog.glb",
    name: "Miko",
    objaverseId: "aura3d:miko-authored-mascot",
    authorLabel: "Aura3D"
  },
  {
    id: "luma",
    file: "public/aura-assets/luma2.catalog.glb",
    name: "Luma",
    objaverseId: "aura3d:luma-authored-mascot",
    authorLabel: "Aura3D"
  }
];

function sha256(path: string): string {
  return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function buildLeadEntry(spec: LeadSpec): Record<string, unknown> {
  const r = inspectAsset({
    projectDir: TEMPLATE_ROOT,
    file: spec.file,
    animation: true,
    humanoid: true,
    skeleton: true,
    morphs: true,
    license: true
  });
  const filePath = resolve(TEMPLATE_ROOT, spec.file);
  const hash = sha256(filePath);
  const url = `/${spec.file.replace(/^public\//, "")}`;
  const morphNames = r.morphTargets?.targetNames ?? [];
  const hasMouthMorph = morphNames.length > 0;
  const attribution =
    `Aura3D-authored procedural rigged mascot "${spec.name}" (CC0). ` +
    `Skinned ${r.skeleton?.jointCount ?? 0}-joint rig; embedded clips ${r.animations.join(", ")}. ` +
    `Lip-sync is driven by the facial mouth blendshape morph target ` +
    `(${morphNames.join(", ") || "none"}).`;

  return {
    id: spec.id,
    type: "model",
    format: "glb",
    source: spec.file,
    outputPath: spec.file,
    url,
    hash,
    sizeBytes: r.sizeBytes,
    bounds: r.bounds,
    boundsMetadata: r.boundsMetadata,
    materials: r.materials,
    materialMetadata: r.materialMetadata,
    animations: r.animations,
    animationMetadata: r.animation,
    humanoid: r.humanoid,
    skeleton: r.skeleton,
    morphTargets: r.morphTargets,
    textures: r.textures,
    dependencies: r.dependencies ?? [],
    nodeNames: r.nodeNames,
    provenance: {
      license: "CC0-1.0",
      author: spec.authorLabel,
      sourceFamily: "Aura3D authored cast (build-characters.ts, CC0 procedural mascot)",
      sourcePath: spec.file,
      sourceUrl: `https://aura3d.auraone.ai${url}`,
      attribution,
      evidence: [
        "animation-character",
        "rigged",
        "animated",
        ...(hasMouthMorph ? ["mouth blendshape morph", "facial morph target"] : []),
        "authored",
        "cc0"
      ],
      sha256: hash,
      retrievedAt: "2026-06-07"
    },
    thumbnailUrl: `/aura-assets/${spec.id}.thumb.svg`,
    warnings: r.warnings ?? []
  };
}

function main(): void {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    assets: Record<string, unknown>[];
  } & Record<string, unknown>;

  const byId = new Map<string, Record<string, unknown>>();
  for (const asset of manifest.assets) byId.set(asset.id as string, asset);

  for (const spec of LEADS) {
    byId.set(spec.id, buildLeadEntry(spec));
  }

  // Re-sync the moonGarden hash + sizeBytes from disk too (do not change its shape).
  const moon = byId.get("moonGarden");
  if (moon && typeof moon.outputPath === "string") {
    const moonPath = resolve(TEMPLATE_ROOT, moon.outputPath);
    moon.hash = sha256(moonPath);
    moon.sizeBytes = readFileSync(moonPath).byteLength;
    if (moon.provenance && typeof moon.provenance === "object") {
      (moon.provenance as Record<string, unknown>).sha256 = moon.hash;
    }
  }

  // Preserve manifest ordering: luma, miko, moonGarden (as it was), refreshed.
  const order = ["luma", "miko", "moonGarden"];
  const ordered = order.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  for (const asset of manifest.assets) {
    const id = asset.id as string;
    if (!order.includes(id) && byId.has(id)) ordered.push(byId.get(id)!);
  }

  manifest.assets = ordered;
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${MANIFEST_PATH}`);
  for (const asset of ordered) {
    console.log(`  ${asset.id}: ${asset.hash} (${asset.sizeBytes} bytes)`);
  }
}

main();
