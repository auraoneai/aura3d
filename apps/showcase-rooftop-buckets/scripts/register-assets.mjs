/** Build and register Rooftop Buckets' deterministic original CC0 assets. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");
if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Rooftop Buckets assets.");

execFileSync("node", [resolve(appDir, "scripts/build-models.mjs")], { cwd: repoRoot, stdio: "inherit" });
execFileSync("node", [resolve(appDir, "scripts/build-sfx.mjs")], { cwd: repoRoot, stdio: "inherit" });

const models = [
  {
    id: "rooftopCourt",
    role: "world",
    suitability: "Original CC0 metre-scale flat-color 16 by 14 metre rooftop court slab; its readable bounds and authored world scale match the six route-local shooting spots."
  },
  {
    id: "rooftopBackboard",
    role: "prop",
    suitability: "Original CC0 metre-scale flat-color 1.8 by 1.05 metre backboard prop, synchronized to the composed route-local board contact region and kept visible in the fixed shooting camera."
  },
  {
    id: "rooftopRim",
    role: "prop",
    suitability: "Original CC0 metre-scale flat-color 0.48 metre hoop prop, synchronized to the composed route-local rim and top-to-bottom scoring regions without claiming reusable physics."
  },
  {
    id: "rooftopBall",
    role: "prop",
    suitability: "Original CC0 unit-normalized flat-color basketball prop, scaled by the route to a regulation 0.24 metre diameter and synchronized to the authored deterministic flight state."
  },
  {
    id: "rooftopDefender",
    role: "character",
    suitability: "Original CC0 metre-scale stylized basketball defender character with 16 named parented pose nodes and Plant, Telegraph, Jump, and Contest clips. The route binds those clips to its deterministic contest state; no skinning or reusable defender system is claimed."
  },
  {
    id: "rooftopShooter",
    role: "character",
    suitability: "Original CC0 metre-scale stylized basketball shooter with 16 named parented pose nodes and Load, Release, and FollowThrough clips. The separately typed ball and route-local flight remain authoritative; no skinning or reusable player system is claimed."
  }
];

for (const model of models) {
  const source = resolve(appDir, `assets/models/${model.id}.glb`);
  const probe = resolve(probeDir, `${model.id}.json`);
  const sourceHash = `sha256-${createHash("sha256").update(readFileSync(source)).digest("hex")}`;
  const hasProbe = existsSync(probe)
    && JSON.parse(readFileSync(probe, "utf8")).renderedProbe?.assetHash === sourceHash;
  const args = [
    "assets", "add", source,
    "--name", model.id,
    "--type", "model",
    "--license", "CC0-1.0",
    "--license-name", "CC0 1.0 Universal",
    "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D synthesis",
    "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-rooftop-buckets/scripts/build-models.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-rooftop-buckets/assets/models/${model.id}.glb`,
    "--attribution", "Aura3D synthesis — original CC0 Rooftop Buckets model family",
    "--provenance-evidence", "Deterministically generated from the committed Rooftop Buckets model source; geometry, metre/unit scale, materials, and orientation metadata are reproducible.",
    "--retrieved-at", "2026-08-24T00:00:00.000Z",
    "--quality", hasProbe ? "release" : "candidate",
    "--role", model.role,
    "--suitability", model.suitability
  ];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`registered ${model.id} (${hasProbe ? "release + retained probe" : "candidate; probe pending"})`);
}

const audio = [
  ["ambientRooftop", "rooftopBucketsAmbientRooftopSfx", "Looping dusk rooftop ambience started by the route audio controller."],
  ["boardThud", "rooftopBucketsBoardThudSfx", "Backboard thud driven only by the composed board contact event."],
  ["brickMiss", "rooftopBucketsBrickMissSfx", "Miss cue driven only by a settled non-scoring shot or gold failure."],
  ["buzzerFail", "rooftopBucketsBuzzerFailSfx", "Buzzer cue driven by clock violation or terminal timer failure."],
  ["chargeTick", "rooftopBucketsChargeTickSfx", "Rate-limited charge tick driven by live keyboard or touch hold state."],
  ["fireIgnite", "rooftopBucketsFireIgniteSfx", "Fire ignition cue driven by the third consecutive make."],
  ["goldBall", "rooftopBucketsGoldBallSfx", "Gold-ball cue driven by the single finale launch or verified gold outcome fixture."],
  ["heatAdvance", "rooftopBucketsHeatAdvanceSfx", "Heat advance fanfare driven by the player accepting a cleared heat."],
  ["rimClank", "rooftopBucketsRimClankSfx", "Rim clank driven only by a composed rim contact event."],
  ["swish", "rooftopBucketsSwishSfx", "Swish cue driven by an armed top-to-bottom rim sensor sequence."]
];

for (const [fileName, id, suitability] of audio) {
  const source = resolve(appDir, `assets/sfx/${fileName}.wav`);
  execFileSync("node", [cli,
    "assets", "add", source,
    "--name", id,
    "--type", "audio",
    "--license", "CC0-1.0",
    "--license-name", "CC0 1.0 Universal",
    "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D synthesis",
    "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-rooftop-buckets/scripts/build-sfx.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-rooftop-buckets/assets/sfx/${fileName}.wav`,
    "--attribution", "Aura3D synthesis — original CC0 Rooftop Buckets audio",
    "--provenance-evidence", "Deterministically synthesized from the committed oscillator and seeded-noise generator; contains no sampled material.",
    "--retrieved-at", "2026-08-24T00:00:00.000Z",
    "--quality", "candidate",
    "--role", "unknown",
    "--suitability", suitability
  ], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`registered ${id} (candidate)`);
}

execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
console.log(`Rooftop Buckets registration complete: ${models.length} models, ${audio.length} audio cues.`);
