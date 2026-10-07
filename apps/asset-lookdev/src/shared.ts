/**
 * Shared look-dev stage math + view tables — identical staging across the
 * Aura and three adapters (§6.7). Pure functions; capture.mjs duplicates the
 * tiny camera math it needs in Node.
 */

/** §6.7 shader-debug view list order for the contact/debug sheets. */
export interface LookdevRequest {
  readonly glb: string;
  /** Content hash for manifest-provenance (production bridge rejects hashless inline models). */
  readonly hash?: string;
  readonly engine: "aura" | "three";
  readonly cam: readonly [number, number, number, number, number, number];
  readonly fov: number;
  readonly radius: number;
  readonly hdri: string;
  readonly debug: string | null;
  readonly pixelRatio: number;
  readonly lod: number;
}

/**
 * Debug views that map to `u_prd05DebugView` channels on the Aura adapter.
 * The material channels (baseColor/normal/roughness/metallic/occlusion)
 * ride lane 05's own chunk — lane 04's `a3d_prd04_debug_view` defines
 * `a3dPrd04DebugView` but never invokes it on the generated path (Q-05-9).
 */
export const PRD05_DEBUG_VIEWS = new Set([
  "texelDensity", "mipLevel", "facet", "lodLevel",
  "baseColor", "normal", "roughness", "metallic", "occlusion", "uvLayout",
  "worldNormal", "uv0"
]);

/** Stage/capture names → `prd05.debugView` channel names (same view, alias). */
export const PRD05_DEBUG_VIEW_ALIASES: Readonly<Record<string, string>> = {
  worldNormal: "normal",
  uv0: "uvLayout"
};

export function parseLookdevRequest(search: string): LookdevRequest {
  const params = new URLSearchParams(search);
  const glb = params.get("glb");
  if (!glb) throw new Error("missing ?glb=<url>");
  const engine = params.get("engine") === "three" ? "three" : "aura";
  const camParts = (params.get("cam") ?? "4,3,4,0,0.5,0").split(",").map(Number);
  if (camParts.length !== 6 || camParts.some((v) => !Number.isFinite(v))) {
    throw new Error("bad ?cam=px,py,pz,tx,ty,tz");
  }
  return {
    glb,
    hash: params.get("gh") ?? undefined,
    engine,
    cam: camParts as [number, number, number, number, number, number],
    fov: readFloat(params, "fov", 30),
    radius: readFloat(params, "radius", 1),
    hdri: params.get("hdri") ?? "studio-soft",
    debug: params.get("debug"),
    pixelRatio: readFloat(params, "dpr", 1),
    lod: readFloat(params, "lod", 0)
  };
}

function readFloat(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
