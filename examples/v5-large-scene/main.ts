import { InstancingV5 } from "../../packages/rendering/src";
document.body.dataset.g3dExample = `v5-large-scene:${new InstancingV5(50000).instanceCount}`;
