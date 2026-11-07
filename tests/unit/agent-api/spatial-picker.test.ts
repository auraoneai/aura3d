// K-01/K-03/K-07: scene-level picker over declarative nodes, hover/click binding, label overlay and annotations.
import { describe, expect, it } from "vitest";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { points } from "../../../packages/engine/src/agent-api/nodes/points";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { createSpatialPicker } from "../../../packages/engine/src/agent-api/spatialPicker";
import {
  annotationOverlayLabel, bindSpatialPicking, createDistanceAnnotation, createLabelOverlay, createPointAnnotation, measureDistance,
  parseAnnotation, planLabelOverlay, serializeAnnotation, worldToCss, cssToNdc, type SpatialPickEvent
} from "../../../packages/engine/src/agent-api/spatialInteraction";

const camera = { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], fov: 50 } as const;
const rayCamera = { position: [0, 0, 10] as const, target: [0, 0, 0] as const, fov: 50, aspect: 2 };
const viewport = { width: 200, height: 100 };

function compiled() {
  const positions = new Float32Array([0, 0, 0, 1, 1, 0, -1, -1, 0, 3, 0, 0]);
  return scene()
    .camera(camera)
    .add(points({ name: "cloud", positions, size: 4, position: [0, 0, -2] }))
    .add(instances.box({ name: "crates", transforms: [{ position: [-3, 0, 0] }, { position: [-3, 2, 0] }, { position: [-3, -2, 0], scale: 2 }] }))
    .toJSON();
}

const NDC_PER_UNIT = 1 / (10 * Math.tan((25 * Math.PI) / 180) * 2); // x ndc per world unit at z = 0, aspect 2

function fakeCanvas() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    listeners,
    addEventListener: (type: string, fn: (event: unknown) => void) => { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
    removeEventListener: (type: string, fn: (event: unknown) => void) => { listeners.get(type)?.delete(fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: viewport.width, height: viewport.height }),
    dispatch(type: string, event: object) { for (const fn of [...(listeners.get(type) ?? [])]) fn(event); }
  };
}
// CSS pixel of the world point (x, y) at z = 0 for the camera above.
const px = (x: number, y: number) => ({ clientX: (x * NDC_PER_UNIT * 0.5 + 0.5) * 200, clientY: (0.5 - (y * NDC_PER_UNIT * 2) * 0.5) * 100 });

describe("createSpatialPicker over a compiled scene", () => {
  const snap = compiled();

  it("picks a point through the pixel tolerance with nodeId, index, point and distance", () => {
    const picker = createSpatialPicker({ nodes: snap.nodes });
    // The cloud sits 2 units behind z = 0, so its points at x = +1 project slightly inward of the z = 0 plane.
    const sx = 1 * 10 / 12;
    const c = px(sx, sx * 1);
    const hit = picker.pick({ camera: rayCamera, ndc: [(c.clientX / 200) * 2 - 1, 1 - (c.clientY / 100) * 2] }, { viewport, pixelRadius: 6, kinds: "points" });
    expect(hit?.kind).toBe("point");
    expect(hit?.nodeName).toBe("cloud");
    if (hit?.kind === "point") {
      expect(hit.index).toBe(1);
      expect(hit.point[0]).toBeCloseTo(1, 5);
      expect(hit.point[2]).toBeCloseTo(-2, 5);
      expect(hit.distance).toBeGreaterThan(11.9); expect(hit.distance).toBeLessThan(12.2);
    }
    expect(picker.pick({ camera: rayCamera, ndc: [0.9, 0.9] }, { viewport, pixelRadius: 6, kinds: "points" })).toBeUndefined();
  });

  it("picks an instance with instanceId, point and normal, honouring scale", () => {
    const picker = createSpatialPicker({ nodes: snap.nodes });
    const ndcFor = (x: number, y: number) => [x * NDC_PER_UNIT, y * NDC_PER_UNIT * 2] as const;
    const a = picker.pick({ camera: rayCamera, ndc: ndcFor(-3, 2) }, { kinds: "instances" });
    expect(a?.kind === "instance" && a.instanceId).toBe(1);
    const b = picker.pick({ camera: rayCamera, ndc: ndcFor(-3, -2.8) }, { kinds: "instances" });
    expect(b?.kind === "instance" && b.instanceId).toBe(2); // the scale-2 crate reaches y = -3
    expect(a?.kind === "instance" && a.normal[2]).toBeGreaterThan(0.9);
    expect(a?.nodeName).toBe("crates");
    expect(picker.pick({ camera: rayCamera, ndc: ndcFor(-3, 1) }, { kinds: "instances" })).toBeUndefined();
  });

  it("reuses indices across picks and rebuilds after invalidate", () => {
    const picker = createSpatialPicker({ nodes: snap.nodes });
    const ray = { origin: [-3, 0, 10] as const, direction: [0, 0, -1] as const };
    picker.pick(ray); picker.pick(ray); picker.pick(ray);
    expect(picker.buildCount).toBe(2);
    picker.invalidate("crates");
    picker.pick(ray);
    expect(picker.buildCount).toBe(3);
  });

  it("pickAll returns the nearest point and the nearest instance separately", () => {
    const picker = createSpatialPicker({ nodes: snap.nodes });
    const all = picker.pickAll({ origin: [-3, 0, 10], direction: [0, 0, -1] }, { worldRadius: 0.2 });
    expect(all.map((h) => h.kind)).toEqual(["instance"]);
  });
});

