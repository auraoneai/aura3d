/**
 * PRD-05 lane-scene URL resolution (05-ADAPT + 05-S6).
 *
 * Two hosting modes:
 *  - "served" (default): the built benchmark dist that capture.mjs serves.
 *    Derived GLBs and HDRIs live under `/qr-assets/` (copied by the
 *    vite.config.ts plugin, #857), and three's Basis transcoder lives under
 *    `/qr-assets/basis/`.
 *  - "repo": a repo-root dev server (tests/qr/prd05 dev-server), which serves
 *    files at their repo paths.
 *
 * `sourceAssets` (05-S6) resolves each model at the optimizer's INPUT file
 * (`entry.source`) for the optimized-vs-source comparison. In "served" mode
 * the source must be in the shared benchmark table (`modelAssets`, already
 * copied into dist). A source that is not served throws instead of loading
 * something else.
 */
import { modelAssets } from "../../shared/assets";
import type { Prd05AssetEntry } from "./assets";

export type Prd05AssetPaths = "served" | "repo";

export interface Prd05UrlOptions {
  readonly sourceAssets?: boolean;
  readonly assetPaths?: Prd05AssetPaths;
}

export function prd05ModelUrl(entry: Prd05AssetEntry, options: Prd05UrlOptions = {}): string {
  const repo = options.assetPaths === "repo";
  if (options.sourceAssets !== true) return repo ? `/${entry.repoPath}` : entry.url;
  if (repo) return `/${entry.source}`;
  const served = Object.values(modelAssets).find((asset) => asset.repoPath === entry.source);
  if (!served) {
    throw new Error(`prd05 source asset ${entry.source} (${entry.id}) is not in the served benchmark table; run sourceAssets with assetPaths="repo" or add it to shared/assets.ts`);
  }
  return served.url;
}

export function prd05HdriUrl(entry: { readonly url: string; readonly repoPath: string }, options: Prd05UrlOptions = {}): string {
  return options.assetPaths === "repo" ? `/${entry.repoPath}` : entry.url;
}

/** three.js KTX2Loader transcoder directory for the hosting mode. */
export function threeBasisTranscoderPath(options: Prd05UrlOptions = {}): string {
  return options.assetPaths === "repo" ? "/node_modules/three/examples/jsm/libs/basis/" : "/qr-assets/basis/";
}
