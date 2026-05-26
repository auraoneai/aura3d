import { InstancingThreeCompat } from "@aura3d/rendering";
document.body.dataset.a3dExample = `three-compat-large-scene:${new InstancingThreeCompat(50000).instanceCount}`;
