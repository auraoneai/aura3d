import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const definitions = [
  {
    id: "gravityPostMailPod",
    file: "public/aura-assets/gravityPostMailPod.bddb3981.glb",
    role: "vehicle",
    author: "박용진",
    retrievedAt: "2026-08-28T20:40:04.432Z",
    sourcePage: "https://sketchfab.com/3d-models/781e531c00d94c9e89dcc8ad9b967d87",
    downloadUrl: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-087/781e531c00d94c9e89dcc8ad9b967d87.glb",
    suitability: "Typed textured primary courier vehicle with a readable ship nose-to-engine silhouette, eight retained textures, current manifest bounds, durable CC-BY provenance, and probe-bound +Z forward orientation used by route-authored velocity-aligned yaw; no physical spacecraft claim."
  },
  {
    id: "gravityPostDockBeacon",
    file: "public/aura-assets/gravityPostDockBeacon.171e21cb.glb",
    role: "prop",
    author: "DjalalxJay",
    retrievedAt: "2026-08-22T00:06:43.030Z",
    sourcePage: "https://sketchfab.com/3d-models/f23b484cda664f1cb91b4f62ea5ef8bf",
    downloadUrl: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-054/f23b484cda664f1cb91b4f62ea5ef8bf",
    suitability: "Typed textured dock landmark with readable body and solar-panel silhouette, current manifest bounds, durable CC-BY provenance, and route-authored static presentation; no physical satellite behavior claim."
  },
  {
    id: "gravityPostFreightDistrict",
    file: "apps/showcase-gravity-post/assets/candidates/gravityPostFreightDistrict.candidate.glb",
    role: "world",
    author: "Aura3D synthesis",
    retrievedAt: "2026-08-31T23:40:00.000Z",
    sourcePage: "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-gravity-post/scripts/build-freight-district.py",
    downloadUrl: "https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-gravity-post/assets/candidates/gravityPostFreightDistrict.candidate.glb",
    license: "CC0-1.0",
    licenseName: "CC0 1.0 Universal",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceFamily: "aura3d-original",
    attribution: "Aura3D synthesis — original CC0 Gravity Post freight district",
    provenanceEvidence: "Generated in Blender 5.2.1 from the committed route-local Python source. Nine merged material groups retain a connected chamfered deck, rails, loading hangar, gantry crane, stacked cargo, tank farm, terminal architecture, outer loading towers, and elevated dispatch bridges; nine packed deterministic panel textures are embedded in the GLB; the asset owns no collision or gameplay.",
    quality: "release",
    renderedProbeJson: "tests/reports/showcase-release-asset-probes/gravityPostFreightDistrict.json",
    orientationJson: "tests/reports/showcase-release-asset-probes/gravityPostFreightDistrict.orientation.json",
    suitability: "Original CC0 +Y-up, +X-forward non-colliding freight world authored at a gameplay-scale footprint and fitted to the real Rust Exchange to Gale Terminal vector. Its nine readable color-separated PBR groups combine embedded deterministic micro-panel paint textures with bevelled geometry: connected chamfered deck, service rails, dispatch building, gabled loading hangar, articulated crane, stacked cargo modules, tank farm, outer loading towers, elevated dispatch bridges, backline skyline, and asymmetric terminal/dock destination. Route-local pod motion, wells, dock sensors, collision, scoring, and camera remain authoritative."
  },
  {
    id: "gravityPostCourierSkiff",
    file: "apps/showcase-gravity-post/assets/candidates/gravityPostCourierSkiff.candidate.glb",
    role: "vehicle",
    author: "Aura3D synthesis",
    retrievedAt: "2026-09-01T10:09:00.000Z",
    sourcePage: "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-gravity-post/scripts/build-courier-skiff.py",
    downloadUrl: "https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-gravity-post/assets/candidates/gravityPostCourierSkiff.candidate.glb",
    license: "CC0-1.0",
    licenseName: "CC0 1.0 Universal",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceFamily: "aura3d-original",
    attribution: "Aura3D synthesis — original CC0 Gravity Post courier skiff",
    provenanceEvidence: "Generated in Blender 5.2.1 from committed route-local Python source. Two independent builds produced byte-identical GLBs. Ten merged material groups retain the layered courier hull, cyan canopy and running rails, side armor/fairings, four grounded contact-drive pods with rim/hub detail, twin amber aft drives, and a detachable guarded parcel module with a raised envelope badge; nine packed deterministic paint textures are embedded in the GLB. Route-local authored motion remains the sole gameplay owner.",
    quality: "release",
    renderedProbeJson: "tests/reports/showcase-release-asset-probes/gravityPostCourierSkiff.json",
    orientationJson: "tests/reports/showcase-release-asset-probes/gravityPostCourierSkiff.orientation.json",
    suitability: "Original CC0 +Y-up, +Z-forward primary courier skiff with a compact working-vehicle silhouette, layered beveled armor, grounded four-point contact language, readable cockpit-to-drive direction, and a large visually integrated detachable amber parcel carrying guards, an illuminated latch, and a raised envelope badge. Its ten readable color-separated PBR groups use embedded deterministic micro-panel paint textures plus emissive running lights, and are verified by the current hash-bound root probe and exact mounted route evidence. The GLB carries no collider, dynamics, or imported animation claim; immutable route-local pod state, Rust-to-Gale coordinates, Rapier sensors, scoring, and authored velocity-aligned yaw remain authoritative."
  }
];
const requestedIds = new Set((process.env.AURA3D_MODEL_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const forceQuality = process.env.AURA3D_FORCE_QUALITY;
const skipProbeEvidence = process.env.AURA3D_SKIP_PROBE_EVIDENCE === "1";
const selectedDefinitions = requestedIds.size === 0
  ? definitions
  : definitions.filter((definition) => requestedIds.has(definition.id));
if (requestedIds.size > 0 && selectedDefinitions.length !== requestedIds.size) {
  throw new Error(`Unknown Gravity Post model id(s): ${[...requestedIds].filter((id) => !definitions.some((definition) => definition.id === id)).join(", ")}`);
}

for (const definition of selectedDefinitions) {
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", definition.file,
    "--name", definition.id,
    "--type", "model",
    "--license", definition.license ?? "CC-BY-4.0",
    ...(definition.licenseName ? ["--license-name", definition.licenseName] : []),
    "--license-url", definition.licenseUrl ?? "https://creativecommons.org/licenses/by/4.0/",
    "--source-page", definition.sourcePage,
    "--download-url", definition.downloadUrl,
    "--author", definition.author,
    ...(definition.sourceFamily ? ["--source-family", definition.sourceFamily] : []),
    ...(definition.attribution ? ["--attribution", definition.attribution] : []),
    ...(definition.provenanceEvidence ? ["--provenance-evidence", definition.provenanceEvidence] : []),
    "--retrieved-at", definition.retrievedAt,
    "--quality", forceQuality ?? definition.quality ?? "release",
    "--role", definition.role,
    "--suitability", definition.suitability,
    ...(!skipProbeEvidence && definition.renderedProbeJson && definition.orientationJson ? [
      "--rendered-probe-json", definition.renderedProbeJson,
      "--orientation-json", definition.orientationJson
    ] : definition.id === "gravityPostMailPod" ? [
      "--rendered-probe-json", "tests/reports/showcase-release-asset-probes/gravityPostMailPod.json",
      "--orientation-json", "tests/reports/showcase-release-asset-probes/gravityPostMailPod.orientation.json"
    ] : [])
  ], { cwd: repoRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { payload = null; }
  if (payload?.ok !== true) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`Registered ${definition.id}`);
}
