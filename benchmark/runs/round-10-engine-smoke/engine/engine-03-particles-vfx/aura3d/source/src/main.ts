
import { camera, createAuraApp, effects, interactions, lights, material, prefabs, primitives, scene } from "@aura3d/engine";

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

mountShell("03 particles vfx");
const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: scene()
    .background("#071017")
    .camera(camera.perspective({ position: [4.4, 3.0, 5.8], target: [0, 1.2, 0], fov: 48 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.54, color: "#dcecff" }))
    .addMany(prefabs.particleFountain({ count: 1800 }))
    .add(effects.bloom({ intensity: 1.0 }))
    .add(effects.fog({ density: 0.38, color: "#08111a" }))
    .add(primitives.plane({ name: "dark floor", material: material.pbr({ color: "#101822", roughness: 0.82 }) }).rotate(-Math.PI / 2, 0, 0).scale([8, 1, 8]))
});
window.__ENGINE_READOUT__ = () => engineReadout(app);
window.__ENGINE_READY__ = () => engineReady(window.__ENGINE_READOUT__?.());
