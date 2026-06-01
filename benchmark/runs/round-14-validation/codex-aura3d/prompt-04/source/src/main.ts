import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  effects,
  prefabs,
  scene,
  timeline
} from "@aura3d/engine";

const neonFlythrough = scene()
  .background("#020617")
  .addMany(prefabs.neonTunnel({ rings: 30 }))
  .add(effects.fog({ density: 0.12, color: "#07111f" }))
  .add(effects.bloom({ intensity: 0.42 }))
  .camera(camera.neon())
  .timeline(timeline.loop({ seconds: 8 }));

console.log(collectAuraSceneEvidence(neonFlythrough));

createAuraApp("#app", {
  scene: neonFlythrough
});
