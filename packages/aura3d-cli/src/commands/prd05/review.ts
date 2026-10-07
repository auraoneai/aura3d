/**
 * `aura3d assets review <id> --judge human|vision-model --judge-id <id>
 * --score N --axes k=v,... --notes "..." [--verdict accept|reject]`
 *
 * Appends a C-32-shaped review to the entry's `lookDev.reviews` bound to the
 * derived (or source) hash (PRD-05 §6.4 G9 record; §7.1).
 */

import { resolve } from "node:path";
import { readAssetManifest, writeAssetManifest, writeTypedAssets } from "../../asset-manifest.js";
import type { AuraCliLookDevRecordDetail } from "../../asset-core-types.js";

export interface ReviewOptions {
  readonly projectDir: string;
  readonly assetId: string;
  readonly judge: "human" | "vision-model";
  readonly judgeId: string;
  readonly reviewer: string;
  readonly score?: number;
  readonly axes?: Readonly<Record<string, number>>;
  readonly notes: string;
  readonly verdict?: "accept" | "reject";
}

export function reviewAsset(options: ReviewOptions): { readonly ok: boolean; readonly wroteManifest: boolean; readonly message: string } {
  const projectDir = resolve(options.projectDir);
  const manifest = readAssetManifest(projectDir);
  const entry = manifest.assets.find((asset) => asset.id === options.assetId);
  if (!entry) return { ok: false, wroteManifest: false, message: `Asset "${options.assetId}" is not in the manifest.` };
  const boundHash = entry.derived?.hash ?? entry.hash;
  const verdict = options.verdict ?? ((options.score ?? 0) >= 6.5 ? "accept" : "reject");
  const previous: AuraCliLookDevRecordDetail = entry.lookDev ?? { runUrl: "", reviews: [] };
  const lookDev: AuraCliLookDevRecordDetail = {
    ...previous,
    derivedHash: boundHash,
    reviews: [
      ...previous.reviews,
      {
        reviewer: options.reviewer,
        verdict,
        notes: options.notes,
        at: new Date().toISOString(),
        judge: { kind: options.judge, id: options.judgeId },
        ...(options.score !== undefined ? { score: options.score } : {}),
        ...(options.axes !== undefined ? { axes: options.axes } : {}),
      },
    ],
  };
  const next = { ...manifest, assets: manifest.assets.map((asset) => (asset.id === entry.id ? { ...asset, lookDev } : asset)) };
  writeAssetManifest(projectDir, next);
  writeTypedAssets(projectDir, next);
  return { ok: true, wroteManifest: true, message: `${entry.id}: recorded ${verdict} review by ${options.reviewer} bound to ${boundHash.slice(0, 15)}.` };
}
