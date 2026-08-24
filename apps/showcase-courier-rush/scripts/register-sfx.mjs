import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const retrievedAt = "2026-08-23T20:00:00Z";
const definitions = [
  ["courierAmbientCitySfx", "ambientCity.wav", "Gesture-unlocked rain-dark city ambience."],
  ["courierDispatchBlipSfx", "dispatchBlip.wav", "Dispatch cue driven by each new delivery."],
  ["courierEarlyBonusSfx", "earlyBonus.wav", "Early-delivery combo cue driven by actual timer state."],
  ["courierEngineSfx", "engineLoop.wav", "Arcade van engine loop driven by live authored speed."],
  ["courierHornNearSfx", "hornNear.wav", "Traffic horn driven by a seeded courtesy-stop event."],
  ["courierParcelDropSfx", "parcelDrop.wav", "Parcel drop cue driven by one accepted drop sensor event."],
  ["courierParcelPickupSfx", "parcelPickup.wav", "Parcel pickup cue driven by one accepted pickup sensor event."],
  ["courierShiftClearSfx", "shiftClear.wav", "Shift-clear cue driven by completion of all five deliveries."],
  ["courierShiftFailSfx", "shiftFail.wav", "Shift-fail cue driven by timer or strike exhaustion."],
  ["courierStrikeHitSfx", "strikeHit.wav", "Collision strike cue driven by pinned route-local collision rules."]
];

for (const [id, file, suitability] of definitions) {
  const source = `apps/showcase-courier-rush/assets/sfx/${file}`;
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", source, "--name", id, "--type", "audio",
    "--license", "CC0-1.0", "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-courier-rush/scripts/build-sfx.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/${source}`,
    "--author", "Aura3D synthesis", "--retrieved-at", retrievedAt,
    "--quality", "candidate", "--role", "unknown", "--suitability", suitability
  ], { cwd: repoRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { payload = null; }
  if (payload?.ok !== true) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`Registered ${id}`);
}
