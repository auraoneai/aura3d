/**
 * C-35 — ArtDirectionSnapshot and `snapshotForAudit`.
 *
 * Builds the audit snapshot from the authored scene (`AuraSceneSnapshot`), the
 * asset manifest, and `diagnostics().drawCalls`. It reads authored intent and
 * measured draw counts only, never stub-reported GPU features, so it works on
 * PR 0a stubs.
 */

import type { AuraApp, AuraSceneNode } from "@aura3d/engine-runtime";

/** One material observed on a mounted node (additive to the C-35 snapshot
 * shape: `emissive-fill` cannot be judged without it). `practical` /
 * `lightSource` mark materials the art direction counts as light sources. */
export interface ArtDirectionSnapshotMaterial {
  readonly name?: string;
  readonly node?: string;
  readonly emissiveIntensity?: number;
  readonly practical?: boolean;
  readonly lightSource?: boolean;
}

export interface ArtDirectionSnapshot {
  readonly lights: readonly { readonly type: string; readonly shadow: boolean; readonly intensity: number }[];
  readonly hasAmbient: boolean;
  readonly environment: { readonly kind: "none" | "hdri" | "preset" | "procedural"; readonly background: boolean };
  readonly models: readonly {
    readonly assetKey: string;
    readonly triangles: number;
    readonly textures: number;
    readonly unlit: boolean;
    readonly overridesTextures: boolean;
  }[];
  readonly materials?: readonly ArtDirectionSnapshotMaterial[];
  readonly drawCalls: number;
}

export interface AuraAssetManifestEntryLike {
  readonly triangles?: number;
  readonly textures?: number;
  readonly unlit?: boolean;
  readonly role?: string;
  /** Additive (beyond the C-35 record shape): set when the route re-tags a
   *  model's textures at mount time — audits as `asset-texture-override`. */
  readonly overridesTextures?: boolean;
}

/** C-35 manifest record shape: asset key → metadata. */
export interface AuraAssetManifestLike {
  readonly assets: Readonly<Record<string, AuraAssetManifestEntryLike>>;
}

/**
 * Converts the real `aura.assets.json` (whose `assets` is an array of entries
 * keyed by `id`) into the C-35 record shape `snapshotForAudit` consumes.
 * `textures` arrays are counted; `unlit` is taken from the entry or any of its
 * `materialMetadata` rows.
 */
export function assetManifestLike(manifest: unknown): AuraAssetManifestLike {
  const out: Record<string, AuraAssetManifestEntryLike> = {};
  const assets = (manifest as { assets?: unknown } | null | undefined)?.assets;
  const assign = (id: string, entry: Record<string, unknown>): void => {
    const materialMetadata = Array.isArray(entry.materialMetadata) ? entry.materialMetadata : [];
    const unlitInMaterials = materialMetadata.some(
      (m) => typeof m === "object" && m !== null && (m as { unlit?: unknown }).unlit === true
    );
    out[id] = {
      triangles: typeof entry.triangles === "number" ? entry.triangles : undefined,
      textures: Array.isArray(entry.textures) ? entry.textures.length : (typeof entry.textures === "number" ? entry.textures : undefined),
      unlit: typeof entry.unlit === "boolean" ? entry.unlit : unlitInMaterials || undefined,
      role: typeof entry.role === "string" ? entry.role : undefined,
      overridesTextures: entry.overridesTextures === true
    };
  };
  if (Array.isArray(assets)) {
    for (const entry of assets) {
      if (typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string") {
        assign((entry as { id: string }).id, entry as Record<string, unknown>);
      }
    }
  } else if (typeof assets === "object" && assets !== null) {
    for (const [id, entry] of Object.entries(assets)) {
      if (typeof entry === "object" && entry !== null) assign(id, entry as Record<string, unknown>);
    }
  }
  return { assets: out };
}

function walk(nodes: readonly AuraSceneNode[], visit: (node: AuraSceneNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.kind === "group") walk(node.children, visit);
  }
}

/** Builds the audit snapshot for a mounted (or authored, pre-mount) app. */
export function snapshotForAudit(app: AuraApp, assets: AuraAssetManifestLike): ArtDirectionSnapshot {
  const manifest = assetManifestLike(assets).assets;
  const lights: { type: string; shadow: boolean; intensity: number }[] = [];
  const models: ArtDirectionSnapshot["models"][number][] = [];
  const materials: ArtDirectionSnapshotMaterial[] = [];
  let environment: ArtDirectionSnapshot["environment"] = { kind: "none", background: false };

  walk(app.scene.nodes, (node) => {
    if (node.kind === "light") {
      lights.push({ type: node.light, shadow: node.shadow === true || (typeof node.shadow === "object" && node.shadow !== null), intensity: node.intensity });
      return;
    }
    if (node.kind === "environment") {
      environment = {
        kind: node.environment === "hdri" ? "hdri" : "preset",
        background: true
      };
      return;
    }
    if (node.kind === "model" || node.kind === "primitive") {
      const spec = node.material;
      if (spec !== undefined) {
        materials.push({
          name: spec.name,
          node: node.name,
          emissiveIntensity: spec.emissiveIntensity,
          practical: spec.practical === true
        });
      }
    }
    if (node.kind === "model") {
      const key = node.asset?.id ?? "";
      const entry: AuraAssetManifestEntryLike | undefined = key.length > 0 ? manifest[key] : undefined;
      models.push({
        assetKey: key,
        triangles: entry?.triangles ?? 0,
        textures: entry?.textures ?? 0,
        unlit: entry?.unlit ?? (node.material?.unlit === true),
        overridesTextures: entry?.overridesTextures === true || node.material?.texture !== undefined
      });
    }
  });

  let drawCalls = 0;
  if (typeof app.diagnostics === "function") {
    const diag = app.diagnostics();
    if (typeof diag.drawCalls === "number") drawCalls = diag.drawCalls;
  }

  return {
    lights,
    hasAmbient: lights.some((light) => light.type === "ambient"),
    environment,
    models,
    materials,
    drawCalls
  };
}
