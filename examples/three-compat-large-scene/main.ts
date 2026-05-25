import { InstancingV5 } from "../../packages/rendering/src";
document.body.dataset.g3dExample = `three-compat-large-scene:${new InstancingV5(50000).instanceCount}`;
