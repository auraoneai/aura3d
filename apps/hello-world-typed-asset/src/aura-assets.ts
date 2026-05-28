import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  robot: {
    type: "model",
    format: "glb",
    url: "/apps/hello-world-typed-asset/robot-fixture.glb",
    bounds: [1.8, 2.1, 1.0],
    hash: "sha256-047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319",
    metadata: {
      materials: ["robot shell", "glass visor", "joint metal"],
      animations: [],
      textures: ["embedded glTF textures"]
    }
  }
} as const);
