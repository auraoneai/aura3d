/**
 * GU47 WP-21 BZ-04: board-formed concrete, brick, plate steel, plaster over wood and tile per floor, ambientCG CC0 sets
 * from the Aura3D library (`assets/library/textures/tiling/acg-<id>.zip`, entries in `aura.library.json`), served
 * app-locally from `public/aura-assets/textures/`. Colour maps are the 1K JPGs resized to 512 (sips -Z 512, quality 85) and normalised per channel to mean linear 0.8 (quality 88; GU47 phase 3: the 1-1.6 MB maps were still uploading at
 * the 60 s capture on software WebGL2, leaving the floor at its untextured base colour); normal maps are the 1K
 * NormalGL JPGs resized to half size (sips -Z 512, quality 88) to keep texture memory under the WP's 64 MB.
 * Provenance per file: `public/aura-assets/textures/ATTRIBUTION.md`. One repeat per 3 m cell; instance colours carry
 * only a +-6% jitter (main.ts).
 */
import type { AuraAssetRef } from "@aura3d/engine";

export const BZ_TEXTURE_SETS = [
  "concrete034",
  "bricks075a",
  "metal046b",
  "paintedplaster017",
  "wood096",
  "metal049a",
  "tiles141",
  "concrete047a",
  "metal063"
] as const;
export type BunkerTextureSet = (typeof BZ_TEXTURE_SETS)[number];

/** Source zip (library) sha256 and ambientCG id per set. */
export const BZ_TEXTURE_SOURCES: Readonly<Record<BunkerTextureSet, { readonly ambientCgId: string; readonly libraryZipSha256: string }>> = {
  "concrete034": { ambientCgId: "Concrete034", libraryZipSha256: "5839d284d94ffb8d2a56df742ec522b13dd311c52dbd42b8fd33f0409ceedb81" },
  "bricks075a": { ambientCgId: "Bricks075A", libraryZipSha256: "ebbffc63ae79060d68378cddafd7d6b659bc3e062120785d5927773c51a33214" },
  "metal046b": { ambientCgId: "Metal046B", libraryZipSha256: "b4fc855a414f7a1e415af6edaef24c0dc114f7802b3879a3db88e6ba1c97cda0" },
  "paintedplaster017": { ambientCgId: "PaintedPlaster017", libraryZipSha256: "bae0380d82b6ccac8943b4980417cb3c9de5c896218339c108056f1dfb8e886c" },
  "wood096": { ambientCgId: "Wood096", libraryZipSha256: "3aa0d5cddd866f5993c03a1a9bb036c1f7e82695cdf40f765cbea9faf91684ef" },
  "metal049a": { ambientCgId: "Metal049A", libraryZipSha256: "4f6a79e535261ab55cc6feefed0037124885720ce7b781fc2efa3fa22792af42" },
  "tiles141": { ambientCgId: "Tiles141", libraryZipSha256: "6ee56eba21592b9c02c6ee78dd93c6b585b62a2558d143d53e19457c82379d52" },
  "concrete047a": { ambientCgId: "Concrete047A", libraryZipSha256: "94e04bdf80c4fa377f8c736183963cdd911131a26673e2462495e45bf679102f" },
  "metal063": { ambientCgId: "Metal063", libraryZipSha256: "cc0a7f83d4bfd6c5d38638d17a0c214a004ccd295b8c554c959537bc278167ed" }
};

