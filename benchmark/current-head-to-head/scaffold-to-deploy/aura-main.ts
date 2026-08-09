import { camera, createAuraApp, environments, interactions, material, model, primitives, scene, type AuraLeanApp } from "@aura3d/engine/lean-product";

const asset = { id: "showcaseHeadphones", type: "model", format: "glb", url: "/aura-assets/showcaseHeadphones.40b1fdf7.glb", hash: "sha256-40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833", bounds: [936.934, 960.48, 382.415] } as const;
const fittedScale = 3 / asset.bounds[1];
const groundedY = 392.812 * fittedScale;
const centeredZ = -5.504 * fittedScale;
declare global { interface Window { __CLEAN_AURA__?: any; __CLEAN_AURA_ERROR__?: string } }
let app: AuraLeanApp | null = null;
void mount(false);
document.getElementById("interact")!.addEventListener("click", () => { void mount(true); });

async function mount(interacted: boolean) {
  app?.dispose();
  document.getElementById("app")!.replaceChildren();
  app = createAuraApp("#app", { autoStart: false, scene: scene().background("#05070b").camera(camera.perspective({ position: [0, 2.35, 7.2], target: [0, 1.45, 0], fov: 38 })).add(environments.studio()).add(interactions.orbit()).add(primitives.box({ name: "deploy floor", material: material.pbr({ color: "#273244", roughness: 0.84 }) }).position(0, -0.08, 0).scale([7, 0.16, 4])).add(model(asset, { name: "deployed product" }).position(interacted ? 0.65 : 0, groundedY, centeredZ).scale(fittedScale)) });
  try { await app.ready(); const diagnostics = app.diagnostics(); const canvas = document.querySelector<HTMLCanvasElement>("#app canvas")!; window.__CLEAN_AURA__ = { ready: true, interacted, package: "@aura3d/engine", entry: "lean-product", publicApiOnly: true, backend: diagnostics.backend, runtimeBackend: diagnostics.runtimeBackend, drawCalls: diagnostics.drawCalls, hash: hash(canvas.toDataURL("image/png")) }; }
  catch (error) { window.__CLEAN_AURA_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); }
}
function hash(value: string) { let result = 2166136261; for (let index = 0; index < value.length; index += 97) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16); }
