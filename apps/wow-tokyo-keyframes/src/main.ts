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
  : [0.06, 0.08, 0.13, 1];
const sameOriginFixtureHost =
  typeof location !== "undefined" &&
  (["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "aura3d.auraone.ai"].includes(location.hostname) ||
    location.hostname.endsWith(".vercel.app"));
const publicAssetOrigin =
  (window as unknown as { AURA3D_PUBLIC_ASSET_ORIGIN?: string }).AURA3D_PUBLIC_ASSET_ORIGIN
  ?? (sameOriginFixtureHost ? "" : "https://cdn.jsdelivr.net/gh/auraoneai/aura3d@main");

void startWowGltfShowcase({
  appId: "wow-tokyo-keyframes",
  title: "Aura3D 4.0 · Littlest Tokyo Keyframes",
  subtitle: "Imported Littlest Tokyo diorama with native Aura3D 4.0 glTF keyframe animation playback.",
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
  },
  lightingRig: {
    keyIntensity: 2.3,
    fillIntensity: 1.05,
    rimIntensity: 1.2
  },
  postProcess: {
    tonemapping: { enabled: true, mode: "aces", exposure: 1.15 },
    bloom: { enabled: true, intensity: 0.22, threshold: 0.8 },
    ssao: { enabled: true, radius: 2, intensity: 0.32 },
    fxaa: { enabled: true },
    vignette: { enabled: true, intensity: 0.22 }
  }
});
