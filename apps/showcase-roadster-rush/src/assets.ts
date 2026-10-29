import { defineAuraAssets, type AuraAssetDefinition, type AuraAssetMap } from "@aura3d/engine";

type ModelAsset = AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number] };

const glb = (file: string, hash: string, bounds: readonly [number, number, number], sizeBytes: number): ModelAsset =>
  ({
    type: "model", format: "glb", url: `/aura-assets/${file}`, hash: `sha256-${hash}`, bounds, sizeBytes,
    metadata: { animations: [], provenance: { sourcePath: `public/aura-assets/${file}` } }
  }) as unknown as ModelAsset;

/**
 * The models Apex Overdrive loads from public/aura-assets, as standalone definitions (same files, hashes and bounds as the
 * typed root manifest). Importing these instead of the repository-root `src/aura-assets.ts` keeps the 2.6 MB shared catalog
 * (and its dead URLs) out of this page's bundle (audit RH-06). The traffic and hero models are the Meshy set in
 * meshy-vehicles.ts; the roadsterRush* car models below are the `?models=0` fallbacks.
 */
const definitions = {
  roadsterRushSedan: glb("roadsterRushSedan.86311da3.glb", "1844d9abc80de9e94cb0851a585ea65aa441b1eeccc6066e58ca9950fadee254", [1.9, 1.43, 4.64], 664780),
  roadsterRushHatch: glb("roadsterRushHatch.44325593.glb", "30c773f5e074468d052897d63a238c776405205b5d0cbf13c4d1a07d2c5157ac", [1.82, 1.47, 4.04], 664780),
  roadsterRushSuv: glb("roadsterRushSuv.8be3e7ea.glb", "65f825848d2bcd830ef6c79e23d75a193df2dbd3f7523f080ff53b8129499244", [2, 1.82, 4.94], 664780),
  roadsterRushTaxi: glb("roadsterRushTaxi.0a1f7ba6.glb", "5ca742f77a4c93e505f59369c06c5cb448ba82b7f2ece97a704d14e23fe7d45b", [1.92, 1.63, 4.74], 664780),
  roadsterRushVan: glb("roadsterRushVan.b8e0e67d.glb", "ef6cd5a792602fd8b7d6841b0b28066687e87c011c8c914c4f136cc09edc3395", [2.06, 2.2, 5.34], 664780),
  roadsterRushPickup: glb("roadsterRushPickup.90049094.glb", "c74e3aef84613f658e4c340461d6b6a4b7e85a7152eb84761d63ff8439a49a99", [2.02, 1.77, 5.58], 664780),
  roadsterRushBoxtruck: glb("roadsterRushBoxtruck.9573d451.glb", "beb356f929dac3de89d8d71a04a1106d0cab8ff14c337a139a4c65661316cedb", [2.43, 3, 8.14], 664780),
  roadsterRushBus: glb("roadsterRushBus.9fd16d90.glb", "1618d848bbe68977143b2dab6012fa02f25b169fcd14fe0e4c528503eb1f6168", [2.6, 3.16, 12.22], 664780),
  roadsterRushCarrier: glb("roadsterRushCarrier.de50f36f.glb", "73ce0880680c5b12a4e3855bc26e8a1cd939d78c1ec6244a5e71e2360bcd04a3", [2.61, 2.98, 16.12], 664780),
  roadsterRushPlayerCar: glb("roadsterRushPlayerCar.c7f9617d.glb", "e97ea46a364607f0e45cca7bcb8e95b5f909d62a427447f18822647747e0953e", [2.23, 1.27, 4.3], 2260208),
  roadsterRushSkyCar: glb("roadsterRushSkyCar.295dcba7.glb", "b60183eae657d723efa31ffd8e0fad85962cf1b06c1d99b78250d369db406ce7", [2.23, 1.27, 4.3], 2260276),
  showcaseModernBuildingOne: glb("showcaseModernBuildingOne.d3216bb2.glb", "d3216bb2d6d73964a5e9ec6dc888ea0bbe68eeb2d20921902d67e7f2e4a1ab1d", [1231.446, 1318.901, 1372.78], 347940)
} as const;

export const assets: AuraAssetMap<typeof definitions> = defineAuraAssets(definitions as never) as AuraAssetMap<typeof definitions>;

/** Files a remote run must ship (`PUBLIC_ASSETS`). */
export const ROADSTER_PUBLIC_FILES = Object.values(definitions).map((a) => a.url.replace("/aura-assets/", ""));

