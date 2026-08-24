/** Neon arcade room with a real catalog pinball cabinet. */
import { lights, material, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export function createVaultBreakersEnvironment(): AuraSceneNode[] {
  const darkFloor = material.pbr({ name: "vault dark floor", color: "#080810", roughness: 0.25, metallic: 0.6 });

  return [
    lights.ambient({ name: "vault ambient", color: "#1a1a2e", intensity: 1.2 }).toJSON(),
    lights.directional({ name: "vault warm key", color: "#fde68a", intensity: 2.8 }).position(-3, 8, 4).toJSON(),
    lights.directional({ name: "vault cyan rim", color: "#00e5ff", intensity: 1.8 }).position(4, 6, -3).toJSON(),
    lights.directional({ name: "vault magenta fill", color: "#ff00aa", intensity: 0.8 }).position(0, -2, -6).toJSON(),
    primitives.box({ name: "arcade floor", material: darkFloor })
      .position(0, -2.25, 0).scale([14, 0.08, 14]).toJSON(),
    // Real catalog pinball cabinet — textured, multi-material, proper geometry
    // Bounds are [-1,1]^3, so targetMaxDimension controls the largest axis
    // We want the table to span roughly 8 units in depth (Z) to match physics
    model(assets.vaultBreakersTable, {
      name: "typed-vault-breakers-cabinet",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 8.5
    }).position(0, -1.8, 0.1).toJSON(),
  ];
}