/** Shipped files: sha256, bytes and pixel size (checked by tests/unit/bunker-zero/textures.test.ts). */
export const BZ_TEXTURE_FILES = {
  "bz-bricks075a-color.jpg": { sha256: "sha256-5d66bc5221f2e268852ded1a75cfbc2c0ddefb00e07cd840fcc4d0b246973f30", bytes: 63058, size: [512, 256] },
  "bz-bricks075a-normal.jpg": { sha256: "sha256-9a11467412b630f10b8d41f12bb1218635ca704ef29a2c5548a027eb90e33520", bytes: 95514, size: [512, 256] },
  "bz-concrete034-color.jpg": { sha256: "sha256-1a479ffc30aa81c6519010ec4c79d5661cc20fa59ba90958104e188e678c480f", bytes: 25507, size: [512, 256] },
  "bz-concrete034-normal.jpg": { sha256: "sha256-912d03a9ce337f3375e47dadddcf83e1fd84be3f2065e08c44596a4ba4545409", bytes: 48338, size: [512, 256] },
  "bz-concrete047a-color.jpg": { sha256: "sha256-6115ad7f762e3446bbc31efadd5a249cb663faf93a5031e565152f00989b23b9", bytes: 115023, size: [512, 512] },
  "bz-concrete047a-normal.jpg": { sha256: "sha256-81843129a924e83041cb83a1a5d5782680400c79a3a9f4d866bd67bbe1d1b0b3", bytes: 88232, size: [512, 512] },
  "bz-metal046b-color.jpg": { sha256: "sha256-ca80e41b850c049a4a553605b0d60e2ad20323932214b54a20a84c6dd52b11de", bytes: 96954, size: [512, 512] },
  "bz-metal046b-normal.jpg": { sha256: "sha256-c2f9cf6ef3277d3363f2bd97000f1e9328ac2f55cc5ef1fb613447696f22aba2", bytes: 44952, size: [512, 512] },
  "bz-metal049a-color.jpg": { sha256: "sha256-9b289f921500267d78023abea8cde8c79582d457fa77c529a2c3fddf67a4be2b", bytes: 15880, size: [512, 512] },
  "bz-metal049a-normal.jpg": { sha256: "sha256-4b3f4a94bd85483d88bf06ea1731f92de3a34d0f5758ba9cf15395a66920881e", bytes: 5209, size: [512, 512] },
  "bz-metal063-color.jpg": { sha256: "sha256-f566ed1cda4d79841a1dc73480da1904ceea99687aebd9ffcd50ff846c869c12", bytes: 88614, size: [512, 512] },
  "bz-metal063-normal.jpg": { sha256: "sha256-c091803a1b5519da39ae0bad68ae1e92a641ef995e340ec2d67ab9cde8d68219", bytes: 5181, size: [512, 512] },
  "bz-paintedplaster017-color.jpg": { sha256: "sha256-a0d545062ef2b28bb3ca8b58eb005417779036c1be1a6ad0a225dd09a08d2b50", bytes: 19670, size: [512, 256] },
  "bz-paintedplaster017-normal.jpg": { sha256: "sha256-290b7d5dcf76b96dee95f59ab3aea75edf404eec080cb9ea9953f694bd33f8b2", bytes: 76185, size: [512, 256] },
  "bz-tiles141-color.jpg": { sha256: "sha256-08a17e78e1f374f75cc464119540585ba848ed07015a9939b2624b22e2401f3d", bytes: 73654, size: [512, 512] },
  "bz-tiles141-normal.jpg": { sha256: "sha256-fa79e074aee133c9b9cf2adec904306ccbd1440c0e92bccc9e10ad7cccc6751b", bytes: 22274, size: [512, 512] },
  "bz-wood096-color.jpg": { sha256: "sha256-1a90688dcd646d233f282fe24196ac79ddd4c8f0c44dfe7205111732a5f7bac3", bytes: 49781, size: [512, 512] },
  "bz-wood096-normal.jpg": { sha256: "sha256-f12f5a2b9d2e283cd6cca762340a8373f40b67d58a4d553f5214ceec33e54124", bytes: 20573, size: [512, 512] }
} as const;
export type BunkerTextureFile = keyof typeof BZ_TEXTURE_FILES;

const ref = (file: BunkerTextureFile): AuraAssetRef<"texture"> =>
  ({ kind: "aura-asset-ref", type: "texture", format: "jpg", url: `/aura-assets/textures/${file}`, hash: BZ_TEXTURE_FILES[file].sha256, metadata: { license: "CC0-1.0 (ambientCG)" } }) as unknown as AuraAssetRef<"texture">;

