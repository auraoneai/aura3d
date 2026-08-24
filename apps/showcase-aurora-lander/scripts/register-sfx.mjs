import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const retrievedAt = "2026-08-23T18:00:57Z";
const sourcePage = "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-aurora-lander/scripts/build-sfx.mjs";
const licenseUrl = "https://creativecommons.org/publicdomain/zero/1.0/";
const cues = [
  ["ambientWind.wav", "auroraAmbientWindSfx", "Looped polar ambience driven by the route audio bus."],
  ["crash.wav", "auroraCrashSfx", "Fatal-contact crash cue driven by the graded contact event."],
  ["fuelLow.wav", "auroraFuelLowSfx", "One-shot low-fuel warning driven by the live tank fraction."],
  ["gustWarn.wav", "auroraGustWarnSfx", "Storm-front warning driven before the authored gust window."],
  ["padLock.wav", "auroraPadLockSfx", "Pad sensor lock cue driven by a real zone entry."],
  ["rcsPuff.wav", "auroraRcsPuffSfx", "Attitude-control puff driven by live lateral input."],
  ["siteClear.wav", "auroraSiteClearSfx", "Site-clear fanfare driven by a valid graded landing."],
  ["thrustLoop.wav", "auroraThrustLoopSfx", "Main-engine loop gated by live throttle and remaining fuel."],
  ["touchHard.wav", "auroraTouchHardSfx", "Hard-contact cue driven by the touchdown grading matrix."],
  ["touchSoft.wav", "auroraTouchSoftSfx", "Soft-contact cue driven by the touchdown grading matrix."]
];

for (const [file, id, suitability] of cues) {
  const source = `apps/showcase-aurora-lander/assets/sfx/${file}`;
  const downloadUrl = `https://raw.githubusercontent.com/auraoneai/aura3d/main/${source}`;
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", source,
    "--name", id,
    "--type", "audio",
    "--license", "CC0-1.0",
    "--license-url", licenseUrl,
    "--source-page", sourcePage,
    "--download-url", downloadUrl,
    "--author", "Aura3D synthesis",
    "--retrieved-at", retrievedAt,
    "--quality", "candidate",
    "--role", "unknown",
    "--suitability", suitability
  ], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    payload = null;
  }
  // The CLI currently exits nonzero for an audio asset's expected missing-model-
  // bounds warning even when `assets add` itself reports ok and regenerates both
  // manifest/typegen. Accept only that explicit successful payload.
  if (payload?.ok !== true) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`Registered ${id}`);
}
