/** Build and register Vault Breakers' deterministic original CC0 assets. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");
if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Vault Breakers assets.");

execFileSync("node", [resolve(appDir, "scripts/build-models.mjs")], { cwd: repoRoot, stdio: "inherit" });
execFileSync("node", [resolve(appDir, "scripts/build-sfx.mjs")], { cwd: repoRoot, stdio: "inherit" });

const models = [
  ["vaultBreakersTable", "prop", "Original CC0 readable stylized flat-color pinball-table prop with a measured 6.2 by 9.57 metre route scale; route-local Rapier bodies and mechanisms remain simulation authority."],
  ["vaultBreakersMechanisms", "prop", "Original CC0 readable metre-scale prop overlay for Vault Breakers bumpers, target banks, orbit markers, and vault focus; route-local Rapier bodies and sensors remain gameplay authority."],
  ["vaultBreakersBall", "prop", "Original CC0 readable prop at a verified 0.28 metre scale, synchronized to the route's dynamic Rapier ball body without implying angular-spin simulation."],
  ["vaultBreakersFlipper", "prop", "Original CC0 readable metre-scale prop with an authored hinge-pivot origin, synchronized to the two pinned route-local motorised joints."],
  ["vaultBreakersVaultDoor", "prop", "Original CC0 metre-scale vault-door prop synchronized to the route's authored door-opening and multiball mission state."]
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
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-vault-breakers/scripts/build-models.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-vault-breakers/assets/models/${id}.glb`,
    "--attribution", "Aura3D synthesis — original CC0 Vault Breakers model family",
    "--provenance-evidence", "Deterministically generated from the committed Vault Breakers model source; geometry, metre scale, materials, and orientation metadata are reproducible.",
    "--retrieved-at", "2026-08-24T01:00:00.000Z", "--quality", hasProbe ? "release" : "candidate",
    "--role", role, "--suitability", suitability
  ];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`registered ${id} (${hasProbe ? "release + retained probe" : "candidate; probe pending"})`);
}

const audio = [
  ["flipperSnap", "vaultFlipperSnapSfx", "Motor snap driven only by a live left/right flipper actuation event."],
  ["bumperHit", "vaultBumperHitSfx", "Bumper impact cue driven only by a route-local Rapier contact."],
  ["slingPop", "vaultSlingPopSfx", "Slingshot cue driven only by a route-local sling contact and authored kick."],
  ["rampRoll", "vaultRampRollSfx", "Ramp roll cue driven by the route-local ramp sensor transition."],
  ["targetDown", "vaultTargetDownSfx", "Target-down cue driven by a newly completed target sensor."],
  ["bankClear", "vaultBankClearSfx", "Bank-clear cue driven by completing all five mission targets."],
  ["vaultOpen", "vaultVaultOpenSfx", "Vault-open cue driven by the authored door transition after bank completion."],
  ["multiball", "vaultMultiballSfx", "Multiball cue driven by the verified vault-open release transition."],
  ["ballDrain", "vaultBallDrainSfx", "Drain cue driven only by the drain catch ending an active ball."],
  ["tiltWarn", "vaultTiltWarnSfx", "Tilt warning cue driven by a route-local nudge strike."],
  ["plungerRelease", "vaultPlungerReleaseSfx", "Plunger release cue driven by keyboard or touch charge release."]
];

for (const [fileName, id, suitability] of audio) {
  const source = resolve(appDir, `assets/sfx/${fileName}.wav`);
  execFileSync("node", [cli, "assets", "add", source, "--name", id, "--type", "audio",
    "--license", "CC0-1.0", "--license-name", "CC0 1.0 Universal",
    "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D synthesis", "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-vault-breakers/scripts/build-sfx.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-vault-breakers/assets/sfx/${fileName}.wav`,
    "--attribution", "Aura3D synthesis — original CC0 Vault Breakers audio",
    "--provenance-evidence", "Deterministically synthesized from the committed oscillator and seeded-noise generator; contains no sampled material.",
    "--retrieved-at", "2026-08-24T01:00:00.000Z", "--quality", "candidate", "--role", "unknown", "--suitability", suitability
  ], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`registered ${id} (candidate)`);
}

execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
console.log(`Vault Breakers registration complete: ${models.length} models, ${audio.length} audio cues.`);
