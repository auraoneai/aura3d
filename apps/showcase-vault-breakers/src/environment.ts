/** Bounded neon arcade room dressing that never occludes the playable table. */
import { lights, material, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export function createVaultBreakersEnvironment(): AuraSceneNode[] {
  // Dark reflective floor — catches neon glow
  const darkFloor = material.pbr({ name: "vault dark floor", color: "#080810", roughness: 0.25, metallic: 0.6 });

  return [
    // Lower ambient so emissive materials pop
    lights.ambient({ name: "vault ambient", color: "#1a1a2e", intensity: 1.0 }).toJSON(),
    // Stronger key light closer to the table
    lights.directional({ name: "vault warm key", color: "#fde68a", intensity: 2.8 }).position(-3, 8, 4).toJSON(),
    // Cyan rim light for neon atmosphere
    lights.directional({ name: "vault cyan rim", color: "#00e5ff", intensity: 1.8 }).position(4, 6, -3).toJSON(),
    // Magenta fill from below-behind for neon depth
    lights.directional({ name: "vault magenta fill", color: "#ff00aa", intensity: 0.8 }).position(0, -2, -6).toJSON(),
    // Thin reflective floor below the cabinet
    primitives.box({ name: "arcade floor", material: darkFloor })
      .position(0, -2.25, 0).scale([14, 0.08, 14]).toJSON(),
    // Cabinet shell — original proven position that frames correctly with the camera
    model(assets.vaultBreakersTable, {
      name: "typed-vault-breakers-cabinet",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 9.6
    }).position(0, -1.8, 0.1).toJSON(),
  ];
}
