import { startWowGltfShowcase } from "/apps/wow-common/src/gltf-showcase.ts";

void startWowGltfShowcase({
  appId: "wow-tokyo-keyframes",
  title: "A3D Authored Tokyo Keyframes",
  subtitle: "Imported authored scene with native A3D glTF animation playback.",
  assetUrl: "/fixtures/threejs-parity/assets/showcase/littlest-tokyo.glb",
  assetName: "Littlest Tokyo animated scene",
  attribution: "Model: Littlest Tokyo by Glen Fox, CC Attribution.",
  requiresDraco: true,
  preferredClip: /Take|animation|default/i,
  clearColor: [0.86, 0.86, 0.84, 1],
  frame: {
    yawRadians: -0.72,
    pitchRadians: -0.2,
    paddingRatio: 0.025,
    fovYRadians: 0.48
  }
});
