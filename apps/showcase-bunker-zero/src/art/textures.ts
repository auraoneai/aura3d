/**
 * GU47 WP-21 BZ-04: board-formed concrete, brick, plate steel, plaster over wood and tile per floor, ambientCG CC0 sets
 * from the Aura3D library (`assets/library/textures/tiling/acg-<id>.zip`, entries in `aura.library.json`), served
 * app-locally from `public/aura-assets/textures/`. Colour maps are the 1K JPGs resized to 512 (sips -Z 512, quality 85; GU47 phase 3: the 1-1.6 MB maps were still uploading at
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
  "bz-bricks075a-color.jpg": { sha256: "sha256-fca4a977fb98eb79580b63f81a1e8f3c467e3243f835a81344ca28d1fff7efb7", bytes: 75499, size: [512, 256] },
  "bz-bricks075a-normal.jpg": { sha256: "sha256-9a11467412b630f10b8d41f12bb1218635ca704ef29a2c5548a027eb90e33520", bytes: 95514, size: [512, 256] },
  "bz-concrete034-color.jpg": { sha256: "sha256-05898d31389d7909aab5e645d9d86237decc1aea3f806901cb22637ee338c067", bytes: 32552, size: [512, 256] },
  "bz-concrete034-normal.jpg": { sha256: "sha256-912d03a9ce337f3375e47dadddcf83e1fd84be3f2065e08c44596a4ba4545409", bytes: 48338, size: [512, 256] },
  "bz-concrete047a-color.jpg": { sha256: "sha256-fab4e626408ec31edbac64b17f0af6fb15a280464add51e52d36f5a0b9e76e3b", bytes: 133709, size: [512, 512] },
  "bz-concrete047a-normal.jpg": { sha256: "sha256-81843129a924e83041cb83a1a5d5782680400c79a3a9f4d866bd67bbe1d1b0b3", bytes: 88232, size: [512, 512] },
  "bz-metal046b-color.jpg": { sha256: "sha256-5315f0cf09cf58c9f7f2df2de6d8f0d1f8b4630c8c4b205e5c8299ea454ef8d9", bytes: 91310, size: [512, 512] },
  "bz-metal046b-normal.jpg": { sha256: "sha256-c2f9cf6ef3277d3363f2bd97000f1e9328ac2f55cc5ef1fb613447696f22aba2", bytes: 44952, size: [512, 512] },
  "bz-metal049a-color.jpg": { sha256: "sha256-3254e8c211d50a11c488f167087493eca85aee872943103213814a16d8a23782", bytes: 24088, size: [512, 512] },
  "bz-metal049a-normal.jpg": { sha256: "sha256-4b3f4a94bd85483d88bf06ea1731f92de3a34d0f5758ba9cf15395a66920881e", bytes: 5209, size: [512, 512] },
  "bz-metal063-color.jpg": { sha256: "sha256-bed6f254a766c5ff2fc6e1dd4b04a6af9193de9d16da59a8b34c9298c12825f5", bytes: 91386, size: [512, 512] },
  "bz-metal063-normal.jpg": { sha256: "sha256-c091803a1b5519da39ae0bad68ae1e92a641ef995e340ec2d67ab9cde8d68219", bytes: 5181, size: [512, 512] },
  "bz-paintedplaster017-color.jpg": { sha256: "sha256-51f30dc46b423745874bb5c109afa97b1ce3fe3000e12cf35bb3e9293c613104", bytes: 25874, size: [512, 256] },
  "bz-paintedplaster017-normal.jpg": { sha256: "sha256-290b7d5dcf76b96dee95f59ab3aea75edf404eec080cb9ea9953f694bd33f8b2", bytes: 76185, size: [512, 256] },
  "bz-tiles141-color.jpg": { sha256: "sha256-9c28d1c8d3ede29e76392ff14ab7b36d99fa17c527f7dd06b722fccfcbd78b8d", bytes: 103440, size: [512, 512] },
  "bz-tiles141-normal.jpg": { sha256: "sha256-fa79e074aee133c9b9cf2adec904306ccbd1440c0e92bccc9e10ad7cccc6751b", bytes: 22274, size: [512, 512] },
  "bz-wood096-color.jpg": { sha256: "sha256-820c9d59d1a50ec9b6f53d01b7c68574e5135256e0c55d06dbe23d96a311f1d7", bytes: 58353, size: [512, 512] },
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
 * GU47 phase 3: mean linear albedo of each colour map (256x256 resample of the shipped JPG, per channel). The renderer
 * multiplies material colour by the sampled map, so a material colour of `target / mean` puts the textured surface at the
 * palette tone the blind panel approved while the map adds the board marks, joints and stains. Metal046B (mean 0.05)
 * cannot reach any palette tone and is no longer mapped to a wall slot.
 */
export const BZ_TEXTURE_MEAN_LINEAR: Readonly<Record<BunkerTextureSet, readonly [number, number, number]>> = {
  concrete034: [0.482, 0.482, 0.482],
  bricks075a: [0.273, 0.232, 0.161],
  metal046b: [0.05, 0.05, 0.05],
  paintedplaster017: [0.515, 0.519, 0.496],
  wood096: [0.457, 0.342, 0.235],
  metal049a: [0.972, 0.963, 0.923],
  tiles141: [0.654, 0.598, 0.547],
  concrete047a: [0.282, 0.245, 0.173],
  metal063: [0.158, 0.155, 0.146]
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
