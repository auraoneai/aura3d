import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const retrievedAt = "2026-08-23T20:00:00Z";
const definitions = [
  ["gravityPostLaunchWhooshSfx", "launchWhoosh.wav", "Launch cue driven by an accepted drag release."],
  ["gravityPostBurnLoopSfx", "burnLoop.wav", "Bounded correction impulse cue driven by the one-use correction token."],
  ["gravityPostDockLockSfx", "dockLock.wav", "Dock-lock cue driven by a real destination sensor capture."],
  ["gravityPostBounceOffSfx", "bounceOff.wav", "Too-fast rejection cue driven by destination capture-speed evaluation."],
  ["gravityPostPodLostSfx", "podLost.wav", "Hull-loss cue driven by collision, escape, stranded, or timeout state."],
  ["gravityPostContractClearSfx", "contractClear.wav", "Delivery-clear fanfare driven by one accepted dock event."],
  ["gravityPostAssistChimeSfx", "assistChime.wav", "Distinct-well assist cue driven by entry into an authored assist zone."],
  ["gravityPostWarpHumSfx", "warpHum.wav", "Bounded time-warp hum retriggered only while warp is active."],
  ["gravityPostUiConfirmSfx", "uiConfirm.wav", "Route-local confirmation cue for retry, next, and flyby transitions."],
  ["gravityPostAmbientSpaceSfx", "ambientSpace.wav", "Looped space ambience started through the gesture-unlocked audio mixer."]
];

for (const [id, file, suitability] of definitions) {
  const source = `apps/showcase-gravity-post/assets/sfx/${file}`;
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", source,
    "--name", id,
    "--type", "audio",
    "--license", "CC0-1.0",
    "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-gravity-post/scripts/build-sfx.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/${source}`,
    "--author", "Aura3D synthesis",
    "--retrieved-at", retrievedAt,
    "--quality", "candidate",
    "--role", "unknown",
    "--suitability", suitability
  ], { cwd: repoRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { payload = null; }
  if (payload?.ok !== true) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`Registered ${id}`);
}
