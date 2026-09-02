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
    suitability: "Original CC0 faceted MH-2M primary readable character chassis authored at metre scale for the shared root socket envelope; chamfered shoulder pods, collar joint, chest reactor, lower skirt, and separated armor/trim/emissive materials form the continuous torso interface. Its intentionally untextured stylized flat-color materials are an explicit stylized-material rationale verified by the hash-bound root probe. This is a rigid static character module whose behavior is limited to route-local node mounting and combat transforms."
  },
  {
    slot: "arms", role: "prop",
    suitability: "Original CC0 faceted MH-2M primary modular arm module: paired shoulder, elbow, wrist, hand, and grip plates authored at metre scale around the shared chest socket; continuous +X/−X joints and separated armor/trim/emissive materials make shoulder-to-hand contact readable. Rigid route-local attachment only."
  },
  {
    slot: "legs", role: "prop",
    suitability: "Original CC0 faceted MH-2M primary readable prop leg module: paired hip, knee, piston, ankle, and planted foot assemblies authored at metre scale around the shared hips socket; the shortened depth envelope keeps both feet grounded beneath the chassis with separated armor/trim/emissive materials. Its intentionally untextured stylized flat-color materials are an explicit stylized-material rationale verified by the hash-bound root probe. Rigid route-local attachment only."
  },
  {
    slot: "weapon", role: "weapon",
    suitability: "Original CC0 faceted MH-2M readable held weapon authored at metre scale around the shared right-hand socket with declared +Z working orientation; grip, body, barrel/muzzle, mechanism, and emissive energy materials establish a continuous hand-to-muzzle contact line. Its intentionally untextured stylized flat-color materials are an explicit stylized-material rationale verified by the hash-bound root probe. Combat behavior remains route-local."
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
