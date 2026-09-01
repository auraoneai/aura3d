import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const retrievedAt = "2026-08-31T16:30:00Z";
const definitions = [
  ["pulseReactorEncounterWorld", "assets/models/pulseReactorEncounterWorld.glb", "world", "Original continuous gameplay-scale reactor world with connected deck, inset lane panels, containment walls, repeated ribs, roof depth, terminal bay, hazard trim, and visible fire/impact anchors. Its deliberately untextured stylized flat-color PBR material separation is the finished route art direction, not missing texture evidence; the world is decorative and non-colliding while route-local lanes, gates, projectiles, and collisions remain authoritative."],
  ["pulseTerminalSentry", "assets/models/pulseTerminalSentry.glb", "character", "Original rigid +Y-up, +Z-forward terminal sentry character with a readable connected silhouette, separated armour, edge plates, mechanics, reactor iris guard, optics, shoulder cannons, crown beacon, wings, and grounded claws. Its deliberately untextured stylized flat-color PBR material separation is the finished route art direction; this is a static rigid sculpture, and route-local finale targeting, projectile timing, and hit truth remain authoritative."],
  ["pulseRunnerCraft", "assets/models/pulseRunnerCraft.glb", "vehicle", "Original compact +Y-up, +Z-forward lane-runner vehicle with a readable connected silhouette, nose lip, upper spine, swept foils, graphite keel, canopy, copper edge trim, stabilizers, and paired drive pods. Its deliberately untextured stylized flat-color PBR material separation is the finished route art direction; route-local lane, jump, slide, shield, collision, and scoring systems remain authoritative."]
];

for (const [id, relativeFile, role, suitability] of definitions) {
  const source = `apps/showcase-pulse-tunnel/${relativeFile}`;
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", source, "--name", id, "--type", "model",
    "--license", "CC0-1.0", "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-pulse-tunnel/scripts/build-models.py",
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
