/**
 * Procedural model asset descriptors for Chroma Roll (`art/proceduralModels.ts` builds all floating-island
 * backdrop pieces and power-up pickups as multi-material `@aura3d/engine` geometry with zero `.glb` files).
 */
import { defineModelAssets } from "@aura3d/engine";

const LICENSE = "Procedural @aura3d/engine multi-material geometry (examples/splat-rush-port/art/proceduralModels.ts)";
const proc = (key: string, sha256: string) => ({ url: `/procedural/splat-rush/${key}`, sha256 });

export const MODELS = defineModelAssets({
  islandTree: proc("island-tree", "sha256-8857f4dcb39bd2f3d8c24adaa53dc5512e3d7e41729169a12e8b6f6243eb3723"),
  islandTower: proc("island-tower", "sha256-a38933a2a9a471772dbe35c2c0db0f0fdf4788f7e3c62643b00e2bc0b7060f0d"),
  balloon: proc("balloon", "sha256-905a8cb98fd76f3e95466e65aa819924a8605d9a0f55ababd27d636c94d0d89a"),
  paintPotIsland: proc("paint-pot-island", "sha256-e942c632cb7046cb72fb2c57bea8ffb58c5d7bbb1cdc2c4db65743e6671e7bd4"),
  paletteIsland: proc("chroma-palette-island", "sha256-bbbbb4084e86aa32998e0e805563fcfd6af6af6a00efffc483866a05084ce452"),
  easelIsland: proc("chroma-easel-island", "sha256-6f6d5f35f6a8ae63b9f37eb0be69dbe43395c944b57aac1e61518d3d2f101287"),
  gemRainbow: proc("gem-rainbow", "sha256-5533b1776bca95726dc68ace33b8b93bec11abc9bdff0c09cb73a42d596c6d35"),
  gemShield: proc("gem-shield", "sha256-f1d1c0078ebacfd434d3bd2e89543b5cc4e60f5ed73d6acbab5e73111d2b5a26"),
  gemDouble: proc("gem-double", "sha256-4234b67b834fffef6af45cae16ea3adc9a8517b2cc18ea87d02ba5528c6af333"),
  gemSwitch: proc("gem-switch", "sha256-5a761f9dd3ce48a3175f7afc7e6eccca50da25d12b2ccf77d956cd2ef94e7eba")
}, { license: LICENSE, queryParam: null }).refs;
