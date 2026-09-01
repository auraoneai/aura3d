/**
 * Register the production Rooftop Buckets art once its retained browser
 * probes are available.
 *
 * This command is intentionally dry-run by default. `assets add` writes the
 * repository's generated root manifest and public asset copies, so the
 * release coordinator must opt in with `--apply` after the exact route probe
 * has been captured. The producer and local GLB inspection are independent of
 * that global manifest step.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const apply = process.argv.includes("--apply");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");

if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Rooftop Buckets production art.");

const entries = [
  {
    id: "rooftopCourt",
    file: "rooftopCourt.glb",
    role: "world",
    suitability: "Provenance-bound Rooftop Buckets streetball venue with a sealed 16 by 14 metre court slab, stepped rear and side bleachers, railings, sponsor banners, flood bars, and spectator crowd dressing. The stylized flat-color material rationale is intentional: this authored venue uses readable solid-color materials instead of image textures, with the retained browser probe proving visibility and separation. It deliberately contains no hoop, backboard, ball, collider, or scoring authority; the route owns those gameplay regions and typed props."
  },
  {
    id: "rooftopLayupScorer",
    file: "rooftopLayupScorer.glb",
    role: "character",
    suitability: "Provenance-bound CC-BY-4.0 textured humanoid athlete derived from Sketchfab Man Player, with one 191-joint skin, retained image materials, +Y-up/+Z-forward orientation metadata, and truthful route-authored Ready, Load, Release, and FollowThrough clips. The route owns root translation, the separate typed basketball, ballistic flight, contact sensors, and score state."
  },
  {
    id: "rooftopDefender",
    file: "rooftopDefender.glb",
    role: "character",
    suitability: "Provenance-bound CC-BY-4.0 textured humanoid defender derived from Sketchfab Man Player, with one 191-joint skin, a distinct crimson uniform material family, +Y-up/+Z-forward orientation metadata, and truthful Plant, Telegraph, Jump, and Contest clips. The route owns defender root placement, telegraph timing, composed block region, ballistics, and contest scoring; no reusable sports kit is claimed."
  }
];

for (const entry of entries) {
  const source = resolve(appDir, `assets/models/${entry.file}`);
  if (!existsSync(source)) throw new Error(`Missing production art: ${source}`);
  const hash = `sha256-${createHash("sha256").update(readFileSync(source)).digest("hex")}`;
  const probe = resolve(probeDir, `${entry.id}.json`);
  const hasProbe = existsSync(probe) && JSON.parse(readFileSync(probe, "utf8")).renderedProbe?.assetHash === hash;
  const externalAthlete = entry.role === "character";
  const args = [
    "assets", "add", source,
    "--name", entry.id,
    "--type", "model",
    ...(externalAthlete
      ? [
          "--license", "CC-BY-4.0",
          "--license-name", "Creative Commons Attribution 4.0 International",
          "--license-url", "https://creativecommons.org/licenses/by/4.0/",
          "--author", "RiverofCreative (Sketchfab Man Player); Aura3D derivative authoring",
          "--source-family", "sketchfab-4c7133dbb06e4136891d59231372d818",
          "--source-page", "https://sketchfab.com/3d-models/man-player-4c7133dbb06e4136891d59231372d818",
          "--download-url", "https://api.sketchfab.com/v3/models/4c7133dbb06e4136891d59231372d818/download",
          "--attribution", "RiverofCreative — Man Player (CC-BY-4.0); Aura3D Rooftop Buckets derivative authoring",
          "--provenance-evidence", "Derived deterministically by apps/showcase-rooftop-buckets/scripts/build-production-art.py from the retained Sketchfab Man Player source. Local Aura CLI inspection verifies one 191-joint skin, textured materials, metre-scale bounds, +Y-up/+Z-forward orientation, and named role-specific clips before registration."
        ]
      : [
          "--license", "CC0-1.0",
          "--license-name", "CC0 1.0 Universal",
          "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
          "--author", "Aura3D synthesis",
          "--source-family", "aura3d-original",
          "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-rooftop-buckets/scripts/build-production-art.py",
          "--download-url", "https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-rooftop-buckets/assets/models/rooftopCourt.glb",
          "--attribution", "Aura3D synthesis — original Rooftop Buckets venue authoring",
          "--provenance-evidence", "Deterministically authored by apps/showcase-rooftop-buckets/scripts/build-production-art.py. Local Aura CLI inspection verifies the sealed 16 by 14 metre court footprint, bleacher/crowd geometry, materials, and +Y-up/+Z-forward orientation before registration."
        ]),
    "--retrieved-at", "2026-08-31T00:00:00.000Z",
    "--quality", hasProbe ? "release" : "candidate",
    "--role", entry.role,
    "--suitability", entry.suitability
  ];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  const command = ["node", cli, ...args];
  if (apply) {
    execFileSync(command[0], command.slice(1), { cwd: repoRoot, stdio: "inherit" });
  } else {
    console.log(command.map((part) => JSON.stringify(part)).join(" "));
  }
}

if (apply) {
  execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: "inherit" });
  console.log(`Rooftop Buckets production registration complete: ${entries.map(({ id }) => id).join(", ")}`);
} else {
  console.log("Dry run only. Re-run with --apply after retained browser probes are captured; this is the only step that writes the global typed manifest.");
}
