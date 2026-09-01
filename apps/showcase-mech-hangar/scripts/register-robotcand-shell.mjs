/**
 * Register the reviewed CC-BY Robotcand whole-body shell used by the current
 * Mech Hangar presentation.  The MH-2M catalog remains the typed slot/socket
 * contract; this source contributes the continuous visible shell only.  A
 * hash-matching root probe is required before the shell is promoted to release.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const source = resolve(repoRoot, "public/aura-assets/robotcand.f71a4701.glb");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");
const probe = resolve(probeDir, "robotcand.json");
const orientation = resolve(probeDir, "robotcand.orientation.json");

if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Robotcand.");
if (!existsSync(source)) throw new Error(`Missing Robotcand source: ${source}`);

const hash = `sha256-${createHash("sha256").update(readFileSync(source)).digest("hex")}`;
const hasProbe = existsSync(probe) && JSON.parse(readFileSync(probe, "utf8")).renderedProbe?.assetHash === hash;
const args = [
  "assets", "add", source,
  "--name", "robotcand",
  "--type", "model",
  "--license", "CC-BY-4.0",
  "--license-name", "Creative Commons Attribution 4.0 International",
  "--license-url", "https://creativecommons.org/licenses/by/4.0/",
  "--author", "isramtz",
  "--source-family", "objaverse",
  "--source-page", "https://huggingface.co/datasets/allenai/objaverse/blob/main/glbs/000-002/21092c6569e64cc1ae1a07174a1b1786.glb",
  "--source-url", "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-002/21092c6569e64cc1ae1a07174a1b1786.glb",
  "--download-url", "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-002/21092c6569e64cc1ae1a07174a1b1786.glb",
  "--attribution", "Robotcand by isramtz (CC BY 4.0), adapted as an Aura3D Mech Hangar visual shell",
  "--provenance-evidence", "The retained Objaverse/Sketchfab source bytes are hash-bound in the root manifest. The route uses the complete textured body as a static shell; MH-2M typed weapon hardpoints and route-local combat remain separate and authoritative.",
  "--retrieved-at", "2026-06-08T01:44:54.833Z",
  "--quality", hasProbe ? "release" : "candidate",
  "--role", "character",
  "--suitability", "Continuous textured robot/mech visual shell with ceramic armor, metal mechanisms, cable details, and optic materials. Grounding, selected hardpoint mounting, build stats, and arena combat remain route-local; no modular, skinning, animation, or reusable-mech-kit capability is claimed."
];
if (hasProbe) args.push("--rendered-probe-json", probe);
if (hasProbe && existsSync(orientation)) args.push("--orientation-json", orientation);
execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
console.log(`Robotcand registration complete (${hasProbe ? "release + root probe" : "candidate; root probe pending"}): ${hash}`);
