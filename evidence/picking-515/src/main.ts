// Lane 515 probe page: 100K points + 5K instances, CPU picking, hover/click, label overlay, annotation.
// Built with esbuild (evidence/picking-515/tools/build.mjs); driven over loopback CDP by tools/capture.mjs.
import { camera, createAuraApp, createDistanceAnnotation, createLabelOverlay, createSpatialPicker, bindSpatialPicking, instances, lights, material, measureDistance, points, scene, worldToCss, type SpatialPickEvent, type SpatialPickHit, type OverlayLabel } from "../../../packages/engine/src/public/index.ts";
import { runtimeNodeQueryState } from "../../../packages/engine/src/agent-api/app/runtimeNodes.ts";
import { presentedViewProjection } from "../../../packages/engine/src/agent-api/camera/CameraController.ts";

const N_POINTS = 100_000, N_INSTANCES = 5_000;
const W = 960, H = 540;

// Deterministic spiral-galaxy cloud and an instance ring field.
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const positions = new Float32Array(N_POINTS * 3);
for (let i = 0; i < N_POINTS; i += 1) {
  const arm = i % 3, t = rnd() * 6 + 0.2, a = arm * 2.094 + t * 1.1 + (rnd() - 0.5) * 0.35;
  const r = t * 1.1;
  positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 1] = (rnd() - 0.5) * 0.4 * (1 + 1 / t); positions[i * 3 + 2] = Math.sin(a) * r;
}
const transforms = Array.from({ length: N_INSTANCES }, (_, i) => {
  const ring = 8.5 + (i % 5) * 0.5, a = (i / N_INSTANCES) * Math.PI * 2 * 5;
  return { position: [Math.cos(a) * ring, -1.5 + ((i * 37) % 11) * 0.06, Math.sin(a) * ring] as const, scale: [0.18, 0.18 + ((i * 13) % 7) * 0.03, 0.18] as const };
});

const root = document.getElementById("app")!;
const app = createAuraApp(root, {
  scene: scene({ background: "#0b0f14" })
    .camera(camera.perspective({ position: [0, 9, 17], target: [0, -0.5, 0], fov: 48 }))
    .add(lights.ambient({ intensity: 0.9 }))
    .add(lights.directional({ position: [5, 9, 4], target: [0, 0, 0], intensity: 2.2 }))
    .add(points({ name: "cloud", positions, size: 2.5, sizeAttenuation: false, runtime: { id: "cloud" } }))
    .add(instances.box({ name: "crates", transforms, material: material.pbr({ color: "#e0a458", roughness: 0.6 }), runtime: { id: "crates" } }))
});
const canvas = (app as unknown as { canvas: HTMLCanvasElement }).canvas;

const readout = document.getElementById("readout")!;
const marker = document.getElementById("marker")!;
const overlayHost = document.getElementById("labels")!;
const overlay = createLabelOverlay(overlayHost, { maxLabels: 12 });
const picks: SpatialPickHit[] = [];
let lastHover: SpatialPickHit | undefined;
const events: Array<{ type: string; kind?: string; id?: number; node?: string }> = [];

const sourcesFor = (mode: "handles" | "nodes") => () => (mode === "handles" ? { handles: app.nodes.all() } : { nodes: app.scene.nodes });
const picker = createSpatialPicker(sourcesFor("handles"));
const binding = bindSpatialPicking(app as never, (e: SpatialPickEvent) => {
  events.push({ type: e.type, ...(e.hit ? { kind: e.hit.kind, id: e.hit.kind === "point" ? e.hit.index : e.hit.instanceId, node: e.hit.nodeName } : {}) });
  if (e.type === "enter" || e.type === "move") lastHover = e.hit;
  if (e.type === "leave") lastHover = undefined;
  if (e.type === "click" && e.hit) {
    picks.push(e.hit);
    if (picks.length > 2) picks.shift();
  }
  render();
}, { picker, pick: { pixelRadius: 8 } });

