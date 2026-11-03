import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  glbSwatch: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyCarKitSedanSports.2889c428.glb",
    bounds: [2, 2, 2.55],
    hash: "sha256-2889c428ca1dd9c975c3ff760eb8757883490410555ab60b818f712f583826d6",
    integrity: { version: 1, digest: "sha256-2889c428ca1dd9c975c3ff760eb8757883490410555ab60b818f712f583826d6", dependencies: { "Textures/colormap.png": "sha256-f3622a03a20c6696065cae9cbe391351be873508af190c2ebd1d420c055787a5" }, requireDependencies: true },
    metadata: {
      materials: ["colormap"],
      animations: [],
      textures: []
    }
  }
} as const);
