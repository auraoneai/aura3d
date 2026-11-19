/**
 * Craterline GP Idol bikes (rider-less, wheel-less generations): measured points of each normalised GLB (metres, facing
 * +Z, grounded at y = 0), as `[y, z]`. Hubs: the round end of the fork legs (front) and of the swingarm (rear), from the
 * lowest geometry at each end of the side silhouette. Saddle and grips are shared values measured across the six bodies
 * (saddle top centre-line low point; clip-on grip ends, half-width `gripHalfX`). They drive `bikeBodyTransform` (hubs onto
 * the rig's spinning wheels) and `bikeRiderFrame` (where the rigged rider sits and holds the bars) in `idolModels.ts`.
 */
export type IdolBikeKey = "cgBikeAlabasterNR" | "cgBikeCobaltNR" | "cgBikeCrimsonNR" | "cgBikeVioletNR" | "cgBikeTealNR" | "cgBikeSandNR2";

export const IDOL_BIKE_HUBS: Readonly<Record<IdolBikeKey, { readonly front: readonly [number, number]; readonly rear: readonly [number, number] }>> = {
  cgBikeAlabasterNR: { front: [0.255, 0.886], rear: [0.157, -0.877] },
  cgBikeCobaltNR: { front: [0.284, 0.911], rear: [0.188, -0.839] },
  cgBikeCrimsonNR: { front: [0.269, 0.853], rear: [0.21, -0.759] },
  cgBikeVioletNR: { front: [0.239, 0.817], rear: [0.157, -0.783] },
  cgBikeTealNR: { front: [0.214, 0.883], rear: [0.193, -0.841] },
  cgBikeSandNR2: { front: [0.229, 0.884], rear: [0.19, -0.854] }
};

/** Saddle (top of the seat) and grip points shared by the six bodies, GLB space `[y, z]`; grips sit at +-gripHalfX. */
export const IDOL_BIKE_SEAT = { saddle: [0.72, -0.35] as const, grip: [0.77, 0.4] as const, gripHalfX: 0.28 };
