import { inspectV5AnimatedAssets } from "@aura3d/animation";
document.body.dataset.a3dExample = `three-compat-animation-viewer:${inspectV5AnimatedAssets().filter((asset) => asset.loaded).length}`;
