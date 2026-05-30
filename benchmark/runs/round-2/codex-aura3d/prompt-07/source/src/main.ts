import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  prefabs,
  primitives,
  scene
} from "@aura3d/engine";

const labScene = scene()
  .background("#070a0f")
  .addMany(prefabs.materialSwatches())
  .add(
    primitives.sphere({
      name: "warm emissive swatch",
      material: material.emissive({
        color: "#2a1510",
        emissive: "#ff7a22",
        roughness: 0.26
      })
    })
      .position(2.25, 0.48, -0.75)
      .scale(0.42)
  )
  .add(
    primitives.plane({
      name: "dark reflective studio floor",
      material: material.clearcoat({
        color: "#101720",
        roughness: 0.18,
        metallic: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.05
      })
    })
      .position(0.45, -0.025, -0.75)
      .scale([5.6, 1, 2.4])
  )
  .add(
    primitives.plane({
      name: "charcoal environment map backdrop",
      material: material.pbr({
        color: "#131c27",
        roughness: 0.34,
        metallic: 0.06
      })
    })
      .position(0.45, 1.0, -2.15)
      .rotate(1.5708, 0, 0)
      .scale([5.8, 1, 2.2])
  )
  .add(
    primitives.box({
      name: "left white softbox reflection card",
      material: material.emissive({
        color: "#eaf7ff",
        emissive: "#eaf7ff",
        roughness: 0.18
      })
    })
      .position(-2.55, 0.95, -0.82)
      .scale([0.08, 1.35, 1.55])
  )
  .add(
    primitives.box({
      name: "right warm rim reflection card",
      material: material.emissive({
        color: "#ffd39b",
        emissive: "#ffd39b",
        roughness: 0.2
      })
    })
      .position(3.0, 0.78, -0.9)
      .scale([0.08, 1.05, 1.28])
  )
  .add(
    primitives.box({
      name: "blue overhead environment strip",
      material: material.emissive({
        color: "#75c9ff",
        emissive: "#75c9ff",
        roughness: 0.2
      })
    })
      .position(0.45, 1.72, -1.32)
      .scale([4.45, 0.08, 0.08])
  )
  .add(lights.studio({ intensity: 1.35 }))
  .add(lights.ambient({ intensity: 0.22, color: "#9fb7d4" }))
  .add(lights.directional({ position: [-2.4, 3.2, 2.1], intensity: 1.05, color: "#ffffff" }))
  .add(lights.point({ position: [2.6, 1.6, 1.2], intensity: 1.6, color: "#ffc88a" }))
  .add(effects.bloom({ intensity: 0.24, color: "#ff9a38" }))
  .add(interactions.orbit())
  .camera(camera.orbit({ distance: 4.35, target: [0.45, 0.45, -0.78], fov: 42 }))
  .diagnostics(true);

createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  scene: labScene
});
