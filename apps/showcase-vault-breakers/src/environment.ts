/** Bounded art-deco room dressing that never occludes the playable table. */
import { lights, material, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export function createVaultBreakersEnvironment(): AuraSceneNode[] {
  const blackLacquer = material.pbr({ name: "vault black lacquer", color: "#111827", roughness: 0.34, metallic: 0.52 });

  return [
    lights.ambient({ name: "vault ambient", color: "#dbeafe", intensity: 2.4 }).toJSON(),
    lights.directional({ name: "vault warm key", color: "#fde68a", intensity: 3.1 }).position(-5, 10, 6).toJSON(),
    lights.directional({ name: "vault cool rim", color: "#67e8f9", intensity: 2.2 }).position(5, 8, -5).toJSON(),
    // Keep the room surface a thin box below the cabinet.  A large rotated
    // plane is depth-unsafe in the production bridge and can cover the
    // player-facing backbox even though it is authored below the table.
    primitives.box({ name: "arcade floor", material: blackLacquer })
      .position(0, -2.25, 0).scale([12, 0.12, 12]).toJSON(),
    model(assets.vaultBreakersTable, {
      name: "typed-vault-breakers-cabinet",
      // Keep the authored mesh parts independent. The pinball head is a
      // distinct upright component and must not be folded into a consolidated
      // world batch that hides its player-facing surface.
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 9.6
    }).position(0, -1.8, 0.1).toJSON(),
  ];
}
