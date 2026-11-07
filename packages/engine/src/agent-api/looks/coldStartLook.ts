// 5.1 cold-start default look: a scene that authors NO look, light, environment, effect, sky or scene kit (the first
// frame an agent writes from geometry alone) gets the hero-stage defaults appended at mount. Any scene that specifies
// any of those, or any node kind this module does not know, is returned untouched (same object), so authored looks
// render exactly as before.

import type { AuraSceneNode, AuraSceneSnapshot, AuraVec3 } from "../nodes/types.js";
import { heroStage } from "./lookStage.js";

/** Node kinds that are plain geometry/structure. Anything else (light, environment, effect, look, scene kit, ...) means the scene is authored. */
const GEOMETRY_KINDS: ReadonlySet<string> = new Set(["model", "primitive", "group", "label", "interaction", "line", "points", "sprite", "batched"]);

/** `?a3d-cold-start-look=0` (URL) or `A3D_COLD_START_LOOK=0` (env) turns the default off, for A/B captures and as an escape hatch. */
export function coldStartLookEnabled(): boolean {
  try {
    if (typeof location !== "undefined" && /[?&]a3d-cold-start-look=(0|off|false)(&|$)/.test(location.search)) return false;
    if (typeof process !== "undefined" && process.env && /^(0|off|false)$/.test(process.env.A3D_COLD_START_LOOK ?? "")) return false;
  } catch {
    /* no location/process: default on */
  }
  return true;
}

/**
 * The default only applies to plain WebGL2 forward apps: the hero stage needs fog, a shadowed key and sampled studio IBL, which
 * the WebGPU, deferred/meshlet/visibility, worker and texture-residency paths do not all render. Any app that selects one of
 * those paths (or tunes the renderer in a way that implies a specific path) is left untouched.
 */
export function coldStartLookApplies(options: { readonly worker?: unknown; readonly frameMode?: unknown; readonly renderer?: unknown }): boolean {
  if (!coldStartLookEnabled()) return false;
  // Real browsers only: node, jsdom-less unit tests and benchmark harnesses that inject a renderer have no WebGL2 context class.
  if (typeof (globalThis as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext === "undefined") return false;
  if (options.worker !== undefined || options.frameMode === "async") return false;
  if (options.renderer === undefined) return true;
  const r = options.renderer as {
    readonly backend?: unknown;
    readonly qualityProfile?: unknown;
    readonly drawingPath?: unknown;
    readonly textureResidency?: unknown;
    readonly mode?: unknown;
    readonly fallback?: unknown;
    readonly requiredFeatures?: readonly unknown[];
  };
  if (r.backend !== undefined && r.backend !== "webgl2") return false;
  if (r.qualityProfile === "experimental-webgpu") return false;
  if (r.drawingPath !== undefined || r.textureResidency !== undefined) return false;
  if (r.mode === "safe-basic" || r.fallback !== undefined || (r.requiredFeatures?.length ?? 0) > 0) return false;
  return true;
}

interface Extent {
  min: [number, number, number];
  max: [number, number, number];
  count: number;
  flatFloor: boolean;
}

function scaleOf(scale: number | AuraVec3 | undefined): number {
  if (scale === undefined) return 1;
  return typeof scale === "number" ? Math.abs(scale) : Math.max(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2]));
}

/** Plain geometry (`true`) vs authored (`false`), collecting a rough world extent. Rotation is ignored: a bounding sphere is enough for lights. */
function scan(nodes: readonly AuraSceneNode[], origin: AuraVec3, scale: number, extent: Extent): boolean {
  for (const raw of nodes) {
    const node = raw as unknown as Record<string, unknown> & { kind?: string };
    if (typeof node.kind !== "string" || !GEOMETRY_KINDS.has(node.kind)) return false;
    const position = (node.position as AuraVec3 | undefined) ?? [0, 0, 0];
    const s = scale * scaleOf(node.scale as number | AuraVec3 | undefined);
    const here: AuraVec3 = [origin[0] + position[0] * scale, origin[1] + position[1] * scale, origin[2] + position[2] * scale];
    if (node.kind === "group") {
      if (typeof node.name === "string" && node.name.startsWith("aura-look:")) return false;
      if (!scan((node.children as readonly AuraSceneNode[] | undefined) ?? [], here, s, extent)) return false;
      continue;
    }
    if (node.kind === "primitive" || node.kind === "model") {
      let half = 0.5;
      let flat = false;
      if (node.kind === "primitive") {
        const size = node.size as number | AuraVec3 | undefined;
        const dims: AuraVec3 = size === undefined ? [1, 1, 1] : typeof size === "number" ? [size, size, size] : size;
        half = Math.max(...dims.map((d) => Math.abs(d))) / 2;
        flat = node.primitive === "plane" || (dims[1] < Math.max(dims[0], dims[2]) * 0.05 && Math.max(dims[0], dims[2]) * s > 6);
      } else {
        const target = [node.targetMaxDimension, node.targetLength, node.targetHeight].find((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
        half = typeof target === "number" ? target / 2 : 0.5;
      }
      const r = half * s;
      const instances = (node.instances as readonly { position?: AuraVec3 }[] | undefined) ?? [];
      const positions: AuraVec3[] = [here, ...instances.map((i) => {
        const p = i.position ?? [0, 0, 0];
        return [here[0] + p[0] * s, here[1] + p[1] * s, here[2] + p[2] * s] as AuraVec3;
      })];
      for (const p of positions) {
        for (let a = 0; a < 3; a++) {
          extent.min[a] = Math.min(extent.min[a], p[a] - r);
          extent.max[a] = Math.max(extent.max[a], p[a] + r);
        }
      }
      if (flat) extent.flatFloor = true;
      extent.count++;
    }
  }
  return true;
}

/**
 * The snapshot with hero-stage defaults appended when (and only when) it carries no authored look. Returns the same
 * object otherwise. The scene background is kept; the floor fades into it.
 */
export function withColdStartLook(snapshot: AuraSceneSnapshot): AuraSceneSnapshot {
  if (snapshot.backgroundImage !== undefined) return snapshot;
  const extent: Extent = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], count: 0, flatFloor: false };
  if (!scan(snapshot.nodes, [0, 0, 0], 1, extent) || extent.count === 0) return snapshot;
  const center: AuraVec3 = [(extent.min[0] + extent.max[0]) / 2, (extent.min[1] + extent.max[1]) / 2, (extent.min[2] + extent.max[2]) / 2];
  const radius = Math.max(0.25, Math.hypot(extent.max[0] - extent.min[0], extent.max[1] - extent.min[1], extent.max[2] - extent.min[2]) / 2);
  if (!Number.isFinite(radius) || !Number.isFinite(center[0] + center[1] + center[2])) return snapshot;
  const stage = heroStage({
    target: center,
    radius,
    background: snapshot.background,
    // The floor sits under the lowest point; a scene that already brings a ground gets lights and studio IBL only.
    floor: extent.flatFloor ? false : { y: extent.min[1] - 0.001 }
  }).toJSON();
  return { ...snapshot, nodes: [...snapshot.nodes, stage] };
}
