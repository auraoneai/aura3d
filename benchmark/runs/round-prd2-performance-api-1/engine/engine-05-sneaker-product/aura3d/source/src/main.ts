
import { assets } from "./aura-assets";
import { camera, createAuraApp, interactions, lights, model, prefabs, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string };
    __ENGINE_READY__?: () => boolean;
  }
}

function mountShell(title: string) {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("Missing #app");
  root.innerHTML = "<div id='stage'></div><div class='hud'>" + title + "</div>";
  const style = document.createElement("style");
  style.textContent = [
    "html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#071017;color:#f8fbff;font-family:Inter,Arial,sans-serif}",
    "#stage{position:fixed;inset:0}",
    ".hud{position:fixed;left:18px;top:18px;padding:9px 11px;border:1px solid rgba(255,255,255,.22);border-radius:6px;background:rgba(5,10,16,.75);font-weight:800}"
  ].join("");
  document.head.append(style);
}

function engineReadout(app: ReturnType<typeof createAuraApp>) {
  const d = app.diagnostics();
  return { routeHealth: d.errors.length ? "fail" : "pass", drawCalls: d.drawCalls, triangleCount: undefined };
}

function engineReady(readout: { drawCalls?: number; routeHealth?: string } | undefined) {
  return readout?.routeHealth === "pass" && Number.isFinite(readout.drawCalls) && (readout.drawCalls ?? 0) > 0;
}

mountShell("05 sneaker product");
const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: scene()
    .background("#f8fafc")
    .camera(camera.perspective({ position: [1.65, 1.18, 4.0], target: [0, 0.72, -0.65], fov: 38 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.52, color: "#ffffff" }))
    .add(lights.directional({ position: [-3.5, 5.2, 4.0], intensity: 1.4, color: "#ffffff" }))
    .addMany(prefabs.productStage())
    .add(model(assets.sneaker).position(0, 0.54, -0.65).rotate(0, -0.38, 0))
});
window.__ENGINE_READOUT__ = () => engineReadout(app);
window.__ENGINE_READY__ = () => engineReady(window.__ENGINE_READOUT__?.());
