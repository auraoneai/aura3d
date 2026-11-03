import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  ship: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyPirateKitShipMedium.279ea019.glb",
    bounds: [4.8, 10.964, 10.6],
    hash: "sha256-279ea019268f855240c3cebf7616644c8141c20bee617da72eae4733b8e310af",
    integrity: { version: 1, digest: "sha256-279ea019268f855240c3cebf7616644c8141c20bee617da72eae4733b8e310af", dependencies: { "Textures/colormap.png": "sha256-451e1d7a53b8e76f4b2ee58742e241509fee5f82cf2cee6e3f7aca86ba718abe" }, requireDependencies: true },
    metadata: {
      materials: ["colormap"],
      animations: [],
      textures: []
    }
  }
} as const);
