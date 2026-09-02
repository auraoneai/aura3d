import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const retrievedAt = "2026-09-02T01:47:00Z";
const sourcePage = "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-pulse-tunnel/scripts/build-encounter-finish-v11.py";
const definitions = [
  ["pulseReactorEncounterWorld", "assets/models/pulseReactorEncounterWorld.glb", "world", "Original CC0 V11 Pulse reactor encounter world with a continuous chamfered deck, recessed exchange runway, textured panel tiling, service conduits, forged arched ribs, overhead cabinets, and a layered terminal iris chamber. This is a rigid decorative world asset; route-local lanes, gates, projectiles, collisions, scoring, and audio timing remain authoritative."],
  ["pulseTerminalSentry", "assets/models/pulseTerminalSentry.glb", "character", "Original CC0 V11 rigid Pulse terminal warden character with a readable +Z orientation, connected layered thorax, textured gunmetal shell, ceramic brow and wings, recessed furnace/optic rings, articulated copper spars, rotary cannons, reverse-jointed legs, crown hardware, and grounded talons. It is static presentation geometry; route-local targeting, projectile timing, damage, and outcomes remain authoritative."],
  ["pulseRunnerCraft", "assets/models/pulseRunnerCraft.glb", "vehicle", "Original CC0 V11 compact Pulse runner craft with a continuous arrowhead fuselage, packed panel shell, raised smoked cockpit, broad delta foils, ceramic/copper leading edges, ventral keel, turbine nacelles, emissive apertures, stabilizers, rivets, and forward shield collar. Route-local lane, jump, slide, shield, collision, and scoring systems remain authoritative."]
];

for (const [id, relativeFile, role, suitability] of definitions) {
  const source = `apps/showcase-pulse-tunnel/${relativeFile}`;
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", source, "--name", id, "--type", "model",
    "--license", "CC0-1.0", "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--source-page", sourcePage,
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/${source}`,
    "--author", "Aura3D synthesis", "--retrieved-at", retrievedAt,
    "--quality", "release", "--role", role, "--suitability", suitability,
    "--rendered-probe-json", `tests/reports/showcase-release-asset-probes/${id}.json`,
    "--orientation-json", `tests/reports/showcase-release-asset-probes/${id}.orientation.json`
  ], { cwd: repoRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { payload = null; }
  if (payload?.ok !== true) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`Registered ${id}`);
}
