import { inspectV5AnimatedAssets } from "../../packages/animation/src";
document.body.dataset.g3dExample = `v5-animation-viewer:${inspectV5AnimatedAssets().filter((asset) => asset.loaded).length}`;
