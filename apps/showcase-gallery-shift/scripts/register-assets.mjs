/** Build and register Gallery Shift's deterministic original CC0 assets. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");
if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Gallery Shift assets.");

execFileSync("node", [resolve(appDir, "scripts/build-models.mjs")], { cwd: repoRoot, stdio: "inherit" });
execFileSync("node", [resolve(appDir, "scripts/build-sfx.mjs")], { cwd: repoRoot, stdio: "inherit" });

const models = [
  ["galleryShiftMuseumInterior", "environment", "Original CC0 metre-scale stylized flat-color museum environment establishing the Marble Hall floor, walls, partitions, cover, and service-exit route; visible geometry is paired with matching route-local colliders."],
  ["galleryShiftPedestal", "prop", "Original CC0 metre-scale readable prop used as a visible exhibit objective fixture and LOS occluder."],
  ["galleryShiftExhibitA", "prop", "Original CC0 readable gold-ring lunar-orb prop used as the first theft objective at a verified 0.44 metre extent."],
  ["galleryShiftExhibitB", "prop", "Original CC0 readable stacked-statue prop used as the second theft objective at a verified 0.48 metre height."],
  ["galleryShiftExhibitC", "prop", "Original CC0 readable capsule prop used as the third theft objective and alarm trigger at a verified 0.31 metre height."],
  ["galleryShiftDisplayCase", "prop", "Original CC0 readable glass-and-steel prop used as visible Skyline Wing cover and paired with a matching LOS occluder."]
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
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-gallery-shift/scripts/build-models.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-gallery-shift/assets/models/${id}.glb`,
    "--attribution", "Aura3D synthesis — original CC0 Gallery Shift model family",
    "--provenance-evidence", "Deterministically generated from committed Gallery Shift model source; geometry, metre scale, materials, and orientation are reproducible.",
    "--retrieved-at", "2026-08-24T02:00:00.000Z", "--quality", hasProbe ? "release" : "candidate",
    "--role", role, "--suitability", suitability
  ];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  const orientation = resolve(probeDir, `${id}.orientation.json`);
  if (existsSync(orientation)) args.push("--orientation-json", orientation);
  execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`registered ${id} (${hasProbe ? "release + retained probe" : "candidate; probe pending"})`);
}

{
  const id = "showcaseExpressiveRobot";
  const source = resolve(repoRoot, "fixtures/threejs-parity/assets/character/robot-expressive.glb");
  const probe = resolve(probeDir, `${id}.json`);
  const sourceHash = `sha256-${createHash("sha256").update(readFileSync(source)).digest("hex")}`;
  const hasProbe = existsSync(probe) && JSON.parse(readFileSync(probe, "utf8")).renderedProbe?.assetHash === sourceHash;
  const args = ["assets", "add", source, "--name", id, "--type", "model",
    "--license", "CC0-1.0", "--license-name", "CC0 1.0 Universal", "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D fixture", "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/fixtures/threejs-parity/assets/character/robot-expressive.glb",
    "--download-url", "https://raw.githubusercontent.com/auraoneai/aura3d/main/fixtures/threejs-parity/assets/character/robot-expressive.glb",
    "--attribution", "Aura3D fixture — CC0 expressive robot",
    "--provenance-evidence", "Repository-locked CC0 animated robot fixture with embedded Idle, Walking, and Running clips; Gallery Shift uses it as a typed guard presentation asset only.",
    "--retrieved-at", "2026-08-24T02:00:00.000Z", "--quality", hasProbe ? "release" : "candidate", "--role", "character",
    "--suitability", "Typed animated guard presentation asset; route-local authored movement and perception remain gameplay authority."];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  const orientation = resolve(probeDir, `${id}.orientation.json`);
  if (existsSync(orientation)) args.push("--orientation-json", orientation);
  execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`registered ${id} (${hasProbe ? "release + retained probe" : "candidate; probe pending"})`);
}

const audio = [
  ["sneakStep", "galleryShiftSneakStepSfx", "Quiet authored-gait footstep cue."],
  ["walkStep", "galleryShiftWalkStepSfx", "Walk/guard authored-gait footstep cue."],
  ["guardAlert", "galleryShiftGuardAlertSfx", "Guard alert-state transition cue."],
  ["alertRise", "galleryShiftAlertRiseSfx", "Suspicion or third-exhibit alarm escalation cue."],
  ["exhibitLift", "galleryShiftExhibitLiftSfx", "Exact-once completed exhibit-lift cue."],
  ["laserTrip", "galleryShiftLaserTripSfx", "Exact-once laser-entry cue."],
  ["cameraWhir", "galleryShiftCameraWhirSfx", "Nearby authored camera-sweep cue."],
  ["caughtSting", "galleryShiftCaughtStingSfx", "Caught-state transition cue."],
  ["floorClear", "galleryShiftFloorClearSfx", "Floor transition cue."],
  ["ambientHall", "galleryShiftAmbientHallSfx", "Looping museum ambience after user unlock."],
  ["exitWin", "galleryShiftExitWinSfx", "Mission-win transition cue."]
];

for (const [fileName, id, suitability] of audio) {
  const source = resolve(appDir, `assets/sfx/${fileName}.wav`);
  execFileSync("node", [cli, "assets", "add", source, "--name", id, "--type", "audio",
    "--license", "CC0-1.0", "--license-name", "CC0 1.0 Universal",
    "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D synthesis", "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-gallery-shift/scripts/build-sfx.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-gallery-shift/assets/sfx/${fileName}.wav`,
    "--attribution", "Aura3D synthesis — original CC0 Gallery Shift audio",
    "--provenance-evidence", "Deterministically synthesized from committed oscillator and seeded-noise source; contains no sampled material.",
    "--retrieved-at", "2026-08-24T02:00:00.000Z", "--quality", "candidate", "--role", "unknown", "--suitability", suitability
  ], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
}

execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
console.log(`Gallery Shift registration complete: ${models.length} original route models, one supporting guard model, ${audio.length} audio cues.`);
