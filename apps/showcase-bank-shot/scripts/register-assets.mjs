/** Build and register Bank Shot's deterministic original CC0 model/audio family. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const probeDir = resolve(repoRoot, "tests/reports/showcase-release-asset-probes");
if (!existsSync(cli)) throw new Error("Build packages/aura3d-cli before registering Bank Shot assets.");

execFileSync("node", [resolve(appDir, "scripts/build-models.mjs")], { cwd: repoRoot, stdio: "inherit" });

const models = [
  {
    id: "bankShotTable",
    role: "prop",
    suitability: "Original CC0 metre-scale readable gameplay prop with tournament-blue felt, cushioned walnut rails, six pocket mouths with authored collars, and grounded legs for the fixed public Rapier play envelope."
  },
  {
    id: "bankShotCue",
    role: "prop",
    suitability: "Original CC0 metre-scale readable gameplay prop with stylized flat-color materials, a tapered shaft, tip at local origin, and +X strike orientation; posed from live aim and charge state."
  },
  ...Array.from({ length: 16 }, (_, number) => ({
    id: `bankShotBall${String(number).padStart(2, "0")}`,
    role: "prop",
    suitability: number === 0
      ? "Original CC0 unit-normalized readable cue-ball prop with stylized flat-color ivory material, scaled to a regulation 0.07 metre diameter and synchronized to its public Rapier sphere body."
      : `Original CC0 unit-normalized readable billiards-ball prop ${number} with stylized flat-color solid/stripe identity and high-contrast top number mark, scaled to a regulation 0.07 metre route diameter and synchronized to public Rapier.`
  }))
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
    "--source-page", "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-bank-shot/scripts/build-models.mjs",
    "--download-url", `https://raw.githubusercontent.com/auraoneai/aura3d/main/apps/showcase-bank-shot/assets/models/${model.id}.glb`,
    "--attribution", "Aura3D synthesis — original CC0 Bank Shot billiards family",
    "--provenance-evidence", "Deterministically generated from the in-repository Bank Shot model source in metres; table, cue, solids/stripes, and renderer-owned ball identity marks are reproducible.",
    "--retrieved-at", "2026-08-23T23:00:00.000Z",
    "--quality", hasProbe ? "release" : "candidate",
    "--role", model.role,
    "--suitability", model.suitability
  ];
  if (hasProbe) args.push("--rendered-probe-json", probe);
  execFileSync("node", [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`registered ${model.id} (${hasProbe ? "release + retained probe" : "candidate; probe pending"})`);
}

execFileSync("node", [cli, "assets", "typegen"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
console.log(`Bank Shot registration complete: ${models.length} models (audio cues now come from the shared game-sfx-core pack).`);
