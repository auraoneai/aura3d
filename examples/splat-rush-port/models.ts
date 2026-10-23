/**
 * Meshy-generated toy-style models (text prompts, Kiro Prism) used only as presentation: the floating-island
 * backdrop and the four power-up pickups. Same-origin pathnames + sha256 hashes: the production bridge refuses
 * http(s) model URLs and would draw nothing. Prompts and task ids: PORTING-NOTES.md and assets/provenance/.
 */
import { defineAuraAssets } from "@aura3d/engine";

const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time), original text prompt, 2026-10-23";
const glb = (file: string, hash: string) => ({
  type: "model" as const,
  format: "glb" as const,
  url: new URL(`./assets/models/${file}`, import.meta.url).pathname,
  hash,
  metadata: { license: LICENSE }
});

export const MODELS = defineAuraAssets({
  islandTree: glb("island-tree.glb", "sha256-d3a080c13dfa4ef87ea68bc1b6cc45a6b2bc914dd1938567265abcd3f2010bf3"),
  islandTower: glb("island-tower.glb", "sha256-c9f7757b2c329c09b137b93f29b99790139c72785c358a3c7ad706a30f56a04a"),
  balloon: glb("balloon.glb", "sha256-86dad589a3e8943a77ee799d70a066ab40ff70d6887f676e1434b33283e071bf"),
  gemRainbow: glb("gem-rainbow.glb", "sha256-4040b7a74cd8e12fce132bf8c6f79c5c2f5da1ef2c18764381f5c371597c4c02"),
  gemShield: glb("gem-shield.glb", "sha256-576a6b18b040bd3e9e50b50919261012713fbef3bb628da795023b2f506b37d5"),
  gemDouble: glb("gem-double.glb", "sha256-35932e796e152d7eaefcdc1ee72c2927be62344575b263bb7b7afeb6a81fe07c"),
  gemSwitch: glb("gem-switch.glb", "sha256-5360e943f2e05e68f3c3d983fadef1fed08a98fe75df9bc0a2afd73542ee0099")
});
