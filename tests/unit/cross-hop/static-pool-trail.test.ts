/**
 * Real-GPU audit 2026-11-19: dozens of dark slabs stood in a row along the rail lanes. The couplers between train cars
 * move every frame but were written into the static "detail" pool, whose slots are only reset when the visible rows
 * change, so every frame's couplers piled up in its (shared, in-place) instance array: up to ~220 stale slabs.
 * The couplers now have their own dynamic pool. This drives the real sim + draw loop with the autopilot over trains and
 * checks the static pool never holds a coupler and the coupler pool holds only the current trains' couplers.
 */
import { describe, expect, it } from "vitest";
import { SIM_STEP, bindApp, startRun, st, step, syncVisuals } from "../../../apps/showcase-cross-hop/src/game/core";

type Spec = { position: number[]; scale: number[] };
const isCoupler = (s: Spec) => Math.abs(s.scale[0]! - 0.16) < 1e-6 && Math.abs(s.scale[1]! - 0.36) < 1e-6 && Math.abs(s.scale[2]! - 0.52) < 1e-6;
const visible = (s: Spec) => s.position[1]! > -100;

describe("cross hop static pools hold no per-frame movers", () => {
  it("train couplers never pile up in the static detail pool", () => {
    const pools = new Map<string, Spec[]>();
    const handle = (id: string) => ({
      setPosition() {}, setScale() {}, setRotation() {}, setAnimation() {}, setAnimationPose() {}, setVisible() {}, setMaterial() {},
      setInstances(specs: Spec[]) { pools.set(id, specs); }
    });
    const handles = new Map<string, ReturnType<typeof handle>>();
    const get = (id: string) => { if (!handles.has(id)) handles.set(id, handle(id)); return handles.get(id)!; };
    bindApp({ nodes: { add() {}, remove() {}, require: get, get }, camera: { setPose() {} }, output: { setOutputOverlay() {} }, effects: { burst() {} } } as never);
    st.profile = { best: 0, coins: 0, unlocked: ["hop"], selected: "hop", drills: [], seenIntro: true };
    st.banked = true;
    st.autopilot = true;
    startRun("quick", null, 42, 2);
    let framesWithTrain = 0, worstDetail = 0, worstCoupler = 0;
    for (let i = 0; i < 90 / SIM_STEP; i++) {
      step(SIM_STEP, { buffered: () => false } as never);
      if (i % 2 === 0) continue;
      syncVisuals(1);
      const detail = pools.get("pool-detail") ?? [];
      worstDetail = Math.max(worstDetail, detail.filter((s) => visible(s) && isCoupler(s)).length);
      const couplers = (pools.get("pool-coupler") ?? []).filter((s) => visible(s) && isCoupler(s)).length;
      worstCoupler = Math.max(worstCoupler, couplers);
      if (couplers > 0) framesWithTrain++;
    }
    expect(worstDetail, "couplers left in the static detail pool").toBe(0);
    expect(framesWithTrain, "a train was on screen").toBeGreaterThan(10);
    // two couplers per 3-car train; at most a handful of rail lanes are in view at once
    expect(worstCoupler).toBeLessThanOrEqual(12);
  });
});

import { chaseCameraX } from "../../../apps/showcase-cross-hop/src/game/core";

describe("cross hop chase camera keeps the critter on screen", () => {
  // Real-GPU audit 2026-11-19: at col +7 the critter sat past the right edge at 1280x720.
  const offset = (px: number, aspect: number) => {
    const [cx, tx] = chaseCameraX(px, aspect);
    return px - (cx + (tx - cx) * (5.3 / (5.3 + 4.4)));
  };
  const halfWidth = (aspect: number) => Math.hypot(5.3, 3.85 - 0.55) * Math.tan((50 * Math.PI) / 360) * aspect;
  for (const aspect of [1280 / 720, 390 / 844]) {
    it(`every column stays within 60 % of the half view width (aspect ${aspect.toFixed(2)})`, () => {
      for (let col = -7; col <= 7; col++) expect(Math.abs(offset(col, aspect))).toBeLessThanOrEqual(0.6 * halfWidth(aspect) + 1e-9);
    });
  }
  it("the centre columns keep the original partial follow", () => {
    const [cx, tx] = chaseCameraX(1, 16 / 9);
    expect(cx).toBeCloseTo(0.42, 6);
    expect(tx).toBeCloseTo(0.36, 6);
  });
});