export interface BunkerTextureRefs { readonly color: AuraAssetRef<"texture">; readonly normal: AuraAssetRef<"texture"> }
export const bunkerTexture = (set: BunkerTextureSet): BunkerTextureRefs => ({
  color: ref(`bz-${set}-color.jpg` as BunkerTextureFile),
  normal: ref(`bz-${set}-normal.jpg` as BunkerTextureFile)
});

/** Wall, accent wall and floor set per floor slot (0..5 descent, 6 the Kill House). */
export const BZ_FLOOR_TEXTURES: readonly { readonly wall: BunkerTextureSet; readonly accent: BunkerTextureSet; readonly floor: BunkerTextureSet; readonly floorAlt: BunkerTextureSet | null }[] = [
  { wall: "concrete034", accent: "bricks075a", floor: "concrete047a", floorAlt: null },
  { wall: "bricks075a", accent: "concrete034", floor: "concrete047a", floorAlt: null },
  { wall: "metal063", accent: "bricks075a", floor: "concrete047a", floorAlt: "metal063" },
  { wall: "paintedplaster017", accent: "wood096", floor: "concrete047a", floorAlt: null },
  { wall: "metal049a", accent: "concrete034", floor: "metal063", floorAlt: null },
  { wall: "concrete034", accent: "wood096", floor: "concrete047a", floorAlt: null },
  { wall: "tiles141", accent: "concrete034", floor: "concrete047a", floorAlt: null }
];

/**
 * GU47 phase 3: mean linear albedo of each shipped colour map, per channel. The maps are detail maps: each channel was
 * scaled in linear light to a mean of 0.8 (bright texels clip), so the palette tone the blind panel approved carries the
 * hue and the map only adds board marks, joints and stains. The renderer multiplies material colour by the sampled map,
 * so `compensatedBase` divides the palette tone by this mean; a surface whose map has not finished uploading (software
 * WebGL2 capture, round g11p3-r1) then sits within ~20% of the textured tone instead of 2-3x brighter.
 */
export const BZ_TEXTURE_MEAN_LINEAR: Readonly<Record<BunkerTextureSet, readonly [number, number, number]>> = {
  concrete034: [0.8, 0.8, 0.8],
  bricks075a: [0.777, 0.774, 0.742],
  metal046b: [0.778, 0.777, 0.778],
  paintedplaster017: [0.799, 0.799, 0.795],
  wood096: [0.801, 0.801, 0.801],
  metal049a: [0.799, 0.799, 0.797],
  tiles141: [0.798, 0.797, 0.795],
  concrete047a: [0.79, 0.789, 0.781],
  metal063: [0.8, 0.801, 0.797]
};

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * Material colour (sRGB hex) that makes `set`'s map average to `target` (sRGB hex) times `gain` (linear), clamped to
 * white per channel (a map darker than the target leaves that channel at white, so the surface ends darker).
 */
export function compensatedBase(target: string, set: BunkerTextureSet, gain = 1): string {
  const n = parseInt(target.slice(1), 16);
  const mean = BZ_TEXTURE_MEAN_LINEAR[set];
  const ch = (v: number, i: number) => Math.round(255 * toSrgb(Math.min(1, (toLinear(v / 255) * gain) / Math.max(1e-3, mean[i]!))));
  const r = ch((n >> 16) & 255, 0), g = ch((n >> 8) & 255, 1), b = ch(n & 255, 2);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Upper bound of decoded texture memory for every set (RGBA8 plus mips, 4/3), in bytes. */
export function textureMemoryBytes(): number {
  return Object.values(BZ_TEXTURE_FILES).reduce((sum, f) => sum + Math.round(f.size[0] * f.size[1] * 4 * (4 / 3)), 0);
}
/** WP-21 texture budget. */
export const BZ_TEXTURE_BUDGET_BYTES = 64 * 1024 * 1024;
