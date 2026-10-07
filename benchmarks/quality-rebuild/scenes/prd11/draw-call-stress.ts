/**
 * Lane 11 scene spec (C-30): `prd11-draw-call-stress`.
 *
 * 5,000 static primitives in a seeded jittered grid — 6 primitive types
 * (box, sphere, cylinder, capsule, torus, plane) × 12 colours × 4 roughness
 * values — one sun, no shadows. Under `A3D_QR_TIERS_BATCHING` the content
 * keys collapse these into 24 geometry×roughness groups (colour travels as
 * per-instance data), which is the S3/S4 draw-reduction workload; flag-off
 * the same list renders one draw each.
 *
 * `admittedAsReference: false` — lane scenes are never reference baselines.
 * Determinism: both adapters use the same mulberry32 stream so the Aura and
 * three pages draw the identical composition (V3 compares them).
 */
export interface Prd11DrawCallStressSpec {
  readonly kind: "prd11-draw-call-stress";
  readonly itemCount: 5000;
  readonly primitiveTypes: readonly ["box", "sphere", "cylinder", "capsule", "torus", "plane"];
  readonly colorCount: 12;
  readonly roughnessValues: readonly [0.25, 0.5, 0.75, 0.95];
  readonly shadows: false;
  readonly seed: 0xa3d11;
  readonly qrFlags: readonly ["tiers-batching"];
  readonly admittedAsReference: false;
}

export const drawCallStressSpec: Prd11DrawCallStressSpec = {
  kind: "prd11-draw-call-stress",
  itemCount: 5000,
  primitiveTypes: ["box", "sphere", "cylinder", "capsule", "torus", "plane"],
  colorCount: 12,
  roughnessValues: [0.25, 0.5, 0.75, 0.95],
  shadows: false,
  seed: 0xa3d11,
  qrFlags: ["tiers-batching"],
  admittedAsReference: false
};
