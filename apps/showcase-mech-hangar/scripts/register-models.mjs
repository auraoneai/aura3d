/** Register the deterministic MH-2M part family in the root typed asset map. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const reportDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");

if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Mech Hangar models.");

execFileSync("node", [resolve(appDir, "scripts/build-models.mjs")], { cwd: repoRoot, stdio: "inherit" });

const definitions = [
  {
    slot: "chassis", role: "character",
    suitability: "Original CC0 stylized flat-color primary mech character torso authored at metre scale for the MH-2M root/chest socket envelope; readable cockpit, shoulder, armor, and reactor materials are hash-bound by the retained root render probe. This is a rigid static torso whose behavior is limited to route-local node mounting and combat transforms."
  },
  {
    slot: "arms", role: "prop",
    suitability: "Original CC0 stylized flat-color primary modular mech prop: a paired shoulder-to-hand assembly authored at metre scale around the MH-2M chest socket; readable armor, joint, and identity materials are hash-bound by the retained root render probe. Rigid route-local attachment only."
  },
  {
    slot: "legs", role: "prop",
    suitability: "Original CC0 stylized flat-color primary modular mech prop: a paired hip-to-foot assembly authored at metre scale around the MH-2M hips socket; readable feet, joints, and armor materials are hash-bound by the retained root render probe. Rigid route-local attachment only."
  },
  {
    slot: "weapon", role: "weapon",
    suitability: "Original CC0 stylized flat-color readable held mech weapon authored at metre scale around the MH-2M right-hand socket with declared +Z working orientation; body, mechanism, and energy materials are hash-bound by the retained root render probe. Combat behavior remains route-local."
  }
];

for (const definition of definitions) {
  for (let index = 0; index < 4; index += 1) {
    const letter = String.fromCharCode(65 + index);
    const id = `mech${definition.slot[0].toUpperCase()}${definition.slot.slice(1)}${letter}`;
    const source = resolve(appDir, `assets/models/${id}.glb`);
    const probe = resolve(reportDir, `${id}.json`);
    const hasProbe = existsSync(probe);
    const args = [
      "assets", "add", source,
      "--name", id,
      "--type", "model",
      "--license", "CC0-1.0",
      "--license-name", "CC0 1.0 Universal",
      "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
      "--author", "Aura3D synthesis",
      "--source-family", "aura3d-original",
      "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-mech-hangar/scripts/build-models.mjs",
      "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-mech-hangar/assets/models/${id}.glb`,
      "--attribution", "Aura3D synthesis — original CC0 MH-2M modular mech family",
      "--provenance-evidence", "Deterministically generated from the in-repository build-models.mjs source; GLB extras bind family, slot, variant, units, axes, origin, and compatible socket.",
      "--retrieved-at", "2026-08-23T22:00:00.000Z",
      "--quality", hasProbe ? "release" : "candidate",
      "--role", definition.role,
      "--suitability", definition.suitability
    ];
    if (hasProbe) args.push("--rendered-probe-json", probe);
    execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
    console.log(`registered ${id} (${hasProbe ? "release + probe" : "candidate; probe pending"})`);
  }
}

execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
