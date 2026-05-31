import {
  camera,
  createAuraApp,
  lights,
  prefabs,
  scene,
  timeline
} from "@aura3d/engine";

// Prompt 09: Animated Primitive Humanoid.
// Recipe 09 shape: the primitiveHumanoid prefab builds a connected figure from
// primitives (sphere head, cylinder torso, box limbs) with shoulder/hip joints,
// planted feet, face cues, path markers, and a looping procedural walk-cycle
// clip that carries the figure across the ground plane.
createAuraApp("#app", {
  scene: scene()
    .background("#08111f")
    .addMany(prefabs.primitiveHumanoid({ showJoints: true, motionTrail: true }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(
      camera.perspective({
        position: [1.25, 1.48, 3.25],
        target: [0, 0.86, -0.55],
        fov: 40
      })
    )
    .timeline(timeline.loop({ seconds: 4 }))
});
