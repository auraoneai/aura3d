# Splat Rush port (`Chroma Roll`): asset attribution

- `GT-Walsheim-Bold.woff2`: GT Walsheim Bold, from the AuraOne licensed font library (HUD, popups, cards).
- All 3D sky islands (`island-tree`, `island-tower`, `balloon`, `paint-pot-island`, `chroma-palette-island`, `chroma-easel-island`), pickups (`gem-rainbow`, `gem-shield`, `gem-double`, `gem-switch`), colour gates, and track props are authored procedurally in TypeScript on `@aura3d/engine` (`art/proceduralModels.ts` and `scene.ts`). The most-seen of them are drawn as Idol GLBs generated through fal from our own reference images (`apps/showcase-splat-rush-port/assets/idol/*.glb`, per-asset provenance in the matching `*.idol.json`).