function render(): void {
  const vp = presentedViewProjection(app as never);
  const rect = canvas.getBoundingClientRect();
  const viewport = { width: rect.width, height: rect.height };
  const labels: OverlayLabel[] = picks.map((p, i) => ({ id: `pick${i}`, text: `#${i + 1} ${p.kind === "point" ? `point ${p.index}` : `instance ${p.instanceId}`}`, position: p.point, offset: [10, -18], priority: 2 }));
  if (picks.length === 2) {
    const ann = createDistanceAnnotation(picks[0]!, picks[1]!, { id: "d1", unit: "u", createdAt: 0 });
    labels.push({ id: "dist", text: ann.text, position: [(picks[0]!.point[0] + picks[1]!.point[0]) / 2, (picks[0]!.point[1] + picks[1]!.point[1]) / 2, (picks[0]!.point[2] + picks[1]!.point[2]) / 2], priority: 3 });
  }
  if (vp) overlay.update(vp, viewport, labels);
  const last = picks.at(-1);
  if (last && vp) {
    const c = worldToCss(vp, last.point, viewport);
    marker.style.display = c.visible ? "block" : "none";
    marker.style.transform = `translate(${c.x}px,${c.y}px)`;
  } else marker.style.display = "none";
  const fmt = (h: SpatialPickHit | undefined) => h ? `${h.kind} ${h.nodeName} ${h.kind === "point" ? "index " + h.index : "instance " + h.instanceId} d=${h.distance.toFixed(2)}` : "none";
  readout.textContent = `hover: ${fmt(lastHover)} | clicks: ${picks.map(fmt).join(" ; ") || "none"}${picks.length === 2 ? ` | distance ${measureDistance(picks[0]!.point, picks[1]!.point).distance.toFixed(3)}` : ""}`;
}

type Bench = { meanMs: number; n: number; firstPickMs: number; hits: number; mode: string };
function bench(kind: "points" | "instances" | "all", n = 1000, mode: "handles" | "nodes" = "handles"): Bench {
  const rect = canvas.getBoundingClientRect();
  const cam = { viewProjectionMatrix: presentedViewProjection(app as never)! };
  const r = (() => { let s = 99; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
  const fresh = createSpatialPicker(sourcesFor(mode));
  const opts = { kinds: kind, viewport: { width: rect.width, height: rect.height } } as const;
  const t0 = performance.now();
  fresh.pick({ camera: cam, ndc: [0, 0] }, opts);
  const first = performance.now() - t0;
  const ndcs = Array.from({ length: n }, () => [r() * 1.6 - 0.8, r() * 1.6 - 0.8] as const);
  let hits = 0;
  const t1 = performance.now();
  for (const ndc of ndcs) if (fresh.pick({ camera: cam, ndc }, opts)) hits += 1;
  const total = performance.now() - t1;
  return { meanMs: total / n, n, firstPickMs: first, hits, mode };
}

const api = {
  debug: () => app.nodes.all().map((h) => { const st = runtimeNodeQueryState(h) as unknown as { node: { kind: string; instances?: unknown[] }; instanceMatrices?: Float32Array } | undefined; return { id: h.id, ok: !!st, kind: st?.node.kind, instances: st?.node.instances?.length, dense: st?.instanceMatrices?.length }; }),
  ready: async () => { await app.ready(); return true; },
  viewport: () => { const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; },
  bench,
  
  /** Project a node-local world point to client pixels (for scripted clicks). */
  toClient: (p: readonly [number, number, number]) => { const r = canvas.getBoundingClientRect(); const c = worldToCss(presentedViewProjection(app as never)!, p, { width: r.width, height: r.height }); return { x: r.left + c.x, y: r.top + c.y, visible: c.visible }; },
  positions: () => positions,
  instance: (i: number) => transforms[i]!.position,
  state: () => ({ events, picks: picks.map((p) => ({ kind: p.kind, node: p.nodeName, id: p.kind === "point" ? p.index : p.instanceId, point: p.point })), pickCount: binding.pickCount, shown: overlay.shown, readout: readout.textContent, markerVisible: marker.style.display !== "none", handles: app.nodes.all().length }),
  frameCount: () => (app as unknown as { diagnostics?: { snapshot?: () => { frames?: number } } }).diagnostics?.snapshot?.()?.frames,
  counts: { points: N_POINTS, instances: N_INSTANCES, w: W, h: H }
};
(window as unknown as { __PICK__: typeof api }).__PICK__ = api;