describe("bindSpatialPicking", () => {
  it("coalesces pointer moves to one pick per frame, diffs enter/leave, and emits clicks", () => {
    const snap = compiled();
    const canvas = fakeCanvas();
    const frames: Array<() => void> = [];
    const events: SpatialPickEvent[] = [];
    const binding = bindSpatialPicking({ canvas, scene: snap }, (e) => events.push(e), { schedule: (cb) => frames.push(cb), pick: { kinds: "instances" } });
    const over = px(-3, 2), away = px(0, 4);
    for (let i = 0; i < 5; i += 1) canvas.dispatch("pointermove", over);
    expect(frames.length).toBe(1);
    frames.shift()!();
    expect(binding.pickCount).toBe(1);
    expect(events.map((e) => e.type)).toEqual(["enter"]);
    expect(events[0]!.hit?.kind === "instance" && events[0]!.hit.instanceId).toBe(1);
    canvas.dispatch("pointermove", over);
    frames.shift()!();
    expect(events.map((e) => e.type)).toEqual(["enter", "move"]);
    canvas.dispatch("pointermove", away);
    frames.shift()!();
    expect(events.map((e) => e.type)).toEqual(["enter", "move", "leave"]);
    // Click: down and up in place picks; a drag does not.
    canvas.dispatch("pointerdown", over); canvas.dispatch("pointerup", over);
    expect(events.at(-1)?.type).toBe("click");
    expect(events.at(-1)?.hit?.kind === "instance" && events.at(-1)!.hit!.kind).toBe("instance");
    const count = events.length;
    canvas.dispatch("pointerdown", over); canvas.dispatch("pointerup", away);
    expect(events.length).toBe(count);
    binding.dispose();
    expect([...canvas.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
});

describe("labels", () => {
  // Orthographic-style identity view-projection: ndc == world xy, z in [-1, 1], w = 1.
  const identity = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  it("projects to CSS pixels and round-trips through NDC", () => {
    const p = worldToCss(identity, [0.5, -0.5, 0], viewport);
    expect(p.x).toBeCloseTo(150, 6);
    expect(p.y).toBeCloseTo(75, 6);
    expect(p.visible).toBe(true);
    expect(cssToNdc(p.x, p.y, viewport)[0]).toBeCloseTo(0.5, 6);
    expect(cssToNdc(p.x, p.y, viewport)[1]).toBeCloseTo(-0.5, 6);
    expect(worldToCss(identity, [2, 0, 0], viewport).visible).toBe(false);
    expect(worldToCss(identity, [2, 0, 0], viewport, 200).visible).toBe(true);
    const behind = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, -1]);
    expect(worldToCss(behind, [0, 0, 0], viewport).visible).toBe(false);
  });

  it("culls, orders by priority then nearness, and caps", () => {
    const labels = [
      { id: "far", text: "far", position: [0, 0, 0.9] as const },
      { id: "near", text: "near", position: [0.1, 0, -0.9] as const },
      { id: "vip", text: "vip", position: [0.2, 0, 0.5] as const, priority: 5 },
      { id: "off", text: "off", position: [5, 5, 0] as const }
    ];
    const plan = planLabelOverlay(identity, viewport, labels, { maxLabels: 2 });
    expect(plan.map((p) => p.label.id)).toEqual(["vip", "near"]);
    expect(planLabelOverlay(identity, viewport, labels).map((p) => p.label.id)).toEqual(["vip", "near", "far"]);
  });

  it("pools elements, writes only changed fields, hides the surplus, and disposes", () => {
    const made: Array<{ textContent: string | null; className: string; style: { transform: string; display: string }; removed: boolean; remove(): void }> = [];
    const container = { appendChild: () => undefined };
    const overlay = createLabelOverlay(container, {
      maxLabels: 10,
      createElement: () => { const el = { textContent: "", className: "", style: { transform: "", display: "" }, removed: false, remove() { el.removed = true; } }; made.push(el); return el; }
    });
    const labels = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, text: `L${i}`, position: [i * 0.1 - 0.2, 0, 0] as const }));
    overlay.update(identity, viewport, labels);
    expect(overlay.shown).toBe(5);
    expect(made.length).toBe(5);
    const writes = overlay.writes;
    overlay.update(identity, viewport, labels);
    expect(overlay.writes).toBe(writes);
    overlay.update(identity, viewport, labels.slice(0, 2));
    expect(overlay.shown).toBe(2);
    expect(made[4]!.style.display).toBe("none");
    overlay.update(identity, viewport, labels);
    expect(made.length).toBe(5);
    expect(made[4]!.style.display).toBe("");
    overlay.dispose();
    expect(made.every((m) => m.removed)).toBe(true);
  });

  it("culls and caps 5000 labels inside a loose per-frame bound", () => {
    const labels = Array.from({ length: 5000 }, (_, i) => ({ id: `l${i}`, text: String(i), position: [((i * 7919) % 400) / 100 - 2, ((i * 104729) % 400) / 100 - 2, 0] as const }));
    const t = performance.now();
    let n = 0;
    for (let f = 0; f < 20; f += 1) n = planLabelOverlay(identity, viewport, labels, { maxLabels: 100 }).length;
    expect(n).toBe(100);
    expect((performance.now() - t) / 20).toBeLessThan(50);
  });
});

