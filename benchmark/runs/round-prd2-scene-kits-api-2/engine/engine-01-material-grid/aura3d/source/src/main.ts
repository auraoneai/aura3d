
import { camera, createAuraApp, interactions, lights, material, primitives, scene } from "@aura3d/engine";

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

mountShell("01 material grid");

const nodes = [
  primitives.box({ name: "matte studio plinth", material: material.pbr({ color: "#5f6875", roughness: 0.46, metallic: 0.03 }) }).position(0, 0.04, -0.52).scale([8.2, 0.12, 1.92]).toJSON(),
  primitives.box({ name: "white softbox reflection strip", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(0, 2.0, -1.34).scale([5.9, 0.14, 0.08]).toJSON(),
  primitives.sphere({ name: "metal swatch", material: material.pbr({ color: "#eef7ff", roughness: 0.08, metallic: 1 }) }).position(-2.8, 0.82, -0.52).scale(0.86).toJSON(),
  primitives.sphere({ name: "glass swatch", material: material.pbr({ color: "#a8ecff", opacity: 0.36, roughness: 0.08, metallic: 0 }) }).position(-1.4, 0.82, -0.52).scale(0.86).toJSON(),
  primitives.sphere({ name: "rubber swatch", material: material.rubber({ color: "#151820", roughness: 1 }) }).position(0, 0.82, -0.52).scale(0.86).toJSON(),
  primitives.sphere({ name: "emissive swatch", material: material.emissive({ color: "#ff42c8", emissive: "#ff42c8" }) }).position(1.4, 0.82, -0.52).scale(0.86).toJSON(),
  primitives.sphere({ name: "clearcoat swatch", material: material.pbr({ color: "#ef233c", roughness: 0.12, metallic: 0.05 }) }).position(2.8, 0.82, -0.52).scale(0.86).toJSON()
];

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: scene()
    .background("#071017")
    .camera(camera.perspective({ position: [0, 2.0, 7.2], target: [0, 0.82, -0.52], fov: 42 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.62, color: "#dcecff" }))
    .add(lights.directional({ position: [-3.4, 5.5, 4.4], intensity: 1.35, color: "#ffffff" }))
    .addMany(nodes)
});
window.__ENGINE_READOUT__ = () => engineReadout(app);
window.__ENGINE_READY__ = () => engineReady(window.__ENGINE_READOUT__?.());
