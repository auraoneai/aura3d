/**
 * Lane 11 scene spec (C-30): `prd11-instancing-100k`.
 *
 * 100,000 boxes on a seeded jittered grid — non-uniform size
 * `[0.3, 0.6, 0.3]` with a random yaw — carrying per-instance colour from the
 * `instancingGrid` palette domain (HSL hue 0.50-0.72, saturation ≥ 0.25) so
 * V2's automated extent/centroid check can compare against the three.js
 * `InstancedMesh` adapter on the same seed.
 *
 * `admittedAsReference: false` — lane scenes are never reference baselines.
 */
export interface Prd11Instancing100kSpec {
  readonly kind: "prd11-instancing-100k";
  readonly itemCount: 100000;
  readonly shape: "box";
  readonly size: readonly [0.3, 0.6, 0.3];
  readonly perInstanceColor: true;
  readonly rotated: true;
  readonly seed: 0xa3d12;
  readonly qrFlags: readonly ["tiers-batching"];
  readonly admittedAsReference: false;
}

export const instancing100kSpec: Prd11Instancing100kSpec = {
  kind: "prd11-instancing-100k",
  itemCount: 100000,
  shape: "box",
  size: [0.3, 0.6, 0.3],
  perInstanceColor: true,
  rotated: true,
  seed: 0xa3d12,
  qrFlags: ["tiers-batching"],
  admittedAsReference: false
};
