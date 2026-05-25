import { inspectV5AnimatedAssets } from "../../packages/animation/src";
document.body.dataset.g3dExample = `three-compat-animation-viewer:${inspectV5AnimatedAssets().filter((asset) => asset.loaded).length}`;
