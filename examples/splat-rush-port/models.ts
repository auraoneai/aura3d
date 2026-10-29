/**
 * Meshy-generated toy-style models (text prompts, Kiro Prism) used only as presentation: the floating-island
 * backdrop and the four power-up pickups. Same-origin pathnames + sha256 hashes: the production bridge refuses
 * http(s) model URLs and would draw nothing. Prompts and task ids: PORTING-NOTES.md and assets/provenance/.
 * Textures are 512 px (backdrop) and 256 px (pickups) since the C11 audit fix: the models sit 19-40 units off the road or
 * are at most 2.1 units tall, and the 1024 px maps cost 111 MB of texture memory. Geometry is byte-identical.
 */
import { defineModelAssets } from "@aura3d/engine";

const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time), original text prompt, 2026-10-23";
const glb = (file: string, sha256: string) => ({ url: new URL(`./assets/models/${file}`, import.meta.url).pathname, sha256 });

export const MODELS = defineModelAssets({
  islandTree: glb("island-tree.glb", "sha256-8857f4dcb39bd2f3d8c24adaa53dc5512e3d7e41729169a12e8b6f6243eb3723"),
  islandTower: glb("island-tower.glb", "sha256-a38933a2a9a471772dbe35c2c0db0f0fdf4788f7e3c62643b00e2bc0b7060f0d"),
  balloon: glb("balloon.glb", "sha256-905a8cb98fd76f3e95466e65aa819924a8605d9a0f55ababd27d636c94d0d89a"),
  gemRainbow: glb("gem-rainbow.glb", "sha256-5533b1776bca95726dc68ace33b8b93bec11abc9bdff0c09cb73a42d596c6d35"),
  gemShield: glb("gem-shield.glb", "sha256-f1d1c0078ebacfd434d3bd2e89543b5cc4e60f5ed73d6acbab5e73111d2b5a26"),
  gemDouble: glb("gem-double.glb", "sha256-4234b67b834fffef6af45cae16ea3adc9a8517b2cc18ea87d02ba5528c6af333"),
  gemSwitch: glb("gem-switch.glb", "sha256-5a761f9dd3ce48a3175f7afc7e6eccca50da25d12b2ccf77d956cd2ef94e7eba")
}, { license: LICENSE, queryParam: null }).refs;
