/**
 * Register the synthesized SFX cues with the Aura3D asset CLI.
 *
 * Run after scripts/build-sfx.mjs, from this app directory:
 *   node scripts/register-sfx.mjs
 *
 * Assets are registered into the REPO ROOT manifest (root aura.assets.json,
 * src/aura-assets.ts, public/aura-assets/) because showcase routes are served
 * and tested through the root dev/build server, matching skyline-runner.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
if (!existsSync(cli)) {
  console.error("CLI dist missing; build it first: pnpm --dir packages/aura3d-cli build");
  process.exit(1);
}

const cues = [
  ["mechServoCycleSfx", "Slot-cycle servo cue driven by a successful selected-part change in the hangar."],
  ["mechLockInSfx", "Build lock cue driven only by a validated four-part assembly entering the arena."],
  ["mechWalkHeavySfx", "Heavy footfall cue rate-limited and driven by grounded player movement."],
  ["mechLightHitSfx", "Light impact cue driven by a route-local combat hit event."],
  ["mechHeavyHitSfx", "Heavy impact cue driven by a route-local heavy hit event."],
  ["mechGuardBlockSfx", "Guard block cue driven by a real guarded combat contact."],
  ["mechGuardBreakSfx", "Guard-break cue driven by guard depletion and authored stagger."],
  ["mechSpecialFireSfx", "Power-special cue driven by a successful power-gated special start."],
  ["mechKoStingSfx", "KO sting driven by the exact route-local KO event."],
  ["mechAmbientHangarSfx", "Authored hangar ambience retriggered on a bounded route-local cadence."]
];

for (const [cue, suitability] of cues) {
  const file = resolve(appDir, "assets/sfx", cue + ".wav");
  if (!existsSync(file)) {
    console.error("missing wav for " + cue + "; run scripts/build-sfx.mjs first");
    process.exit(1);
  }
  // The CLI prints its full manifest report; we do not parse it here — the
  // manifest itself is the durable record and is re-read for idempotency.
  execFileSync("node", [
    cli,
    "assets",
    "add",
    file,
    "--name",
    cue,
    "--type",
    "audio",
    "--license",
    "CC0-1.0",
    "--license-name",
    "CC0 1.0 Universal",
    "--license-url",
    "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author",
    "Aura3D synthesis",
    "--source-page",
    "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-mech-hangar/scripts/build-sfx.mjs",
    "--download-url",
    `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-mech-hangar/assets/sfx/${cue}.wav`,
    "--retrieved-at",
    "2026-08-23T22:00:00.000Z",
    "--quality",
    "candidate",
    "--role",
    "unknown",
    "--suitability",
    suitability
  ], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log("registered " + cue);
}
console.log("sfx registration pass complete");
