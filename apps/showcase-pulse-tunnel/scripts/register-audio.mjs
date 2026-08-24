import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const retrievedAt = "2026-08-23T20:00:00Z";
const definitions = [
  ["pulseDrumsStem", "assets/music/drums.wav", "Four-section 120 BPM drums stem sharing one AudioContext anchor with the other authored stems."],
  ["pulseBassStem", "assets/music/bass.wav", "Four-section 120 BPM bass stem sharing one AudioContext anchor with the other authored stems."],
  ["pulseLeadStem", "assets/music/lead.wav", "Four-section 120 BPM lead stem sharing one AudioContext anchor with the other authored stems."],
  ["pulseAirStem", "assets/music/air.wav", "Four-section 120 BPM air stem sharing one AudioContext anchor with the other authored stems."],
  ["pulseLaneSwitchSfx", "assets/sfx/laneSwitch.wav", "Lane-switch cue driven by accepted buffered player input."],
  ["pulseJumpSfx", "assets/sfx/jump.wav", "Jump cue driven by accepted grounded jump input."],
  ["pulseSlideSfx", "assets/sfx/slide.wav", "Slide cue driven by accepted grounded slide input."],
  ["pulseGrazeSfx", "assets/sfx/graze.wav", "Graze cue driven by the route-local measured near-miss window."],
  ["pulseShieldHitSfx", "assets/sfx/shieldHit.wav", "Shield-hit cue driven by a real gate collision outside invulnerability."],
  ["pulseShieldBreakSfx", "assets/sfx/shieldBreak.wav", "Shield-break cue driven by collision-owned shield exhaustion."],
  ["pulseSectionRiseSfx", "assets/sfx/sectionRise.wav", "Section-rise cue driven by authored chart section transition."],
  ["pulseRunOverSfx", "assets/sfx/runOver.wav", "Run-over cue driven by natural completion or shield failure summary."],
  ["pulseUiConfirmSfx", "assets/sfx/uiConfirm.wav", "UI confirmation cue driven by start, pause, resume, and restart state."]
];

for (const [id, relativeFile, suitability] of definitions) {
  const source = `apps/showcase-pulse-tunnel/${relativeFile}`;
  const producer = relativeFile.includes("music/") ? "build-music.mjs" : "build-sfx.mjs";
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", source, "--name", id, "--type", "audio",
    "--license", "CC0-1.0", "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--source-page", `https://github.com/auraoneai/aura3d/blob/main/apps/showcase-pulse-tunnel/scripts/${producer}`,
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
