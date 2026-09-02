/** Register only the hash-inspected Rooftop Buckets V2 art and regenerate types. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");
const entries = [
  {
    id: "rooftopShooterV2", role: "character",
    suitability: "Original CC0 metre-scale Rooftop Buckets shooter with seven readable uniform/body materials, a real 12-joint skin, and exact Load, Release, and FollowThrough clips. It faces +Z and stands +Y-up; route-local ballistics, scoring, and input own gameplay truth."
  },
  {
    id: "rooftopDefenderV2", role: "character",
    suitability: "Original CC0 metre-scale Rooftop Buckets defender with seven readable uniform/body materials, a real 12-joint skin, and exact Plant, Telegraph, Jump, and Contest clips. It faces +Z and stands +Y-up; route-local contest and collision-region state own gameplay truth."
  },
  {
    id: "rooftopVenueV2", role: "environment",
    suitability: "Original CC0 metre-scale surrounding rooftop streetball venue with material-varied bleachers, service towers, floodlights, banners, and water tower. Its authored stylized flat-color material rationale keeps structural tiers and sponsor accents readable without image textures. It surrounds the existing active court and deliberately contains no hoop, net, or collision authority."
  }
];
if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Rooftop Buckets V2 art.");

for (const entry of entries) {
  const source = resolve(appDir, `assets/models/${entry.id}.glb`);
  const probe = resolve(probeDir, `${entry.id}.json`);
  if (!existsSync(source)) throw new Error(`Missing authored V2 source: ${source}`);
  const hash = `sha256-${createHash("sha256").update(readFileSync(source)).digest("hex")}`;
  const hasProbe = existsSync(probe) && JSON.parse(readFileSync(probe, "utf8")).renderedProbe?.assetHash === hash;
  const args = [
    "assets", "add", source, "--name", entry.id, "--type", "model",
    "--license", "CC0-1.0", "--license-name", "CC0 1.0 Universal", "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D synthesis", "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-rooftop-buckets/scripts/build-v2-art.py",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-rooftop-buckets/assets/models/${entry.id}.glb`,
    "--attribution", "Aura3D synthesis — original CC0 Rooftop Buckets V2 art",
    "--provenance-evidence", "Deterministically authored from committed Blender source; local Aura CLI inspection verifies metre bounds, materials, orientation, skins, and named clips before registration.",
    "--retrieved-at", "2026-08-31T21:00:00.000Z", "--quality", hasProbe ? "release" : "candidate", "--role", entry.role, "--suitability", entry.suitability
  ];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  const orientation = resolve(probeDir, `${entry.id}.orientation.json`);
  if (hasProbe && existsSync(orientation)) args.push("--orientation-json", orientation);
  execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: "inherit" });
}
execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: "inherit" });
console.log(`Rooftop Buckets V2 registration complete: ${entries.map(({ id }) => id).join(", ")}`);
