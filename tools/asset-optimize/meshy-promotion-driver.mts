// §6.5 — run the sliver-ratio pre-check on every Meshy candidate's repo bytes
// and emit evidence/prd05/assets/meshy-promotion.json promote/reject decisions.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { createDecoderModule } from "draco3d";
import { MeshoptDecoder } from "meshoptimizer";
import { sliverRatio, hasOpenShells, SLIVER_RATIO_MAX, SLIVER_MIN_ANGLE_DEG } from "./steps/remesh.js";

const repoRoot = process.cwd();
const manifest = JSON.parse(readFileSync(join(repoRoot, "aura.assets.json"), "utf8"));
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "draco3d.decoder": await createDecoderModule(), "meshopt.decoder": MeshoptDecoder });

const ROLE_PROFILE = {
  character: "npc-character", enemy: "npc-character", hero: "hero-character",
  vehicle: "traffic-vehicle", prop: "prop-large", "set-dressing": "prop-small",
  world: "world-chunk", backdrop: "backdrop", weapon: "weapon", product: "product",
};

const decisions = [];
for (const entry of manifest.assets) {
  const prov = JSON.stringify(entry.provenance ?? {}).toLowerCase();
  if (!prov.includes("meshy") && entry.source !== "meshy") continue;
  const url = entry.url ?? entry.file ?? "";
  const rel = url.startsWith("/aura-assets/") ? `public${url}` : url.replace(/^\//, "");
  const abs = join(repoRoot, rel);
  const row = {
    id: entry.id,
    url,
    role: entry.role ?? "prop",
    optimizeProfile: ROLE_PROFILE[entry.role] ?? "prop-large",
    decision: "reject-release",
    triangles: null,
    sliverRatio: null,
    openShells: null,
    notes: null,
    blockers: [],
  };
  if (!existsSync(abs)) {
    row.blockers.push(`bytes missing at ${rel}`);
  } else {
    try {
      const doc = await io.read(abs);
      const root = doc.getRoot();
      let tris = 0;
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          tris += (prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0) / 3;
        }
      }
      const worst = sliverRatio(doc, SLIVER_MIN_ANGLE_DEG);
      const open = hasOpenShells(doc);
      row.sliverRatio = Number(worst.toFixed(4));
      row.openShells = open;
      row.triangles = Math.round(tris);
      // §6.5: release requires the --from-generated chain (sliver-check+remesh+bake
      // in derived.steps) then G1–G11 + look-dev. None of that exists yet, and it
      // can only run on the Blender+toktx remote worker — hold, don't promote.
      row.decision = "hold-prestage";
      if (worst > SLIVER_RATIO_MAX) row.blockers.push(`sliver ratio ${(worst * 100).toFixed(1)}% > ${SLIVER_RATIO_MAX * 100}% — Quadriflow remesh mandatory before UV/bake`);
      if (open) row.notes = "open shells detected — keep doubleSided cleared per §6.5";
      row.blockers.push("derived.steps missing sliver-check/remesh/bake (needs remote worker: Blender + toktx)");
      row.blockers.push("no G1–G11 admission record on the derived output");
      row.blockers.push("no approved look-dev record on the derived output");
    } catch (err) {
      row.blockers.push(`GLB unreadable: ${String(err).slice(0, 120)}`);
    }
  }
  decisions.push(row);
}

const out = {
  generatedAt: new Date().toISOString(),
  rule: "§6.5 — Meshy imports reach release only via assets optimize --from-generated (sliver-check+remesh+bake) then G1–G11 + approved look-dev; sliver ratio >15% tris with min angle <10° fails the pre-check.",
  sliverThreshold: SLIVER_RATIO_MAX,
  sliverMinAngleDeg: SLIVER_MIN_ANGLE_DEG,
  decisions,
};
writeFileSync(join(repoRoot, "docs/project/aura3d-quality-rebuild/evidence/prd05/assets/meshy-promotion.json"), JSON.stringify(out, null, 2) + "\n");
console.log(decisions.map((d) => `${d.id}: ${d.decision} sliver=${d.sliverRatio}`).join("\n"));
