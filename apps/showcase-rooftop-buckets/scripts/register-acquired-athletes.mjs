/**
 * Register the reviewed CC-BY Rooftop Buckets athlete derivatives.
 *
 * These are static, pose-authored route subjects: the route owns ballistics,
 * movement, contest state, and all gameplay truth.  The source athlete and the
 * ball-free defender derivative retain their attribution and adaptation notes;
 * they are not presented as an animation kit or as a second licensed identity.
 * Run after the root CLI has been built.  A hash-matching root probe is required
 * before either entry is promoted from candidate to release.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");
const sourcePage = "https://sketchfab.com/3d-models/basketball-player-9a1be0ed25f94e9998adee1df3a2d218";
const sourceDownload = "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-099/9a1be0ed25f94e9998adee1df3a2d218.glb";
const entries = [
  {
    id: "rooftopAthleteShooter",
    file: "rooftopAthleteShooter.glb",
    role: "character",
    adaptation: "Ball hierarchy removed from the CC-BY source; the route-owned typed basketball remains the sole gameplay ball. Pose, meshes, and packed textures are preserved.",
    suitability: "Static, continuous textured basketball shooter in a readable raised-ball release pose. Route-local transforms stage charge, release, airborne contest, and follow-through; no animation or controller capability is claimed."
  },
  {
    id: "rooftopAthleteDefender",
    file: "rooftopAthleteDefender.glb",
    role: "character",
    adaptation: "Derived from the same CC-BY source: the complete ball hierarchy was removed, the two arm islands were opened into an asymmetric contest V, uniform texels were recolored blue/gold, and the mesh was normalized to 1.95 m.",
    suitability: "Static, continuous textured contest defender variant with an asymmetric raised-arm silhouette. It is a visual player variant derived from the same licensed source identity; route-local contest and collision-region state remain authoritative."
  }
];

if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering acquired Rooftop athletes.");

for (const entry of entries) {
  const source = resolve(appDir, "assets/models", entry.file);
  const probe = resolve(probeDir, `${entry.id}.json`);
  if (!existsSync(source)) throw new Error(`Missing acquired athlete source: ${source}`);
  const hash = `sha256-${createHash("sha256").update(readFileSync(source)).digest("hex")}`;
  const hasProbe = existsSync(probe) && JSON.parse(readFileSync(probe, "utf8")).renderedProbe?.assetHash === hash;
  const args = [
    "assets", "add", source, "--name", entry.id, "--type", "model",
    "--license", "CC-BY-4.0", "--license-name", "Creative Commons Attribution 4.0 International", "--license-url", "https://creativecommons.org/licenses/by/4.0/",
    "--author", "3DDomino", "--source-family", "objaverse",
    "--source-page", sourcePage,
    "--source-url", sourceDownload,
    "--download-url", sourceDownload,
    "--attribution", "Basketball player by 3DDomino (CC BY 4.0); Aura3D route-local derivative",
    "--provenance-evidence", `Official Objaverse/Sketchfab source bytes were hash-verified before adaptation. ${entry.adaptation}`,
    "--retrieved-at", "2026-08-31T00:00:00.000Z", "--quality", hasProbe ? "release" : "candidate", "--role", entry.role, "--suitability", entry.suitability
  ];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  const orientation = resolve(probeDir, `${entry.id}.orientation.json`);
  if (hasProbe && existsSync(orientation)) args.push("--orientation-json", orientation);
  execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: "inherit" });
}
execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: "inherit" });
console.log(`Rooftop acquired-athlete registration complete: ${entries.map(({ id }) => id).join(", ")}`);
