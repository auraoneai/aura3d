/** Neon arcade room with a real catalog pinball cabinet. */
import { lights, material, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export function createVaultBreakersEnvironment(): AuraSceneNode[] {
  const darkFloor = material.reflectiveFloor({
    name: "vault reflective arcade floor",
    color: "#080812",
    roughness: 0.2,
    metallic: 0.62,
    clearcoat: 0.5,
    envMapIntensity: 1.2
  });

  return [
    // Keep ambient restrained so the table's authored steel and neon accents
    // retain shape separation instead of washing into a single blue slab.
    lights.ambient({ name: "vault ambient", color: "#18152c", intensity: 0.82 }).toJSON(),
    lights.directional({ name: "vault warm key", color: "#ffd38a", intensity: 3.6 }).position(-3.2, 6.2, 3.4).toJSON(),
    lights.directional({ name: "vault cyan rim", color: "#29dff1", intensity: 2.2 }).position(3.4, 4.8, -2.2).toJSON(),
    lights.directional({ name: "vault magenta fill", color: "#ff3ac8", intensity: 1.15 }).position(0.6, 1.4, -5.4).toJSON(),
    lights.point({ name: "vault left bumper practical", color: "#ff9f43", intensity: 1.35, position: [-0.9, 1.15, -1.7] }).toJSON(),
    lights.point({ name: "vault right bumper practical", color: "#27e4ef", intensity: 1.2, position: [0.9, 1.05, -1.7] }).toJSON(),
    lights.point({ name: "vault backbox practical", color: "#ff47d3", intensity: 1.05, position: [0, 2.5, -3.8] }).toJSON(),
    primitives.box({ name: "arcade floor", material: darkFloor })
      .position(0, -2.25, 0).scale([14, 0.08, 14]).toJSON(),
    // A real room envelope and repeating light strips give the cabinet a
    // readable arcade context. The old single-color backdrop left large
    // black regions around the table and made the scene feel like a debug
    // preview even when the pinball assets were present.
    primitives.box({
      name: "vault rear wall",
      material: material.pbr({ name: "vault rear wall material", color: "#11152d", roughness: 0.64, metallic: 0.28, emissive: "#0e1b42", emissiveIntensity: 0.32 })
    }).position(0, 3.1, -5.9).scale([11.8, 5.3, 0.16]).toJSON(),
    primitives.box({
      name: "vault rear cyan light rail",
      material: material.neon({ name: "vault rear cyan rail", color: "#0d5364", emissive: "#39e7ff", emissiveIntensity: 1.7, roughness: 0.22 })
    }).position(-4.8, 3.0, -5.55).scale([0.08, 3.7, 0.06]).rotate(0, 0, -0.18).toJSON(),
    primitives.box({
      name: "vault rear pink light rail",
      material: material.neon({ name: "vault rear pink rail", color: "#5e174d", emissive: "#f04ed8", emissiveIntensity: 1.45, roughness: 0.22 })
    }).position(4.55, 3.25, -5.53).scale([0.08, 3.9, 0.06]).rotate(0, 0, 0.16).toJSON(),
    primitives.box({
      name: "vault arcade marquee",
      material: material.emissive({ name: "vault arcade marquee material", color: "#242350", emissive: "#37358f", emissiveIntensity: 0.9, opacity: 0.96 })
    }).position(0, 6.45, -5.48).scale([4.8, 0.62, 0.12]).toJSON(),
    primitives.box({
      name: "vault marquee cyan edge",
      material: material.neon({ name: "vault marquee cyan edge material", color: "#0f687b", emissive: "#5ff7ff", emissiveIntensity: 2.3, roughness: 0.18 })
    }).position(0, 5.84, -5.32).scale([4.95, 0.055, 0.055]).toJSON(),
    ...[-8.2, -6.7, 6.7, 8.2].map((x, index) => primitives.box({
      name: `vault floor lane light ${index + 1}`,
      material: material.emissive({ name: `vault floor lane material ${index + 1}`, color: index % 2 ? "#5e174d" : "#0d5364", emissive: index % 2 ? "#e737c5" : "#36def2", emissiveIntensity: 1.1, opacity: 0.7 })
    }).position(x, -2.12, -1.0).scale([0.06, 0.025, 8.2]).rotate(0, 0.08 * (index % 2 ? -1 : 1), 0).toJSON()),
    primitives.torus({
      name: "vault cabinet underglow",
      material: material.neon({ name: "vault cabinet underglow material", color: "#133b54", emissive: "#37e8ef", emissiveIntensity: 1.55, roughness: 0.14 })
    }).position(0, -2.08, 0.18).scale([4.65, 4.65, 0.09]).rotate(Math.PI / 2, 0, 0).toJSON(),
    lights.point({ name: "vault cabinet cyan underlight", color: "#24d8ec", intensity: 4.5, position: [-2.8, -1.7, 1.1] }).toJSON(),
    lights.point({ name: "vault cabinet pink underlight", color: "#e948c5", intensity: 3.8, position: [2.9, -1.35, 0.5] }).toJSON(),
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
