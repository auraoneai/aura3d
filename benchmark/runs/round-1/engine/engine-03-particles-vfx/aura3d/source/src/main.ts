
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
    .add(primitives.sphere({ name: "spark-0", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.25, 0.20, 0.00).scale(0.08))
      .add(primitives.sphere({ name: "spark-1", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.29, 0.31, 0.15).scale(0.08))
      .add(primitives.sphere({ name: "spark-2", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.24, 0.42, 0.33).scale(0.08))
      .add(primitives.sphere({ name: "spark-3", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.08, 0.53, 0.48).scale(0.08))
      .add(primitives.sphere({ name: "spark-4", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.17, 0.64, 0.54).scale(0.08))
      .add(primitives.sphere({ name: "spark-5", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.46, 0.75, 0.46).scale(0.08))
      .add(primitives.sphere({ name: "spark-6", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.69, 0.86, 0.23).scale(0.08))
      .add(primitives.sphere({ name: "spark-7", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.80, 0.97, -0.12).scale(0.08))
      .add(primitives.sphere({ name: "spark-8", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.73, 1.08, -0.52).scale(0.08))
      .add(primitives.sphere({ name: "spark-9", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.45, 1.19, -0.86).scale(0.08))
      .add(primitives.sphere({ name: "spark-10", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.01, 1.30, -1.05).scale(0.08))
      .add(primitives.sphere({ name: "spark-11", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.50, 1.41, -1.01).scale(0.08))
      .add(primitives.sphere({ name: "spark-12", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.97, 1.52, -0.73).scale(0.08))
      .add(primitives.sphere({ name: "spark-13", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(1.27, 1.63, -0.22).scale(0.08))
      .add(primitives.sphere({ name: "spark-14", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(1.31, 1.74, 0.40).scale(0.08))
      .add(primitives.sphere({ name: "spark-15", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(1.04, 1.85, 1.01).scale(0.08))
      .add(primitives.sphere({ name: "spark-16", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.50, 1.96, 1.45).scale(0.08))
      .add(primitives.sphere({ name: "spark-17", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.03, 2.07, 0.25).scale(0.08))
      .add(primitives.sphere({ name: "spark-18", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.19, 2.18, 0.27).scale(0.08))
      .add(primitives.sphere({ name: "spark-19", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.36, 2.29, 0.19).scale(0.08))
      .add(primitives.sphere({ name: "spark-20", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.49, 2.40, 0.01).scale(0.08))
      .add(primitives.sphere({ name: "spark-21", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.51, 2.51, -0.25).scale(0.08))
      .add(primitives.sphere({ name: "spark-22", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.40, 2.62, -0.52).scale(0.08))
      .add(primitives.sphere({ name: "spark-23", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.13, 0.20, -0.72).scale(0.08))
      .add(primitives.sphere({ name: "spark-24", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.23, 0.31, -0.78).scale(0.08))
      .add(primitives.sphere({ name: "spark-25", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.61, 0.42, -0.65).scale(0.08))
      .add(primitives.sphere({ name: "spark-26", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.91, 0.53, -0.33).scale(0.08))
      .add(primitives.sphere({ name: "spark-27", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(1.04, 0.64, 0.13).scale(0.08))
      .add(primitives.sphere({ name: "spark-28", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.94, 0.75, 0.63).scale(0.08))
      .add(primitives.sphere({ name: "spark-29", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.59, 0.86, 1.06).scale(0.08))
      .add(primitives.sphere({ name: "spark-30", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.05, 0.97, 1.29).scale(0.08))
      .add(primitives.sphere({ name: "spark-31", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.57, 1.08, 1.24).scale(0.08))
      .add(primitives.sphere({ name: "spark-32", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-1.14, 1.19, 0.90).scale(0.08))
      .add(primitives.sphere({ name: "spark-33", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-1.50, 1.30, 0.30).scale(0.08))
      .add(primitives.sphere({ name: "spark-34", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.24, 1.41, -0.07).scale(0.08))
      .add(primitives.sphere({ name: "spark-35", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.24, 1.52, -0.22).scale(0.08))
      .add(primitives.sphere({ name: "spark-36", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.14, 1.63, -0.38).scale(0.08))
      .add(primitives.sphere({ name: "spark-37", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.05, 1.74, -0.49).scale(0.08))
      .add(primitives.sphere({ name: "spark-38", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.31, 1.85, -0.48).scale(0.08))
      .add(primitives.sphere({ name: "spark-39", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.56, 1.96, -0.32).scale(0.08))
      .add(primitives.sphere({ name: "spark-40", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.73, 2.07, -0.04).scale(0.08))
      .add(primitives.sphere({ name: "spark-41", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.74, 2.18, 0.33).scale(0.08))
      .add(primitives.sphere({ name: "spark-42", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.56, 2.29, 0.69).scale(0.08))
      .add(primitives.sphere({ name: "spark-43", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.20, 2.40, 0.95).scale(0.08))
      .add(primitives.sphere({ name: "spark-44", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.27, 2.51, 1.01).scale(0.08))
      .add(primitives.sphere({ name: "spark-45", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.75, 2.62, 0.84).scale(0.08))
      .add(primitives.sphere({ name: "spark-46", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-1.13, 0.20, 0.44).scale(0.08))
      .add(primitives.sphere({ name: "spark-47", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-1.28, 0.31, -0.13).scale(0.08))
      .add(primitives.sphere({ name: "spark-48", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-1.15, 0.42, -0.74).scale(0.08))
      .add(primitives.sphere({ name: "spark-49", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.74, 0.53, -1.25).scale(0.08))
      .add(primitives.sphere({ name: "spark-50", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.09, 0.64, -1.53).scale(0.08))
      .add(primitives.sphere({ name: "spark-51", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.10, 0.75, -0.23).scale(0.08))
      .add(primitives.sphere({ name: "spark-52", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.25, 0.86, -0.21).scale(0.08))
      .add(primitives.sphere({ name: "spark-53", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.40, 0.97, -0.09).scale(0.08))
      .add(primitives.sphere({ name: "spark-54", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.48, 1.08, 0.12).scale(0.08))
      .add(primitives.sphere({ name: "spark-55", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.43, 1.19, 0.37).scale(0.08))
      .add(primitives.sphere({ name: "spark-56", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.24, 1.30, 0.60).scale(0.08))
      .add(primitives.sphere({ name: "spark-57", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.06, 1.41, 0.73).scale(0.08))
      .add(primitives.sphere({ name: "spark-58", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.43, 1.52, 0.69).scale(0.08))
      .add(primitives.sphere({ name: "spark-59", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.76, 1.63, 0.46).scale(0.08))
      .add(primitives.sphere({ name: "spark-60", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.97, 1.74, 0.07).scale(0.08))
      .add(primitives.sphere({ name: "spark-61", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.97, 1.85, -0.40).scale(0.08))
      .add(primitives.sphere({ name: "spark-62", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.73, 1.96, -0.86).scale(0.08))
      .add(primitives.sphere({ name: "spark-63", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.28, 2.07, -1.18).scale(0.08))
      .add(primitives.sphere({ name: "spark-64", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.30, 2.18, -1.25).scale(0.08))
      .add(primitives.sphere({ name: "spark-65", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.89, 2.29, -1.04).scale(0.08))
      .add(primitives.sphere({ name: "spark-66", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(1.34, 2.40, -0.56).scale(0.08))
      .add(primitives.sphere({ name: "spark-67", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(1.53, 2.51, 0.11).scale(0.08))
      .add(primitives.sphere({ name: "spark-68", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.21, 2.62, 0.13).scale(0.08))
      .add(primitives.sphere({ name: "spark-69", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.17, 0.20, 0.28).scale(0.08))
      .add(primitives.sphere({ name: "spark-70", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.04, 0.31, 0.41).scale(0.08))
      .add(primitives.sphere({ name: "spark-71", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.18, 0.42, 0.45).scale(0.08))
      .add(primitives.sphere({ name: "spark-72", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.43, 0.53, 0.37).scale(0.08))
      .add(primitives.sphere({ name: "spark-73", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.63, 0.64, 0.16).scale(0.08))
      .add(primitives.sphere({ name: "spark-74", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(-0.71, 0.75, -0.16).scale(0.08))
      .add(primitives.sphere({ name: "spark-75", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(-0.62, 0.86, -0.52).scale(0.08))
      .add(primitives.sphere({ name: "spark-76", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-0.35, 0.97, -0.82).scale(0.08))
      .add(primitives.sphere({ name: "spark-77", material: material.emissive({ color: "#ff5ac8", emissive: "#ff5ac8" }) }).position(0.06, 1.08, -0.97).scale(0.08))
      .add(primitives.sphere({ name: "spark-78", material: material.emissive({ color: "#66e6ff", emissive: "#66e6ff" }) }).position(0.53, 1.19, -0.91).scale(0.08))
      .add(primitives.sphere({ name: "spark-79", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0.95, 1.30, -0.61).scale(0.08))
      .add(effects.bloom({ intensity: 1.2 }))
      .add(effects.fog({ density: 0.45, color: "#08111a" }))
      .add(primitives.plane({ name: "dark-floor", size: [10, 10, 1], material: material.pbr({ color: "#101822", roughness: 0.82 }) }).rotate(-Math.PI / 2, 0, 0))
});
window.__ENGINE_READOUT__ = () => {
  const d = app.diagnostics();
  return { routeHealth: d.errors.length ? "fail" : "pass", drawCalls: d.drawCalls, triangleCount: undefined };
};
