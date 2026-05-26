const trackedAnimatedAssets = [
  "animated-colors-cube",
  "animated-morph-cube",
  "box-animated",
  "cesium-man",
  "fox"
] as const;

document.body.dataset.a3dExample = `three-compat-animation-viewer:${trackedAnimatedAssets.length}`;
