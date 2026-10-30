// GU47 WP-6 (E-F) item 5: app.effects.trail(target, { width, life, color,
// widthOverSpeed }) is a real ribbon on the RibbonBatch (no VFX_TRAIL_PENDING).

import { describe, expect, it } from "vitest";
import { RIBBON_VERTEX_FLOATS } from "../../../../packages/rendering/src/vfx/RibbonBatch";
import { ProductionEffectSystem, trailWidthScale, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import { createAppEffects } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

interface Mover { position: [number, number, number]; getWorldPosition(): readonly number[] }

function harness(tier: "low" | "high" = "high") {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  const onFrame = (cb: (frame: { dt: number }) => void) => { callbacks.push(cb); return () => undefined; };
  const car: Mover = { position: [0, 0.5, 0], getWorldPosition: () => car.position };
  const appLike: AppLike = { scene: { nodes: [] }, onFrame, nodes: { get: (id: string) => (id === "car" ? car : undefined) as never } };
  const system = new ProductionEffectSystem(appLike, { tier });
  const fx = createAppEffects({ onFrame } as never, system);
  const step = (dt: number) => { for (const cb of callbacks) cb({ dt }); };
  return { system, fx, car, step };
}

/** Drive the car along +X at `speed` m/s for `seconds` at 60 Hz. */
function drive(h: ReturnType<typeof harness>, speed: number, seconds: number): void {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    h.car.position = [h.car.position[0] + speed / 60, 0.5, 0];
    h.step(1 / 60);
  }
}

describe("GU47 E-F item 5: real trail", () => {
  it("a node moving at 25 m/s leaves a ribbon >= 30 m long (life 1.5 s) and no VFX_TRAIL_PENDING", () => {
    const h = harness();
    const trail = h.fx.trail("car", { width: 0.4, life: 1.5, color: "#ffcc66" });
    drive(h, 25, 2);
    expect(trail.alive).toBe(true);
    expect(trail.length).toBeGreaterThanOrEqual(30);
    expect(trail.length).toBeLessThanOrEqual(25 * 1.5 + 1);
    expect(trail.pointCount).toBeGreaterThan(60);
    const codes = h.system.diagnostics.report().errors.map((e) => e.code);
    expect(codes).not.toContain("VFX_TRAIL_PENDING");
    const geometry = h.system.ribbonFeed().buildAll([0, 6, 20]);
    expect(geometry).toHaveLength(1);
    expect(geometry[0].triangleCount).toBe((trail.pointCount - 1) * 2);
  });

  it("the head (at the node) is opaque and the tail fades", () => {
    const h = harness();
    h.fx.trail("car", { width: 0.4, life: 1, color: [1, 1, 1] });
    drive(h, 10, 1.2);
    const [geometry] = h.system.ribbonFeed().buildAll([0, 6, 20]);
    const alphaAt = (pointIndex: number) => geometry.vertices[pointIndex * 2 * RIBBON_VERTEX_FLOATS + 11];
    const headX = geometry.vertices[0];
    const tailX = geometry.vertices[(geometry.vertexCount - 2) * RIBBON_VERTEX_FLOATS];
    expect(headX).toBeGreaterThan(tailX); // the newest point (nearest the car) comes first
    expect(Math.abs(headX - h.car.position[0])).toBeLessThan(0.5);
    expect(alphaAt(0)).toBeGreaterThan(0.4);
    expect(alphaAt(geometry.vertexCount / 2 - 1)).toBeLessThan(0.05);
  });

  it("widthOverSpeed: zero width at or below the low speed, full width at the high speed", () => {
    expect(trailWidthScale(0, [2, 10])).toBe(0);
    expect(trailWidthScale(6, [2, 10])).toBeCloseTo(0.5, 6);
    expect(trailWidthScale(30, [2, 10])).toBe(1);
    expect(trailWidthScale(3, undefined)).toBe(1);
    const h = harness();
    h.fx.trail("car", { width: 1, life: 2, color: "#ffffff", widthOverSpeed: [2, 10] });
    drive(h, 1, 0.5); // crawling: ribbon points with zero width
    drive(h, 20, 0.5); // fast: full width
    const points = h.system.ribbonFeed().getTrail([...(h.system as unknown as { trails: Map<string, unknown> }).trails.keys()][0])!.getPoints();
    expect(points[0].width).toBeCloseTo(1, 5); // head, fast
    expect(points[points.length - 1].width).toBe(0); // tail, crawling
  });

  it("stop() lets the ribbon fade over its life, then removes it; stop({ immediate }) removes it at once", () => {
    const h = harness();
    const slow = h.fx.trail("car", { width: 0.3, life: 0.5 });
    drive(h, 8, 0.5);
    slow.stop();
    expect(slow.alive).toBe(true);
    const before = slow.pointCount;
    drive(h, 8, 0.25);
    expect(slow.pointCount).toBeLessThan(before); // not growing, expiring
    drive(h, 8, 0.4);
    expect(slow.alive).toBe(false);
    expect(h.system.ribbonFeed().trailCount).toBe(0);
    const fast = h.fx.trail("car", { width: 0.3, life: 2 });
    drive(h, 8, 0.2);
    fast.stop({ immediate: true });
    expect(fast.alive).toBe(false);
    expect(h.system.ribbonFeed().trailCount).toBe(0);
  });

  it("setPosition appends manual points; clear drops them; runtime off returns an inert handle", () => {
    const h = harness();
    const manual = h.fx.trail("missing-node", { width: 0.2, life: 3 });
    manual.setPosition([0, 0, 0]);
    manual.setPosition([0, 0, 5]);
    expect(manual.pointCount).toBe(2);
    expect(manual.length).toBeCloseTo(5, 5);
    manual.clear();
    expect(manual.pointCount).toBe(0);
    h.fx.runtime = "off";
    const off = h.fx.trail("car", { width: 0.2, life: 1 });
    drive(h, 10, 0.3);
    expect(off.alive).toBe(false);
    expect(off.length).toBe(0);
  });

  it("low tier caps the ribbon ring", () => {
    const h = harness("low");
    const trail = h.fx.trail("car", { width: 0.3, life: 4 });
    drive(h, 30, 3);
    expect(trail.pointCount).toBeLessThanOrEqual(120);
  });
});
