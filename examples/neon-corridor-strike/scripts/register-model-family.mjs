#!/usr/bin/env node
/** Register the Blender-authored Neon containment model family through the CLI. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const probeDir = resolve(repoRoot, "tests/reports/neon-corridor-strike/release-asset-probes");

const models = [
  ["neonCorridorContainmentWorld", "world", "Continuous 22 metre original CC0 Blender-authored containment world with beveled blue-steel shell, connected bronze structure and conduits, layered recessed bays, installed machinery and combat anchors, ceiling frames, and a modeled exit bulkhead. Its intentionally untextured stylized solid-material separation keeps the route-scale footprint readable; collision, triggers, hitscan, and movement stay route-local."],
  ["neonContainmentPulseRifle", "weapon", "Original CC0 Blender-authored hard-surface containment pulse weapon with beveled charcoal receiver, machined rail, bronze heat ribs, cobalt capacitors, grip, stock, and charged bore. Its intentionally untextured stylized solid materials preserve a readable held silhouette and +Y-up/+Z-forward orientation; route-local hitscan and effects remain gameplay authority."],
  ["neonContainmentWardenA", "character", "Original CC0 Blender-authored rigid breacher character with readable +Y-up/+Z-forward orientation, beveled biped armor, helmet and slit visor, layered chest glacis, articulated-looking arm and leg assemblies, grounded feet, and exposed joints. Intentionally untextured stylized solid materials separate its armor and joints at route scale. This entry is rigid presentation geometry only; route-local enemy movement, damage, and reactions remain authoritative."],
  ["neonContainmentWardenB", "character", "Original CC0 Blender-authored rigid elite manta character with readable +Y-up/+Z-forward orientation, broad swept wings, forked steel tips, central and wing turbines, dorsal command fin, three optics, talons, and grounded claws. Intentionally untextured stylized solid materials separate its armor, turbines, and threat plates at route scale. This entry is rigid presentation geometry only; route-local enemy movement, damage, and reactions remain authoritative."]
];
for (const [id, role, suitability] of models) {
  const source = `assets/models/${id}.glb`;
  const sourceHash = `sha256-${createHash("sha256").update(readFileSync(resolve(appDir, source))).digest("hex")}`;
  const probe = resolve(probeDir, `${id}.json`);
  const hasProbe = existsSync(probe) && JSON.parse(readFileSync(probe, "utf8")).renderedProbe?.assetHash === sourceHash;
  const args = [cli, "assets", "add", source, "--name", id, "--type", "model",
    "--license", "CC0-1.0", "--license-name", "CC0 1.0 Universal", "--license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
    "--author", "Aura3D synthesis", "--source-family", "aura3d-original",
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/examples/neon-corridor-strike/scripts/build-model-family-blender.py",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/examples/neon-corridor-strike/assets/models/${id}.glb`,
    "--attribution", "Aura3D synthesis — original CC0 Neon Corridor containment model family",
    "--provenance-evidence", "Authored through the committed Blender 5.2 hard-surface builder; applied bevel geometry, material-separated merged meshes, metre scale, and final hash are reproducible. The rigid assets intentionally contain no clips or skins.",
    "--retrieved-at", "2026-08-31T03:00:00.000Z", "--quality", hasProbe ? "release" : "candidate", "--role", role, "--suitability", suitability
  ];
  if (hasProbe) {
    args.push("--rendered-probe-json", probe);
    const orientation = resolve(probeDir, `${id}.orientation.json`);
    if (existsSync(orientation)) args.push("--orientation-json", orientation);
  }
  execFileSync("node", args, { cwd: appDir, stdio: "inherit" });
}
console.log(`Registered ${models.length} original CC0 Neon containment assets through the local typed manifest.`);
