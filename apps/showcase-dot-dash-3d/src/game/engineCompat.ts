// Glint Courier — interim adapters for engine names the public root does not export yet (EXECUTION.md, PRD D6).
// Each one is a one-line swap once the export lands.

import type { AuraSceneNode } from "@aura3d/engine";

type Vec3 = readonly [number, number, number];

export interface BoxProbeOptions {
  readonly name: string;
  readonly position: Vec3;
  readonly box: { readonly min: Vec3; readonly max: Vec3 };
  readonly resolution: 64 | 128 | 256;
  readonly intensity: number;
}

/**
 * A parallax-corrected reflection probe node, the exact literal `probes.reflection(...)` emits
 * (packages/engine/src/agent-api/nodes/probes.ts; compiled by the prd02 `probe` node handler).
 * GU47(E-G): `probes` is not exported from `@aura3d/engine` (public/index.ts); swap to
 * `probes.reflection(options)` once it is.
 */
export function boxReflectionProbe(o: BoxProbeOptions): AuraSceneNode {
  return {
    kind: "probe",
    probe: "reflection",
    name: o.name,
    options: {
      name: o.name,
      position: [...o.position],
      box: { min: [...o.box.min], max: [...o.box.max] },
      resolution: o.resolution,
      update: "once",
      blendDistance: 1,
      priority: 0,
      intensity: o.intensity
    }
  } as unknown as AuraSceneNode;
}
