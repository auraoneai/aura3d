/** Build and register Deep Recovery's deterministic original CC0 assets. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");
if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Deep Recovery assets.");

execFileSync("node", [resolve(appDir, "scripts/build-models.mjs")], { cwd: repoRoot, stdio: "inherit" });
execFileSync("node", [resolve(appDir, "scripts/build-sfx.mjs")], { cwd: repoRoot, stdio: "inherit" });

const models = [
  ["deepRecoverySub", "vehicle", "Original CC0 stylized flat-color primary vehicle at an inspected 3.14 metre length, +Y up and +Z forward, with a readable hull, cockpit, lamps, thrusters, fins, and grapple hardware; route-local authored motion owns gameplay."],
  ["deepRecoveryWreckHull", "prop", "Original CC0 stylized flat-color readable metre-scale wreck prop with a 6.4 metre extent, hull ribs, and machinery used as the mission structure; matching authored collision and sonar-occlusion volumes are route-local."],
  ["deepRecoveryCrateStandard", "prop", "Original CC0 blue standard salvage pod with readable latch and trim; route-local mass is 120 kg."],
  ["deepRecoveryCrateHeavy", "prop", "Original CC0 stylized flat-color readable amber reinforced salvage prop, visually distinct from the standard family; route-local heavy mass begins at 280 kg."],
  ["deepRecoveryBuoyBeacon", "prop", "Original CC0 stylized flat-color readable surface recovery buoy prop with pontoons, mast, docking structure, and beacon; route-local bank, repair, oxygen, and surface zones are separately tested."]
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
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-deep-recovery/scripts/build-models.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-deep-recovery/assets/models/${id}.glb`,
    "--attribution", "Aura3D synthesis — original CC0 Deep Recovery model family",
    "--provenance-evidence", "Deterministically generated from committed Deep Recovery model source; geometry, materials, metre scale, and orientation are reproducible.",
    "--retrieved-at", "2026-08-24T04:00:00.000Z", "--quality", hasProbe ? "release" : "candidate",
    "--role", role, "--suitability", suitability
  ];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  const orientation = resolve(probeDir, `${id}.orientation.json`);
  const hasOrientation = existsSync(orientation)
    && JSON.parse(readFileSync(orientation, "utf8")).orientation?.assetHash === sourceHash;
  if (hasOrientation) args.push("--orientation-json", orientation);
  execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`registered ${id} (${hasProbe ? "release + retained probe" : "candidate; probe pending"})`);
}

const audio = [
  ["sonarPing", "deepRecoverySonarPingSfx", "Sonar pulse emission cue."],
  ["sonarReturn", "deepRecoverySonarReturnSfx", "Spatial-contact return cue."],
  ["hullCreak", "deepRecoveryHullCreakSfx", "High-pressure hull stress cue."],
  ["breachAlarm", "deepRecoveryBreachAlarmSfx", "Breach-state transition alarm."],
  ["patchSeal", "deepRecoveryPatchSealSfx", "Explicit buoy-repair completion cue."],
  ["grappleLatch", "deepRecoveryGrappleLatchSfx", "Grapple attachment cue."],
  ["crateBank", "deepRecoveryCrateBankSfx", "Buoy bank completion cue."],
  ["oxygenWarn", "deepRecoveryOxygenWarnSfx", "Low-oxygen state warning."],
  ["blackout", "deepRecoveryBlackoutSfx", "Life-support failure cue."],
  ["surfaceBreak", "deepRecoverySurfaceBreakSfx", "Surface and mission-win cue."],
  ["ambientDeep", "deepRecoveryAmbientDeepSfx", "Looping black-water ambience after user unlock."]
];

for (const [fileName, id, suitability] of audio) {
  const source = resolve(appDir, `assets/sfx/${fileName}.wav`);
  execFileSync("node", [cli, "assets", "add", source, "--name", id, "--type", "audio",
    "--license", "CC0-1.0", "--license-name", "CC0 1.0 Universal",
    "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D synthesis", "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-deep-recovery/scripts/build-sfx.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-deep-recovery/assets/sfx/${fileName}.wav`,
    "--attribution", "Aura3D synthesis — original CC0 Deep Recovery audio",
    "--provenance-evidence", "Deterministically synthesized from committed oscillator and seeded-noise source; contains no sampled material.",
    "--retrieved-at", "2026-08-24T04:00:00.000Z", "--quality", "candidate", "--role", "unknown", "--suitability", suitability
  ], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
}

execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
console.log(`Deep Recovery registration complete: ${models.length} original route models and ${audio.length} audio cues.`);
