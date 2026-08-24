import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const definitions = [
  {
    id: "gravityPostMailPod",
    file: "public/aura-assets/gravityPostMailPod.e24dfcca.glb",
    role: "vehicle",
    author: "futaba@blender",
    retrievedAt: "2026-08-21T22:51:50.594Z",
    sourcePage: "https://sketchfab.com/3d-models/b158f01dd4a9416fb689ca4401856e7a",
    downloadUrl: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-011/b158f01dd4a9416fb689ca4401856e7a.glb",
    suitability: "Typed textured primary mail pod with a compact readable capsule silhouette, current manifest bounds, durable CC-BY provenance, and route-authored velocity-aligned yaw; no physical spacecraft claim."
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
  }
];

for (const definition of definitions) {
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", definition.file,
    "--name", definition.id,
    "--type", "model",
    "--license", "CC-BY-4.0",
    "--license-url", "https://creativecommons.org/licenses/by/4.0/",
    "--source-page", definition.sourcePage,
    "--download-url", definition.downloadUrl,
    "--author", definition.author,
    "--retrieved-at", definition.retrievedAt,
    "--quality", "release",
    "--role", definition.role,
    "--suitability", definition.suitability
  ], { cwd: repoRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { payload = null; }
  if (payload?.ok !== true) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`Registered ${definition.id}`);
}
