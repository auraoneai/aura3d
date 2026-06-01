import {
  camera,
  character,
  collectAuraSceneEvidence,
  createAuraApp,
  lights,
  scene,
  timeline
} from "@aura3d/engine";

const humanoidNodes = character.primitiveHumanoid({
  showJoints: true,
  motionTrail: true,
  clip: "walk",
  pose: "mid-stride"
});

const humanoidScene = scene()
  .background("#08111f")
  .addMany(humanoidNodes)
  .add(lights.studio({ intensity: 1.15 }))
  .camera(camera.humanoid())
  .timeline(timeline.loop({ seconds: 4 }));

console.log("primitive humanoid visual QA", character.visualQA(humanoidNodes));
console.log("scene evidence", collectAuraSceneEvidence(humanoidScene));

createAuraApp("#app", {
  scene: humanoidScene
});
