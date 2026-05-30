import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  prefabs,
  primitives,
  scene,
  timeline
} from "@aura3d/engine";

const skin = material.clearcoat({ color: "#f2c9a0", roughness: 0.34 });
const shirt = material.clearcoat({ color: "#2563eb", roughness: 0.3 });
const sleeve = material.clearcoat({ color: "#5aa7ff", roughness: 0.34 });
const pants = material.clearcoat({ color: "#172033", roughness: 0.42 });
const shoe = material.rubber({ color: "#070b12" });
const ghostSkin = material.clearcoat({ color: "#f2c9a0", opacity: 0.28, roughness: 0.4 });
const ghostBlue = material.clearcoat({ color: "#68b7ff", opacity: 0.24, roughness: 0.4 });
const ghostDark = material.clearcoat({ color: "#1c2940", opacity: 0.24, roughness: 0.5 });

type StridePose = {
  readonly x: number;
  readonly z: number;
  readonly alpha?: "ghost" | "solid";
  readonly forwardLegSide: -1 | 1;
  readonly animate?: boolean;
};

function humanoidPose({ x, z, alpha = "solid", forwardLegSide, animate = false }: StridePose) {
  const isGhost = alpha === "ghost";
  const bodyMaterial = isGhost ? ghostBlue : shirt;
  const armMaterial = isGhost ? ghostBlue : sleeve;
  const legMaterial = isGhost ? ghostDark : pants;
  const skinMaterial = isGhost ? ghostSkin : skin;
  const stride = forwardLegSide;
  const pulse = animate ? { clip: "pulse", speed: 0.75 } : undefined;

  return [
    primitives.cylinder({ name: `${alpha} walking torso`, material: bodyMaterial })
      .position(x, 0.98, z)
      .rotate(0.08, 0, -0.06 * stride)
      .scale([0.3, 0.72, 0.24])
      .animate({ clip: animate ? "float" : "pulse", speed: animate ? 3.2 : 0.18 })
      .toJSON(),
    primitives.sphere({ name: `${alpha} sphere head`, material: skinMaterial })
      .position(x + 0.03 * stride, 1.66, z)
      .scale(0.22)
      .animate({ clip: animate ? "float" : "pulse", speed: animate ? 2.7 : 0.16 })
      .toJSON(),
    primitives.box({ name: `${alpha} left box arm`, material: armMaterial })
      .position(x - 0.42, 0.93, z + 0.13 * stride)
      .rotate(0.62 * stride, 0.06, -0.34)
      .scale([0.12, 0.66, 0.12])
      .animate(pulse ?? { clip: "pulse", speed: 0.24 })
      .toJSON(),
    primitives.box({ name: `${alpha} right box arm`, material: armMaterial })
      .position(x + 0.42, 0.93, z - 0.13 * stride)
      .rotate(-0.62 * stride, -0.06, 0.34)
      .scale([0.12, 0.66, 0.12])
      .animate(pulse ?? { clip: "pulse", speed: 0.24 })
      .toJSON(),
    primitives.box({ name: `${alpha} left box leg`, material: legMaterial })
      .position(x - 0.16, 0.38, z - 0.17 * stride)
      .rotate(-0.56 * stride, 0, -0.12)
      .scale([0.14, 0.82, 0.14])
      .animate({ clip: "pulse", speed: animate ? 0.96 : 0.22 })
      .toJSON(),
    primitives.box({ name: `${alpha} right box leg`, material: legMaterial })
      .position(x + 0.18, 0.38, z + 0.18 * stride)
      .rotate(0.56 * stride, 0, 0.12)
      .scale([0.14, 0.82, 0.14])
      .animate({ clip: "pulse", speed: animate ? 1.08 : 0.22 })
      .toJSON(),
    primitives.box({ name: `${alpha} planted left foot`, material: isGhost ? ghostDark : shoe })
      .position(x - 0.22, 0.045, z - 0.47 * stride)
      .rotate(0, 0.1, -0.03)
      .scale([0.26, 0.08, 0.16])
      .toJSON(),
    primitives.box({ name: `${alpha} lifted right foot`, material: isGhost ? ghostDark : shoe })
      .position(x + 0.24, 0.13, z + 0.48 * stride)
      .rotate(0.18 * stride, -0.08, 0.04)
      .scale([0.25, 0.08, 0.16])
      .animate({ clip: "pulse", speed: animate ? 1.2 : 0.22 })
      .toJSON()
  ];
}

const appScene = scene()
  .background("#071019")
  .addMany(prefabs.primitiveHumanoid())
  .add(
    primitives.plane({
      name: "wide visible walking ground plane",
      material: material.pbr({ color: "#263a2f", roughness: 0.78, metallic: 0.02 })
    })
      .position(0, -0.055, -0.28)
      .scale([6.5, 1, 3.5])
  )
  .add(
    primitives.box({
      name: "ground travel lane",
      material: material.emissive({ color: "#335c73", emissive: "#3b7895", roughness: 0.22 })
    })
      .position(0, -0.006, -0.58)
      .scale([4.8, 0.018, 0.05])
  )
  .add(
    primitives.box({
      name: "forward motion arrow head",
      material: material.emissive({ color: "#8ee7ff", emissive: "#8ee7ff" })
    })
      .position(1.95, 0.01, -0.58)
      .rotate(0, 0.78, 0)
      .scale([0.22, 0.025, 0.22])
  )
  .add(
    primitives.box({
      name: "forward motion arrow wing",
      material: material.emissive({ color: "#8ee7ff", emissive: "#8ee7ff" })
    })
      .position(1.95, 0.012, -0.58)
      .rotate(0, -0.78, 0)
      .scale([0.22, 0.025, 0.22])
  )
  .addMany(humanoidPose({ x: -1.28, z: -0.6, alpha: "ghost", forwardLegSide: -1 }))
  .addMany(humanoidPose({ x: -0.35, z: -0.6, alpha: "ghost", forwardLegSide: 1 }))
  .addMany(humanoidPose({ x: 0.72, z: -0.6, alpha: "solid", forwardLegSide: -1, animate: true }))
  .add(
    primitives.sphere({
      name: "fresh planted footprint",
      material: material.emissive({ color: "#8ee7ff", emissive: "#8ee7ff" })
    })
      .position(0.48, 0.018, -0.13)
      .scale([0.13, 0.02, 0.24])
  )
  .add(
    primitives.sphere({
      name: "previous footprint",
      material: material.emissive({ color: "#5a96aa", emissive: "#5a96aa", opacity: 0.55 })
    })
      .position(-0.55, 0.016, -1.03)
      .scale([0.12, 0.018, 0.22])
  )
  .add(lights.ambient({ intensity: 0.28, color: "#c8ddff" }))
  .add(lights.directional({ name: "strong walking key light", position: [-2.4, 4.2, 2.8], intensity: 1.9, color: "#f7fbff" }))
  .add(lights.point({ name: "cool rim on moving limbs", position: [2.1, 1.8, 1.0], intensity: 1.35, color: "#8ee7ff" }))
  .add(effects.bloom({ intensity: 0.12, color: "#85dfff" }))
  .add(interactions.orbit())
  .camera(camera.perspective({ position: [0.45, 1.45, 4.05], target: [0.15, 0.78, -0.58], fov: 38 }))
  .timeline(timeline.loop({ seconds: 3.2 }));

createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  scene: appScene
});
