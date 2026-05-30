
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

mountShell("02 city block");

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: Math.min(devicePixelRatio, 2),
  scene: scene()
    .background("#8dcaf0")
    .camera(camera.orbit({ position: [6, 4.2, 7], target: [0, 1, 0], distance: 8.5, fov: 48 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.55, color: "#dcecff" }))
    .add(lights.directional({ position: [-4, 7, 5], intensity: 1.4, color: "#ffffff" }))
    .add(lights.point({ position: [4, 3.5, -3], intensity: 0.9, color: "#8bd6ff" }))
    .add(primitives.box({ name: "building-0", size: [1.25, 1.20, 1.25], material: material.pbr({ color: "#6c7a7e", roughness: 0.75 }) }).position(-4.40, 0.60, -3.30))
      .add(primitives.box({ name: "building-1", size: [1.25, 1.65, 1.25], material: material.pbr({ color: "#8a7558", roughness: 0.75 }) }).position(-2.20, 0.82, -3.30))
      .add(primitives.box({ name: "building-2", size: [1.25, 2.10, 1.25], material: material.pbr({ color: "#415665", roughness: 0.75 }) }).position(0.00, 1.05, -3.30))
      .add(primitives.box({ name: "building-3", size: [1.25, 2.55, 1.25], material: material.pbr({ color: "#6c7a7e", roughness: 0.75 }) }).position(2.20, 1.27, -3.30))
      .add(primitives.box({ name: "building-4", size: [1.25, 3.00, 1.25], material: material.pbr({ color: "#8a7558", roughness: 0.75 }) }).position(4.40, 1.50, -3.30))
      .add(primitives.box({ name: "building-5", size: [1.25, 3.45, 1.25], material: material.pbr({ color: "#415665", roughness: 0.75 }) }).position(-4.40, 1.73, -1.10))
      .add(primitives.box({ name: "building-6", size: [1.25, 1.20, 1.25], material: material.pbr({ color: "#6c7a7e", roughness: 0.75 }) }).position(-2.20, 0.60, -1.10))
      .add(primitives.box({ name: "building-7", size: [1.25, 1.65, 1.25], material: material.pbr({ color: "#8a7558", roughness: 0.75 }) }).position(0.00, 0.82, -1.10))
      .add(primitives.box({ name: "building-8", size: [1.25, 2.10, 1.25], material: material.pbr({ color: "#415665", roughness: 0.75 }) }).position(2.20, 1.05, -1.10))
      .add(primitives.box({ name: "building-9", size: [1.25, 2.55, 1.25], material: material.pbr({ color: "#6c7a7e", roughness: 0.75 }) }).position(4.40, 1.27, -1.10))
      .add(primitives.box({ name: "building-10", size: [1.25, 3.00, 1.25], material: material.pbr({ color: "#8a7558", roughness: 0.75 }) }).position(-4.40, 1.50, 1.10))
      .add(primitives.box({ name: "building-11", size: [1.25, 3.45, 1.25], material: material.pbr({ color: "#415665", roughness: 0.75 }) }).position(-2.20, 1.73, 1.10))
      .add(primitives.box({ name: "building-12", size: [1.25, 1.20, 1.25], material: material.pbr({ color: "#6c7a7e", roughness: 0.75 }) }).position(0.00, 0.60, 1.10))
      .add(primitives.box({ name: "building-13", size: [1.25, 1.65, 1.25], material: material.pbr({ color: "#8a7558", roughness: 0.75 }) }).position(2.20, 0.82, 1.10))
      .add(primitives.box({ name: "building-14", size: [1.25, 2.10, 1.25], material: material.pbr({ color: "#415665", roughness: 0.75 }) }).position(4.40, 1.05, 1.10))
      .add(primitives.box({ name: "building-15", size: [1.25, 2.55, 1.25], material: material.pbr({ color: "#6c7a7e", roughness: 0.75 }) }).position(-4.40, 1.27, 3.30))
      .add(primitives.box({ name: "building-16", size: [1.25, 3.00, 1.25], material: material.pbr({ color: "#8a7558", roughness: 0.75 }) }).position(-2.20, 1.50, 3.30))
      .add(primitives.box({ name: "building-17", size: [1.25, 3.45, 1.25], material: material.pbr({ color: "#415665", roughness: 0.75 }) }).position(0.00, 1.73, 3.30))
      .add(primitives.box({ name: "building-18", size: [1.25, 1.20, 1.25], material: material.pbr({ color: "#6c7a7e", roughness: 0.75 }) }).position(2.20, 0.60, 3.30))
      .add(primitives.box({ name: "building-19", size: [1.25, 1.65, 1.25], material: material.pbr({ color: "#8a7558", roughness: 0.75 }) }).position(4.40, 0.82, 3.30))
      .add(primitives.plane({ name: "streets", size: [14, 14, 1], material: material.pbr({ color: "#202629", roughness: 0.85 }) }).rotate(-Math.PI / 2, 0, 0))
});
window.__ENGINE_READOUT__ = () => {
  const d = app.diagnostics();
  return { routeHealth: d.errors.length ? "fail" : "pass", drawCalls: d.drawCalls, triangleCount: undefined };
};
