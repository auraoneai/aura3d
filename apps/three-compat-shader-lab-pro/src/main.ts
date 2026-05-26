import { createRendererV5 } from "@aura3d/rendering";
const renderer = createRendererV5({ width: 960, height: 540 });
(document.body as HTMLBodyElement).dataset.a3dApp = "three-compat-shader-lab-pro";
console.log(renderer.captureScreenshot());
