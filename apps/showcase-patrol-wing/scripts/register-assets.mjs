/** Build and register Patrol Wing's deterministic original CC0 assets. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");
if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Patrol Wing assets.");

execFileSync("node", [resolve(appDir, "scripts/build-models.mjs")], { cwd: repoRoot, stdio: "inherit" });
execFileSync("node", [resolve(appDir, "scripts/build-sfx.mjs")], { cwd: repoRoot, stdio: "inherit" });

const models = [
  ["patrolWingPlane", "vehicle", "Original CC0 stylized flat-color readable 2.24 metre primary aircraft with a cream/red aircraft silhouette, +Y up, and +X nose; it is role-ready as the route's primary vehicle while route-local authored arcade motion owns gameplay and no aerodynamic claim is inferred."],
  ["patrolWingDroneA", "vehicle", "Original CC0 stylized flat-color readable black/orange 1.4 metre drone silhouette; it is role-ready as a flying intercept vehicle while seeded pursuit and combat-world hit truth are separately route-tested."],
  ["patrolWingDroneB", "vehicle", "Original CC0 stylized flat-color readable alternate black/orange 1.2 metre drone silhouette; it is role-ready as a flying intercept vehicle while seeded pursuit and combat-world hit truth are separately route-tested."],
  ["patrolWingPadBeacon", "prop", "Original CC0 stylized flat-color readable metre-scale 4.4 metre frontier landing-pad and cyan/amber beacon prop; it is role-ready as the landing objective while route-local pad sensor and touchdown bounds are separately tested."]
];

for (const [id, role, suitability] of models) {
  const source = resolve(appDir, `assets/models/${id}.glb`);
  const probe = resolve(probeDir, `${id}.json`);
  const sourceHash = `sha256-${createHash("sha256").update(readFileSync(source)).digest("hex")}`;
  const hasProbe = existsSync(probe) && JSON.parse(readFileSync(probe, "utf8")).renderedProbe?.assetHash === sourceHash;
  const args = [
    "assets", "add", source, "--name", id, "--type", "model",
    "--license", "CC0-1.0", "--license-name", "CC0 1.0 Universal",
    "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D synthesis", "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-patrol-wing/scripts/build-models.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-patrol-wing/assets/models/${id}.glb`,
    "--attribution", "Aura3D synthesis — original CC0 Patrol Wing model family",
    "--provenance-evidence", "Deterministically generated from committed Patrol Wing model source; geometry, materials, metre scale, and orientation are reproducible.",
    "--retrieved-at", "2026-08-24T04:45:00.000Z", "--quality", hasProbe ? "release" : "candidate",
    "--role", role, "--suitability", suitability
  ];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  const orientation = resolve(probeDir, `${id}.orientation.json`);
  if (existsSync(orientation) && JSON.parse(readFileSync(orientation, "utf8")).orientation?.assetHash === sourceHash) args.push("--orientation-json", orientation);
  execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`registered ${id} (${hasProbe ? "release + retained probe" : "candidate; probe pending"})`);
}

const audio = [
  ["ambientWind", "patrolWingAmbientWindSfx", "Looping frontier wind bed after user unlock."],
  ["cannonFire", "patrolWingCannonFireSfx", "Cannon discharge cue."],
  ["crashThud", "patrolWingCrashThudSfx", "Terrain/ocean crash cue."],
  ["droneDown", "patrolWingDroneDownSfx", "Drone knockout cue."],
  ["droneHit", "patrolWingDroneHitSfx", "Confirmed cannon hit cue."],
  ["engineLoop", "patrolWingEngineLoopSfx", "Throttle-driven engine bed after user unlock."],
  ["hullAlarm", "patrolWingHullAlarmSfx", "Low-hull and impact warning cue."],
  ["patrolClear", "patrolWingPatrolClearSfx", "Completed patrol cue."],
  ["ringChime", "patrolWingRingChimeSfx", "Ordered ring entry cue."],
  ["shotDown", "patrolWingShotDownSfx", "Hull failure cue."],
  ["touchdown", "patrolWingTouchdownSfx", "Safe landing cue."]
];
for (const [fileName, id, suitability] of audio) {
  const source = resolve(appDir, `assets/sfx/${fileName}.wav`);
  execFileSync("node", [cli, "assets", "add", source, "--name", id, "--type", "audio",
    "--license", "CC0-1.0", "--license-name", "CC0 1.0 Universal",
    "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D synthesis", "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-patrol-wing/scripts/build-sfx.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-patrol-wing/assets/sfx/${fileName}.wav`,
    "--attribution", "Aura3D synthesis — original CC0 Patrol Wing audio",
    "--provenance-evidence", "Deterministically synthesized from committed oscillator and seeded-noise source; contains no sampled material.",
    "--retrieved-at", "2026-08-24T04:45:00.000Z", "--quality", "candidate", "--role", "unknown", "--suitability", suitability
  ], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
}

execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
console.log(`Patrol Wing registration complete: ${models.length} original route models and ${audio.length} audio cues.`);
