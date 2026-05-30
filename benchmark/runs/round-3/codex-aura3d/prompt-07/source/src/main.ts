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

const materialLab = scene()
  .background("#090b0e")
  .add(
    primitives.plane({
      name: "low gloss graphite studio floor",
      material: material.pbr({
        color: "#252a30",
        roughness: 0.24,
        metallic: 0.18
      })
    })
      .position(0, -0.035, -0.65)
      .scale([6.4, 1, 3.8])
  )
  .add(
    primitives.plane({
      name: "curved neutral environment backdrop",
      material: material.pbr({
        color: "#d9e1eb",
        roughness: 0.38,
        metallic: 0.02
      })
    })
      .position(0, 1.0, -2.35)
      .rotate(1.5708, 0, 0)
      .scale([6.4, 1, 2.7])
  )
  .add(
    primitives.box({
      name: "left white studio softbox reflection card",
      material: material.emissive({
        color: "#f3f8ff",
        emissive: "#f3f8ff"
      })
    })
      .position(-2.55, 0.95, -0.9)
      .rotate(0, 0.2, 0)
      .scale([0.08, 1.45, 1.75])
  )
  .add(
    primitives.box({
      name: "right warm studio softbox reflection card",
      material: material.emissive({
        color: "#ffd9aa",
        emissive: "#ffd9aa"
      })
    })
      .position(2.55, 0.9, -0.95)
      .rotate(0, -0.2, 0)
      .scale([0.08, 1.2, 1.55])
  )
  .add(
    primitives.box({
      name: "overhead strip softbox",
      material: material.emissive({
        color: "#edf6ff",
        emissive: "#edf6ff"
      })
    })
      .position(0, 1.72, -1.0)
      .scale([2.6, 0.06, 0.16])
  )
  .add(
    primitives.box({
      name: "cool environment reflection strip",
      material: material.emissive({
        color: "#2b7890",
        emissive: "#3da9c7"
      })
    })
      .position(-0.95, 0.025, 0.28)
      .rotate(0, 0.12, 0)
      .scale([1.05, 0.03, 0.13])
  )
  .add(
    primitives.box({
      name: "warm environment reflection strip",
      material: material.emissive({
        color: "#8b6337",
        emissive: "#b8864b"
      })
    })
      .position(1.05, 0.026, 0.12)
      .rotate(0, -0.14, 0)
      .scale([0.95, 0.03, 0.13])
  )
  .addMany(prefabs.materialSwatches())
  .add(lights.ambient({ name: "soft environment fill", intensity: 0.18, color: "#e8f3ff" }))
  .add(lights.studio({ intensity: 1.2 }))
  .add(lights.point({ name: "large cool key light", position: [-2.4, 2.35, 2.1], color: "#f0f7ff", intensity: 2.6 }))
  .add(lights.point({ name: "warm rim light", position: [2.35, 1.55, 0.75], color: "#ffc27d", intensity: 1.35 }))
  .add(effects.bloom({ intensity: 0.18, color: "#ffffff" }))
  .add(interactions.orbit({ target: "material comparison rail" }))
  .camera(camera.orbit({ distance: 4.4, target: [0, 0.5, -0.72], fov: 38 }));

createAuraApp("#app", {
  diagnostics: { overlay: false, assetPanel: false, performancePanel: false },
  pixelRatio: 1.5,
  scene: materialLab
});
