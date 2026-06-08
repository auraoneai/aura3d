import { describe, expect, it } from "vitest";
import { createSpringChain, type Vec3 } from "../../../packages/animation/src";

const REST: Vec3[] = [
  [0, 2, 0],
  [0, 1.5, 0],
  [0, 1, 0],
  [0, 0.5, 0],
  [0, 0, 0]
];
const DT = 1 / 60;

function rootAt(x: number, y = 2, z = 0) {
  return { position: [x, y, z] as Vec3 };
}

describe("createSpringChain", () => {
  it("requires at least a root + one child", () => {
    expect(() => createSpringChain({ bones: [[0, 0, 0]] })).toThrow(/at least/);
  });

  it("settles back to the rest pose with no gravity after a perturbation (energy decays)", () => {
    const chain = createSpringChain({ bones: REST, stiffness: 40, damping: 8, gravity: [0, 0, 0] });
    // Perturb: yank the root sideways for a few frames to build displacement + velocity.
    for (let i = 0; i < 10; i += 1) chain.integrate(DT, rootAt(0.8));
    const peakEnergy = chain.telemetry().kineticEnergy;
    // Hold the root back at rest and let it settle.
    for (let i = 0; i < 800; i += 1) chain.integrate(DT, rootAt(0));
    const settled = chain.telemetry();
    expect(settled.kineticEnergy).toBeLessThan(1e-3);
    expect(settled.kineticEnergy).toBeLessThan(peakEnergy);
    // Tip returns to the rest pose (root - 2 on Y => displacement ~2).
    expect(settled.maxDisplacement).toBeCloseTo(2, 2);
    const tip = settled.tipPosition;
    expect(tip[0]).toBeCloseTo(0, 2);
    expect(tip[1]).toBeCloseTo(0, 2);
  });

  it("swings (tip lags) under root acceleration", () => {
    const chain = createSpringChain({ bones: REST, stiffness: 30, damping: 2, gravity: [0, 0, 0] });
    let maxLag = 0;
    for (let i = 0; i < 30; i += 1) {
      chain.integrate(DT, rootAt(i * 0.06)); // accelerate the root in +x
      const t = chain.telemetry();
      maxLag = Math.max(maxLag, Math.abs(t.rootPosition[0] - t.tipPosition[0]));
    }
    expect(maxLag).toBeGreaterThan(0.05); // tip visibly lags behind the root
  });

  it("maintains bone length via the distance constraint", () => {
    const chain = createSpringChain({ bones: REST, stiffness: 50, damping: 1, gravity: [0, -9.81, 0] });
    for (let i = 0; i < 60; i += 1) chain.integrate(DT, rootAt(Math.sin(i * 0.2) * 0.5));
    const pos = chain.positions();
    for (let i = 1; i < pos.length; i += 1) {
      const segment = Math.hypot(pos[i]![0] - pos[i - 1]![0], pos[i]![1] - pos[i - 1]![1], pos[i]![2] - pos[i - 1]![2]);
      expect(segment).toBeCloseTo(0.5, 3); // each rest segment is 0.5
    }
  });

  it("pushes particles out of a sphere collider", () => {
    const collider = { kind: "sphere" as const, center: [0, 1, 0] as Vec3, radius: 0.4 };
    const chain = createSpringChain({ bones: REST, stiffness: 30, damping: 3, gravity: [0, -9.81, 0], colliders: [collider] });
    let sawContact = false;
    for (let i = 0; i < 200; i += 1) {
      chain.integrate(DT, rootAt(0));
      if (chain.telemetry().collisionContacts > 0) sawContact = true;
    }
    expect(sawContact).toBe(true);
    // No particle ends up inside the collider.
    for (const p of chain.positions()) {
      const d = Math.hypot(p[0] - collider.center[0], p[1] - collider.center[1], p[2] - collider.center[2]);
      expect(d).toBeGreaterThanOrEqual(collider.radius - 1e-3);
    }
  });

  it("is deterministic with a fixed dt", () => {
    const a = createSpringChain({ bones: REST, stiffness: 40, damping: 4, gravity: [0, -9.81, 0] });
    const b = createSpringChain({ bones: REST, stiffness: 40, damping: 4, gravity: [0, -9.81, 0] });
    for (let i = 0; i < 50; i += 1) {
      a.integrate(DT, rootAt(Math.sin(i * 0.3) * 0.4));
      b.integrate(DT, rootAt(Math.sin(i * 0.3) * 0.4));
    }
    expect(a.positions()).toEqual(b.positions());
  });
});
