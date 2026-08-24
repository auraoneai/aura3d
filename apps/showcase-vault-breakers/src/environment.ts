/** Bounded art-deco room dressing that never occludes the playable table. */
import { lights, material, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export function createVaultBreakersEnvironment(): AuraSceneNode[] {
  const brass = material.emissive({ name: "vault brass accents", color: "#fef3c7", emissive: "#b45309" });
  const cyan = material.emissive({ name: "vault cyan accents", color: "#cffafe", emissive: "#0891b2" });
  const burgundy = material.pbr({ name: "vault burgundy room", color: "#2a101c", roughness: 0.82, metallic: 0.08 });
  const blackLacquer = material.pbr({ name: "vault black lacquer", color: "#111827", roughness: 0.34, metallic: 0.52 });
  const backboxFace = material.pbr({ name: "vault backbox face", color: "#162d4a", roughness: 0.48, metallic: 0.42 });

  return [
    lights.ambient({ name: "vault ambient", color: "#dbeafe", intensity: 2.4 }).toJSON(),
    lights.directional({ name: "vault warm key", color: "#fde68a", intensity: 3.1 }).position(-5, 10, 6).toJSON(),
    lights.directional({ name: "vault cool rim", color: "#67e8f9", intensity: 2.2 }).position(5, 8, -5).toJSON(),
    primitives.plane({ name: "arcade floor", material: blackLacquer })
      .position(0, -1.65, 0).rotate(-Math.PI / 2, 0, 0).scale([24, 1, 24]).toJSON(),
    primitives.box({ name: "burgundy backdrop", material: burgundy })
      .position(0, 3.2, -10).scale([24, 12, 0.4]).toJSON(),
    model(assets.vaultBreakersTable, {
      name: "typed-vault-breakers-cabinet",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 9.6
    }).position(0, -1.8, 0.1).toJSON(),
    primitives.box({ name: "left brass rail", material: brass })
      .position(-2.82, 0.34, 0).scale([0.08, 0.16, 8.3]).toJSON(),
    primitives.box({ name: "right brass rail", material: brass })
      .position(2.82, 0.34, 0).scale([0.08, 0.16, 8.3]).toJSON(),
    primitives.box({ name: "front lockdown bar", material: brass })
      .position(0, 0.34, 4.12).scale([5.7, 0.16, 0.12]).toJSON(),
    primitives.box({ name: "left orbit lane light", material: cyan })
      .position(-2.52, 0.08, -1.55).rotate(0, -0.08, 0).scale([0.045, 0.03, 4.4]).toJSON(),
    primitives.box({ name: "plunger lane light", material: cyan })
      .position(2.43, 0.08, 0.75).scale([0.045, 0.03, 6.1]).toJSON(),
    primitives.box({ name: "vault header", material: blackLacquer })
      .position(0, 1.15, -4.42).scale([6, 1.4, 0.28]).toJSON(),
    primitives.box({ name: "vault header top", material: cyan })
      .position(0, 1.88, -4.24).scale([5.9, 0.07, 0.07]).toJSON(),
    primitives.box({ name: "vault header bottom", material: brass })
      .position(0, 0.42, -4.24).scale([5.9, 0.07, 0.07]).toJSON(),
    // A readable upright head above the playfield. The typed cabinet carries
    // its own backbox, while this shallow face/trim keeps that pinball shape
    // visible in the root-safe showcase composition at desktop aspect ratios.
    primitives.plane({ name: "vault backbox face", material: backboxFace })
      .position(0, 2.8, 1.5).scale([4.7, 0.72, 1]).toJSON(),
    primitives.box({ name: "vault backbox top trim", material: cyan })
      .position(0, 3.2, 1.55).scale([4.8, 0.08, 0.08]).toJSON(),
    primitives.box({ name: "vault backbox left trim", material: cyan })
      .position(-4.75, 2.8, 1.55).scale([0.08, 0.8, 0.08]).toJSON(),
    primitives.box({ name: "vault backbox right trim", material: cyan })
      .position(4.75, 2.8, 1.55).scale([0.08, 0.8, 0.08]).toJSON(),
    primitives.box({ name: "vault backbox bottom trim", material: brass })
      .position(0, 2.22, 1.55).scale([4.8, 0.08, 0.08]).toJSON(),
    primitives.box({ name: "vault backbox left support", material: blackLacquer })
      .position(-4.72, 1.42, 1.55).scale([0.12, 0.52, 0.12]).toJSON(),
    primitives.box({ name: "vault backbox right support", material: blackLacquer })
      .position(4.72, 1.42, 1.55).scale([0.12, 0.52, 0.12]).toJSON()
  ];
}
