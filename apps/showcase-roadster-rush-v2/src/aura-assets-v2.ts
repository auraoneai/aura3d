import { defineAuraAssets } from "@aura3d/engine";

/**
 * Local typed assets for Apex Overdrive v2. The 11 freeway vehicles and the
 * building tile are the original Roadster Rush GLBs, copied into this app's
 * own public/ tree. The `apex` entries are Meshy generations (see
 * artifacts/meshy/apex-* rights.json); a missing file degrades gracefully at
 * load so the route still runs on the catalog fleet alone.
 */
const glb = (name: string, bounds: readonly [number, number, number], hash: string) =>
  ({
    type: "model",
    format: "glb",
    url: `/aura-assets/${name}.glb`,
    hash,
    bounds
  }) as const;

const tex = (name: string) =>
  ({
    type: "texture",
    format: "jpg",
    url: `/roadster-rush/textures/${name}.jpg`,
    bounds: [1, 1, 1]
  }) as const;

export const assetsV2 = defineAuraAssets({
  playerInterceptor: glb("roadsterRushPlayerCar", [2.23, 1.27, 4.3], "sha256-e97ea46a"),
  skyCar: glb("roadsterRushSkyCar", [2.23, 1.27, 4.3], "sha256-b60183ea"),
  sedan: glb("roadsterRushSedan", [1.9, 1.43, 4.64], "sha256-1844d9ab"),
  hatch: glb("roadsterRushHatch", [1.82, 1.47, 4.04], "sha256-30c773f5"),
  suv: glb("roadsterRushSuv", [2, 1.82, 4.94], "sha256-65f82584"),
  taxi: glb("roadsterRushTaxi", [1.92, 1.63, 4.74], "sha256-5ca742f7"),
  van: glb("roadsterRushVan", [2.06, 2.2, 5.34], "sha256-ef6cd5a7"),
  pickup: glb("roadsterRushPickup", [2.02, 1.77, 5.58], "sha256-c74e3aef"),
  boxtruck: glb("roadsterRushBoxtruck", [2.43, 3, 8.14], "sha256-beb356f9"),
  bus: glb("roadsterRushBus", [2.6, 3.16, 12.22], "sha256-1618d848"),
  carrier: glb("roadsterRushCarrier", [2.61, 2.98, 16.12], "sha256-73ce0880"),
  building: glb("showcaseModernBuildingOne", [1231.446, 1318.901, 1372.78], "sha256-d3216bb2"),
  // Meshy hero assets — bounds measured by `aura3d assets inspect`.
  apexInterceptor: glb("apex-interceptor", [1.903, 0.42, 1.238], "sha256-ece0aa99"),
  apexRival: glb("apex-rival-skycar", [1.902, 0.448, 1.494], "sha256-a07f076d"),
  apexBlimp: glb("apex-holo-blimp", [1.903, 0.687, 0.585], "sha256-fdd75178"),
  apexGunship: glb("apex-gunship", [1.903, 0.816, 1.063], "sha256-7f87f04a"),
  billboard0: tex("billboard_0"),
  billboard1: tex("billboard_1"),
  billboard2: tex("billboard_2"),
  billboard3: tex("billboard_3")
});

export type AssetKey = keyof typeof assetsV2;
