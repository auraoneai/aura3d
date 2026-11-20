/**
 * `aura3d assets validate --pbr`: PBR_* warnings (admission/pbrStats.ts) for every GLB/glTF model in aura.assets.json,
 * or the `--asset` selection. Advisory: the warnings never change `ok`. A vehicle is a manifest role of `vehicle` or
 * `primaryVehicle`, or a vehicle word in the file, mesh or node names.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readAssetManifest } from "../asset-manifest.js";
import { formatPbrWarnings, measurePbrStats } from "./pbrStats.js";

export async function pbrValidationWarnings(projectDir: string, assetIds?: readonly string[]): Promise<string[]> {
  const manifest = readAssetManifest(projectDir);
  const wanted = assetIds ? new Set(assetIds) : undefined;
  const warnings: string[] = [];
  for (const asset of manifest.assets) {
    if (wanted && !wanted.has(asset.id)) continue;
    if (asset.type !== "model" || (asset.format !== "glb" && asset.format !== "gltf")) continue;
    const file = resolve(projectDir, asset.outputPath);
    if (!existsSync(file)) continue;
    const role = String(asset.role ?? "");
    try {
      const report = await measurePbrStats(file, { projectDir, ...(role === "vehicle" || role === "primaryVehicle" ? { vehicle: true } : {}) });
      warnings.push(...formatPbrWarnings(report.warnings, `${asset.id}: `));
    } catch (error) {
      warnings.push(`${asset.id}: PBR statistics could not be measured: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return warnings;
}
