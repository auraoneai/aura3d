import { createRendererV5 } from "@galileo3d/rendering";
const renderer = createRendererV5({ width: 960, height: 540 });
(document.body as HTMLBodyElement).dataset.g3dApp = "three-compat-product-studio-pro";
console.log(renderer.captureScreenshot());
