
import { camera, createAuraApp, effects, interactions, lights, material, primitives, scene } from "@aura3d/engine";

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

mountShell("01 material grid");

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

      .add(primitives.sphere({ name: "metal", material: material.pbr({ color: "#bfc7d5", metallic: 1, roughness: 0.18 }) }).position(-4, 1.2, 0).scale(1.1))
      .add(primitives.sphere({ name: "glass", material: material.pbr({ color: "#d9f6ff", metallic: 0, roughness: 0.02 }) }).position(-2, 1.2, 0).scale(1.1))
      .add(primitives.sphere({ name: "rubber", material: material.pbr({ color: "#19191b", metallic: 0, roughness: 0.9 }) }).position(0, 1.2, 0).scale(1.1))
      .add(primitives.sphere({ name: "emissive", material: material.emissive({ color: "#ff45c8", emissive: "#ff45c8", roughness: 0.25 }) }).position(2, 1.2, 0).scale(1.1))
      .add(primitives.sphere({ name: "clearcoat", material: material.pbr({ color: "#ffdf9b", metallic: 0, roughness: 0.1 }) }).position(4, 1.2, 0).scale(1.1))
      .add(primitives.box({ name: "studio-shelf", size: [10.5, 0.18, 2.2], material: material.pbr({ color: "#444b55", roughness: 0.35 }) }).position(0, -0.12, 0))
});
window.__ENGINE_READOUT__ = () => {
  const d = app.diagnostics();
  return { routeHealth: d.errors.length ? "fail" : "pass", drawCalls: d.drawCalls, triangleCount: undefined };
};
