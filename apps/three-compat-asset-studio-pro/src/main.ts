import { createThreeCompatRenderer } from "@aura3d/rendering";
const renderer = createThreeCompatRenderer({ width: 960, height: 540 });
(document.body as HTMLBodyElement).dataset.a3dApp = "three-compat-asset-studio-pro";
console.log(renderer.captureScreenshot());
