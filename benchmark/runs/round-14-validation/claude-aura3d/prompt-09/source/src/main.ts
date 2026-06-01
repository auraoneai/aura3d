import {
  camera,
  character,
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

// Guard the humanoid against disconnected limbs / impossible proportions
// before the runner captures the screenshot.
const qa = character.visualQA(humanoidNodes);
console.log("humanoid visualQA", qa.connected, qa.impossibleProportions, qa.problems);

createAuraApp("#app", {
  scene: scene()
    .background("#08111f")
    .addMany(humanoidNodes)
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.humanoid())
    .timeline(timeline.loop({ seconds: 4 }))
});
