import { startWowGltfShowcase } from "/apps/wow-common/src/gltf-showcase.ts";

// When embedded in the marketing site (?chrome=hidden) the surrounding
// page is dark, so swap the authored beige clearColor for black so the
// canvas blends with the marketing stage instead of showing a white
// panel inside it.
const isCleanEmbed =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("chrome") === "hidden";

const clearColor: [number, number, number, number] = isCleanEmbed
  ? [0, 0, 0, 1]
  : [0.86, 0.86, 0.84, 1];
const publicAssetOrigin =
  (window as unknown as { AURA3D_PUBLIC_ASSET_ORIGIN?: string }).AURA3D_PUBLIC_ASSET_ORIGIN
  ?? "https://cdn.jsdelivr.net/gh/auraoneai/aura3d@main";

void startWowGltfShowcase({
  appId: "wow-tokyo-keyframes",
  title: "A3D Authored Tokyo Keyframes",
  subtitle: "Imported authored scene with native A3D glTF animation playback.",
  assetUrl: `${publicAssetOrigin}/fixtures/threejs-parity/assets/showcase/littlest-tokyo.glb`,
  assetName: "Littlest Tokyo animated scene",
  attribution: "Model: Littlest Tokyo by Glen Fox, CC Attribution.",
  requiresDraco: true,
  preferredClip: /Take|animation|default/i,
  clearColor,
  frame: {
    yawRadians: -0.72,
    pitchRadians: -0.2,
    paddingRatio: 0.025,
    fovYRadians: 0.48
  }
});
