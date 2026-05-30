
import { camera, createAuraApp, effects, interactions, lights, material, prefabs, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string };
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
    ".hud{position:fixed;left:18px;top:18px;padding:10px 12px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(5,10,16,.75);font-weight:800;letter-spacing:.02em}"
  ].join("");
  document.head.append(style);
}

mountShell("03 particles vfx");

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: Math.min(devicePixelRatio, 2),
  scene: scene()
    .background("#071017")
    .camera(camera.orbit({ position: [6, 4.2, 7], target: [0, 1, 0], distance: 8.5, fov: 48 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.55, color: "#dcecff" }))
    .add(lights.directional({ position: [-4, 7, 5], intensity: 1.4, color: "#ffffff" }))
    .add(lights.point({ position: [4, 3.5, -3], intensity: 0.9, color: "#8bd6ff" }))

      .addMany(prefabs.particleFountain({ color: "#66e6ff", count: 2200 }))
      .add(effects.bloom({ intensity: 1.2 }))
      .add(effects.fog({ density: 0.45, color: "#08111a" }))
      .add(primitives.plane({ name: "dark-floor", size: [10, 10, 1], material: material.pbr({ color: "#101822", roughness: 0.82 }) }).rotate(-Math.PI / 2, 0, 0))
});
window.__ENGINE_READOUT__ = () => {
  const d = app.diagnostics();
  return { routeHealth: d.errors.length ? "fail" : "pass", drawCalls: d.drawCalls, triangleCount: undefined };
};
