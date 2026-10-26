import { defineModelAssets } from "@aura3d/engine";

/**
 * Meshy-generated models (text prompts, own words; Kiro Prism; recorded in PORTING-NOTES.md and
 * assets/provenance/). Same-origin pathname + sha256, which the production bridge requires to draw a model.
 */
const LICENSE = "Meshy generated asset (AuraOne Meshy account plan terms at generation time), original text prompt; see assets/provenance";

const meshyAsset = (file: string, sha256: string, sizeBytes: number) => ({ url: new URL(`./assets/models/${file}`, import.meta.url).pathname, sha256, sizeBytes });

export const MESHY = defineModelAssets({
  bikeRider: meshyAsset("bike_rider.glb", "14a3894bcf736861d5727871a1e226f6b070ded71caae0e71745475ebb55b90a", 2327988),
  rivalBike: meshyAsset("rival_bike.glb", "74e0fbd5bdea8b953303f305ffa77655cad65ff0588da17bd21670b086ef61ba", 2393304),
  skateRider: meshyAsset("skate_rider.glb", "a26459be6bfb6683432a5e803c562b60144527b5564454ca2b6b503f63466ee5", 1783240),
  boulderA: meshyAsset("boulder_a.glb", "73780bab5a5d5bf6f764fdad86ea9fb41272c7077e747de306c49f6b5b5df3df", 985564),
  boulderB: meshyAsset("boulder_b.glb", "d937a8f6d322e5d1227ec36672c2cae114841d3d0ca0b7249690f67b57b5e95e", 1220756),
  lander: meshyAsset("lander.glb", "0b91a90f924fb6c3247b940ac766f256dd431785ed66a8359526b3622fdb33d1", 1596388),
  observatory: meshyAsset("observatory.glb", "462c297a1030cc790c9dfc6733b595573cdba359ee6c0b5bc6ed42d20ce26f8c", 1780036),
  pylon: meshyAsset("pylon.glb", "65a69d017ee7cbf583041f1a473ab3d74ef4a9c55b79c29a74ae2481522cec30", 1072016)
}, { license: LICENSE, queryParam: null }).refs;

/** `?meshy=0` falls back to the earlier primitive riders and props (bisecting a render problem). */
export const MESHY_ENABLED = typeof location === "undefined" || new URLSearchParams(location.search).get("meshy") !== "0";

/** World size (largest bounds dimension) for the riders; `model()` grounds each model at its bounds' bottom centre. */
export const MESHY_SIZE = { bike: { target: 2.5 }, skate: { target: 1.7 } } as const;
