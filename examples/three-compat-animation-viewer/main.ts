import { inspectV5AnimatedAssets } from "@galileo3d/animation";
document.body.dataset.g3dExample = `three-compat-animation-viewer:${inspectV5AnimatedAssets().filter((asset) => asset.loaded).length}`;
