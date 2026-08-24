import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const retrievedAt = "2026-08-23T18:40:00Z";
const sourcePage = "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-neon-swarm/scripts/build-sfx.mjs";
const licenseUrl = "https://creativecommons.org/publicdomain/zero/1.0/";
const definitions = [
  ["neonPulseFireSfx", "Directional pulse cue driven by a real accepted fire input."],
  ["neonDroneHitSfx", "Drone-hit tick driven by live pulse overlap damage."],
  ["neonDroneDieSfx", "Drone-destruction cue driven by simulation-owned HP reaching zero."],
  ["neonPlayerHurtSfx", "Courier damage cue driven by contact damage after shields and invulnerability."],
  ["neonDashSfx", "Dash cue driven by a live accepted dash transition."],
  ["neonPickupSfx", "Upgrade collection cue driven by exactly one selected intermission door."],
  ["neonWaveStartSfx", "Wave-start warning driven by the five-stage campaign transition."],
  ["neonWaveClearSfx", "Wave-clear and finale-resolution cue driven by campaign state."],
  ["neonDeathStingSfx", "Failure cue driven by courier HP reaching zero."],
  ["neonAmbientHumSfx", "Looped abstract city ambience started after a user gesture."],
  ["neonBurstSfx", "Charged radial-burst cue driven by a full live burst meter."],
  ["neonGrazeSfx", "Near-miss cue driven by the simulation graze annulus without contact."],
  ["neonComboBreakSfx", "Combo-break cue driven by the deterministic combo timer expiring."]
];

for (const [id, suitability] of definitions) {
  const source = `apps/showcase-neon-swarm/assets/sfx/${id}.wav`;
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", source,
    "--name", id,
    "--type", "audio",
    "--license", "CC0-1.0",
    "--license-url", licenseUrl,
    "--source-page", sourcePage,
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/${source}`,
    "--author", "Aura3D synthesis",
    "--retrieved-at", retrievedAt,
    "--quality", "candidate",
    "--role", "unknown",
    "--suitability", suitability
  ], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { payload = null; }
  if (payload?.ok !== true) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`Registered ${id}`);
}
