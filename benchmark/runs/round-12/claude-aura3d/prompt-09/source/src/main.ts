import {
  camera,
  createAuraApp,
  lights,
  prefabs,
  scene,
  timeline
} from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#08111f")
    .addMany(prefabs.primitiveHumanoid({ showJoints: true, motionTrail: true }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.perspective({ position: [1.25, 1.48, 3.25], target: [0, 0.86, -0.55], fov: 40 }))
    .timeline(timeline.loop({ seconds: 4 }))
});
