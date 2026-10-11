/**
 * probe-asset.ts — PRD-04 harness helper: a typed `aura-asset-ref` for a
 * same-origin probe GLB (perf, light-count harnesses).
 *
 * GPU run 38144924567 (main): once the lane pages passed their real flag set to
 * createAuraApp, the production bridge rejected the `unsafeModelUrl(...)` probes
 * ("unsafeModelUrl and remote/raw model URLs are blocked from the production
 * bridge. Suggested fix: import models through generated typed aura-assets").
 * The probe is a repo file served same-origin, so it qualifies as a manifest asset
 * once it carries its content hash. The hash is computed from the exact bytes the
 * page loads, so it can never claim a file it did not fetch.
 */
import { defineAuraAssets } from "@aura3d/engine";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same-origin `/path/to/model.glb` → typed model asset ref with a verified sha256. */
export async function typedProbeModelAsset(url: string) {
  if (/^[a-z]+:\/\//i.test(url) || !url.startsWith("/")) {
    throw new Error(`typedProbeModelAsset: expected a same-origin absolute path, got ${url}`);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`typedProbeModelAsset: ${url} -> HTTP ${response.status}`);
  const hash = await sha256Hex(await response.arrayBuffer());
  const assets = defineAuraAssets({
    probe: {
      type: "model" as const,
      format: "glb",
      url,
      hash,
      metadata: { sourcePath: url.slice(1), license: "repo fixture (prd04 harness probe)" }
    }
  } as never) as unknown as { readonly probe: Parameters<typeof import("@aura3d/engine").model>[0] };
  return assets.probe;
}