describe("measurement and annotation", () => {
  it("measures distance and builds a serializable two-point annotation from picks", () => {
    expect(measureDistance([0, 0, 0], [3, 4, 0]).distance).toBe(5);
    const a = { kind: "point" as const, nodeId: "n1", nodeName: "cloud", index: 3, point: [0, 0, 0] as const, distance: 1, rayDistance: 0 };
    const b = { kind: "instance" as const, nodeId: "n2", nodeName: "crates", instanceId: 1, point: [3, 4, 0] as const, normal: [0, 0, 1] as const, distance: 2 };
    const record = createDistanceAnnotation(a, b, { id: "m1", unit: "m", createdAt: 1000, attributes: { author: "t" } });
    expect(record.value).toBe(5);
    expect(record.text).toBe("5.00 m");
    expect(record.points[0]).toEqual({ position: [0, 0, 0], nodeId: "n1", nodeName: "cloud", kind: "point", index: 3 });
    expect(record.points[1]).toMatchObject({ kind: "instance", instanceId: 1 });
    expect(parseAnnotation(serializeAnnotation(record))).toEqual(record);
    expect(annotationOverlayLabel(record).position).toEqual([1.5, 2, 0]);
    expect(createPointAnnotation(a, { id: "p1", createdAt: 1 }).type).toBe("point");
    expect(() => parseAnnotation(JSON.stringify({ id: "x" }))).toThrow(/ANNOTATION_INVALID/);
  });
});
