
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

mountShell("02 city block");

const nodes: any[] = [
  primitives.plane({ name: "city ground", material: material.pbr({ color: "#9fb49b", roughness: 0.86 }) }).position(0, -0.02, 0).scale([18, 1, 18]).toJSON(),
  primitives.box({ name: "north street", material: material.pbr({ color: "#202528", roughness: 0.8 }) }).position(0, 0.02, -2.2).scale([14, 0.04, 0.32]).toJSON(),
  primitives.box({ name: "south street", material: material.pbr({ color: "#202528", roughness: 0.8 }) }).position(0, 0.02, 2.2).scale([14, 0.04, 0.32]).toJSON(),
  primitives.box({ name: "center avenue", material: material.pbr({ color: "#171b1d", roughness: 0.78 }) }).position(0, 0.03, 0).scale([0.34, 0.04, 14]).toJSON()
];
const buildingColors = ["#52636b", "#7a6b58", "#415665", "#687983"];
for (let i = 0; i < 20; i += 1) {
  const h = 0.95 + ((i * 7) % 6) * 0.34;
  const x = (i % 5 - 2) * 1.55;
  const z = (Math.floor(i / 5) - 1.5) * 1.55;
  nodes.push(primitives.box({ name: `building ${i + 1}`, material: material.pbr({ color: buildingColors[i % buildingColors.length], roughness: 0.72, metallic: 0.04 }) }).position(x, h / 2, z).scale([0.48, h, 0.48]).toJSON());
  for (let y = 0.42; y < h; y += 0.42) {
    nodes.push(primitives.box({ name: `lit window band ${i + 1} ${y.toFixed(1)}`, material: material.emissive({ color: "#dff8ff", emissive: "#dff8ff" }) }).position(x, y, z + 0.5).scale([0.34, 0.052, 0.025]).toJSON());
  }
}
for (const [index, x, z] of [[1, -3.5, -3.4], [2, 3.5, -3.4], [3, -3.5, 3.4], [4, 3.5, 3.4]] as const) {
  nodes.push(primitives.cylinder({ name: `street light pole ${index}`, material: material.metal({ color: "#6f7d86", roughness: 0.34 }) }).position(x, 0.34, z).scale([0.035, 0.68, 0.035]).toJSON());
  nodes.push(primitives.sphere({ name: `street light glow ${index}`, material: material.emissive({ color: "#ffd98a", emissive: "#ffd98a" }) }).position(x, 0.74, z).scale(0.09).toJSON());
}
nodes.push(primitives.box({ name: "day night state marker", material: material.emissive({ color: "#93c5fd", emissive: "#93c5fd" }) }).position(-4.25, 0.32, 4.45).scale([0.68, 0.16, 0.18]).toJSON());

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: scene()
    .background("#8dcaf0")
    .camera(camera.perspective({ position: [4.8, 4.4, 6.6], target: [0, 0.85, 0], fov: 52 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.65, color: "#dcecff" }))
    .add(lights.directional({ position: [-4, 7, 5], intensity: 1.28, color: "#ffffff" }))
    .addMany(nodes)
});
window.__ENGINE_READOUT__ = () => engineReadout(app);
window.__ENGINE_READY__ = () => engineReady(window.__ENGINE_READOUT__?.());
