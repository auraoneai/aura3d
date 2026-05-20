import { createRendererV5 } from "@galileo3d/rendering";
const renderer = createRendererV5({ width: 960, height: 540 });
(document.body as HTMLBodyElement).dataset.g3dApp = "v5-large-scene-lab";
console.log(renderer.captureScreenshot());
