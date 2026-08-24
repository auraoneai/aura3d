import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const licenseUrl = "https://creativecommons.org/licenses/by/4.0/";
const definitions = [
  {
    id: "neonCourierAvatar",
    file: "neonCourierAvatar.glb",
    role: "character",
    author: "Daniel Darko",
    retrievedAt: "2026-08-21T23:01:29.333Z",
    sourcePage: "https://sketchfab.com/3d-models/low-poly-robot-19ccf1fa9c5f47ba8e7a1703a7c0d7ae",
    downloadUrl: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-026/19ccf1fa9c5f47ba8e7a1703a7c0d7ae.glb",
    suitability: "Static untextured stylized flat-color primary courier character with upright readable player-avatar height, current hash-bound material pixels, and a manifest-override +Z neutral orientation before route-authored yaw."
  },
  {
    id: "neonBarricadeProp",
    file: "neonBarricadeProp.glb",
    role: "prop",
    author: "Kyle Burton",
    retrievedAt: "2026-08-21T23:01:50.009Z",
    sourcePage: "https://sketchfab.com/3d-models/barricade-03ebcc6f5320400394f781a47388751b",
    downloadUrl: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-127/03ebcc6f5320400394f781a47388751b.glb",
    suitability: "Typed textured street barricade prop with route-normalized placement through targetMaxDimension 2.7; its current hash-bound rendered foreground proves a readable orange-white obstacle around the abstract swarm."
  },
  {
    id: "neonStreetLampProp",
    file: "neonStreetLampProp.glb",
    role: "prop",
    author: "Humphrorange",
    retrievedAt: "2026-08-21T23:01:58.590Z",
    sourcePage: "https://sketchfab.com/3d-models/lamppost-street-light-cf3993d33aa64114a98bbe99ff3d2a83",
    downloadUrl: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-131/cf3993d33aa64114a98bbe99ff3d2a83.glb",
    suitability: "Typed textured street-lamp prop with route-normalized camera-fit placement through targetMaxDimension 4.2; its current hash-bound rendered foreground proves a readable post and luminaire arena landmark."
  }
];

for (const definition of definitions) {
  const source = `apps/showcase-neon-swarm/assets/models/${definition.file}`;
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", source,
    "--name", definition.id,
    "--type", "model",
    "--license", "CC-BY-4.0",
    "--license-url", licenseUrl,
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
