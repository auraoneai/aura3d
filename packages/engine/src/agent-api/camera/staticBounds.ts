/**
 * S8 / C-9: world-space AABBs for the static scene nodes the collision probe
 * must see (Codex review on #911: the probe only enumerated `app.nodes`, i.e.
 * nodes authored with `.runtime(...)`, so ordinary primitive/model walls were
 * invisible and `collision: true` rigs passed straight through them).
 *
 * Conservative by design — a camera pulled in slightly early is acceptable, a
 * camera inside a wall is not:
 * - primitives: half-extent = size/2 × scale (box/plane/torus use the size
 *   vector, sphere/cylinder/capsule the max component); any non-zero rotation
 *   widens the box to the half-extent's bounding sphere;
 * - models: only when a target dimension (`targetMaxDimension`,
 *   `targetHeight`, `targetLength`) bounds them without loading the asset;
 *   otherwise they are skipped (asset bounds are not known to the lane);
 * - `instances` expand to one box per instance transform;
 * - nodes with a `runtime` spec are skipped here (the runtime registry
 *   already reports their live bounds), as are invisible nodes.
 * Results are cached per `nodes` array identity: scene specs are replaced,
 * not mutated, so the flatten runs once per scene rather than per frame.
 */
import type { AuraVec3 } from "../index.js";
import { flattenSceneNodes } from "./sceneNodes.js";
import type { SceneCameraNodeLike } from "./subject.js";

export interface StaticProbeBox {
  readonly id: string;
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

interface StaticNodeLike extends SceneCameraNodeLike {
  readonly primitive?: string;
  readonly size?: number | AuraVec3;
  readonly scale?: number | AuraVec3;
  readonly visible?: boolean;
  readonly instances?: readonly { readonly position?: AuraVec3; readonly rotation?: AuraVec3; readonly scale?: number | AuraVec3 }[];
  readonly targetMaxDimension?: number;
  readonly targetHeight?: number;
  readonly targetLength?: number;
}

const ROUND_SHAPES = new Set(["sphere", "cylinder", "capsule"]);

function vec3(v: number | AuraVec3 | undefined, fallback: number): AuraVec3 {
  if (typeof v === "number") return [v, v, v];
  return v ?? [fallback, fallback, fallback];
}

function baseHalfExtent(node: StaticNodeLike): AuraVec3 | undefined {
  if (node.kind === "primitive") {
    const size = vec3(node.size, 1);
    if (node.primitive && ROUND_SHAPES.has(node.primitive)) {
      const m = Math.max(Math.abs(size[0]), Math.abs(size[1]), Math.abs(size[2])) / 2;
      return [m, m, m];
    }
    return [Math.abs(size[0]) / 2, Math.abs(size[1]) / 2, Math.abs(size[2]) / 2];
  }
  if (node.kind === "model") {
    const d = node.targetMaxDimension ?? node.targetHeight ?? node.targetLength;
    if (typeof d !== "number" || !(d > 0)) return undefined;
    return [d / 2, d / 2, d / 2];
  }
  return undefined;
}

function boxFor(
  id: string,
  half: AuraVec3,
  position: AuraVec3 | undefined,
  rotation: AuraVec3 | undefined,
  scale: number | AuraVec3 | undefined
): StaticProbeBox {
  const s = vec3(scale, 1);
  let h: AuraVec3 = [half[0] * Math.abs(s[0]), half[1] * Math.abs(s[1]), half[2] * Math.abs(s[2])];
  if (rotation && (rotation[0] !== 0 || rotation[1] !== 0 || rotation[2] !== 0)) {
    const r = Math.hypot(h[0], h[1], h[2]);
    h = [r, r, r];
  }
  const p = position ?? [0, 0, 0];
  return { id, min: [p[0] - h[0], p[1] - h[1], p[2] - h[2]], max: [p[0] + h[0], p[1] + h[1], p[2] + h[2]] };
}

export function staticSceneProbeBoxes(nodes: readonly SceneCameraNodeLike[]): StaticProbeBox[] {
  const out: StaticProbeBox[] = [];
  const flat = flattenSceneNodes(nodes) as StaticNodeLike[];
  flat.forEach((node, index) => {
    if (node.runtime || node.visible === false) return;
    const half = baseHalfExtent(node);
    if (!half) return;
    const id = `static:${node.name ?? node.kind}:${index}`;
    if (node.instances && node.instances.length > 0) {
      node.instances.forEach((inst, i) => {
        const p = node.position ?? [0, 0, 0];
        const ip = inst.position ?? [0, 0, 0];
        out.push(boxFor(`${id}#${i}`, half, [p[0] + ip[0], p[1] + ip[1], p[2] + ip[2]], inst.rotation ?? node.rotation, inst.scale ?? node.scale));
      });
      return;
    }
    out.push(boxFor(id, half, node.position, node.rotation, node.scale));
  });
  return out;
}

/** Per-scene cache keyed on the `nodes` array identity. */
export function createStaticProbeBoxSource(): (nodes: readonly SceneCameraNodeLike[] | undefined) => readonly StaticProbeBox[] {
  let key: readonly SceneCameraNodeLike[] | undefined;
  let cached: readonly StaticProbeBox[] = [];
  return (nodes) => {
    if (!nodes) return [];
    if (nodes !== key) {
      key = nodes;
      cached = staticSceneProbeBoxes(nodes);
    }
    return cached;
  };
}
