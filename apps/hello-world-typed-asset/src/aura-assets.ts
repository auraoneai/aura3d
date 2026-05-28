import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  robot: {
    type: "model",
    format: "gltf",
    url: "/apps/hello-world-typed-asset/robot-fixture.gltf",
    bounds: [1, 1.6, 0.8],
    hash: "sha256-example-robot-fixture",
    metadata: {
      materials: ["blue shell"],
      animations: ["idle"],
      textures: []
    }
  }
} as const);
