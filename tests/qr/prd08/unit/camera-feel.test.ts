/**
 * C-23 FeelBus + S-3 screen-feel uniforms + C-11 occluder fade contributor.
 */
import { describe, expect, it } from "vitest";
import {
  createFeelBus,
  createOccluderFade,
  createOccluderFadeContributor,
  createScreenOverlay,
  FEEL_PRESETS
} from "@aura3d/engine/lanes";
import type { AuraFeelEventSpec } from "@aura3d/engine/contracts";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { FrameContributorContext, RenderItem } from "@aura3d/rendering/contracts";

const HIT_HEAVY: AuraFeelEventSpec = {
  shake: 0.55,
  punch: { fov: -4, dolly: 0.35 },
  hitStop: { seconds: 0.07, scope: "actors" },
  haptics: { strong: 0.8, weak: 0.4, ms: 90 },
  audio: { cue: "hit-heavy", pitchJitter: 0.06 },
  vfx: { kind: "hit-spark", count: 18 },
  screen: { flash: 0.25, chroma: 0.6, radialBlur: 0.2 }
};

function ctx(flagsOn: boolean): FrameContributorContext {
  return {
    device: {} as never,
    width: 64, height: 64, frameIndex: 0, timeSeconds: 0,
    camera: null, source: {} as never, items: [],
    tier: {} as never,
    flags: resolveQrFlags({ options: flagsOn ? ["camera"] : [] }),
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard: new Map()
  } as FrameContributorContext;
}

describe("FeelBus channel dispatch", () => {
  it("dispatches every armed channel and counts executed only", () => {
    const calls: string[] = [];
    const bus = createFeelBus({
      camera: { shake: (a) => calls.push(`shake:${a}`), punch: (o) => calls.push(`punch:${o.fov},${o.dolly}`) },
      time: { hitStop: (s, o) => calls.push(`hitStop:${s}:${Array.isArray(o?.scope) ? o.scope.join("+") : "global"}`) },
      haptics: () => true,
      audio: () => true,
      vfx: () => false // provider stub produced nothing
    });
    bus.define("hit-heavy", HIT_HEAVY);
    bus.emit("hit-heavy", { actors: ["a", "b"], strength: 1 });
    const ev = bus.evidence();
    expect(ev.emitted).toBe(1);
    expect(ev.executed.shake).toBe(1);
    expect(ev.executed.punch).toBe(1);
    expect(ev.executed.hitStop).toBe(1);
    expect(ev.executed.haptics).toBe(1);
    expect(ev.executed.audio).toBe(1);
    expect(ev.executed.vfx).toBeUndefined();
    expect(calls).toContain("shake:0.55");
    expect(calls).toContain("punch:-4,0.35");
    expect(calls).toContain("hitStop:0.07:a+b");
  });

  it("is a no-op for undefined events and scales by strength", () => {
    const amounts: number[] = [];
    const bus = createFeelBus({ camera: { shake: (a) => amounts.push(a) } });
    bus.emit("nope");
    bus.define("x", { shake: 1 });
    bus.emit("x", { strength: 0.5 });
    expect(bus.evidence().emitted).toBe(1);
    expect(amounts).toEqual([0.5]);
  });

  it("reduced motion scales shake/punch and suppresses flash/chroma/radialBlur", () => {
    let shakeAmt = 0;
    const bus = createFeelBus({
      camera: { shake: (a) => { shakeAmt = a; }, punch: () => {} },
      reducedMotion: () => true
    });
    bus.define("hit-heavy", HIT_HEAVY);
    bus.emit("hit-heavy");
    expect(shakeAmt).toBeCloseTo(0.55 * 0.3, 6);
    const u = bus.screenUniforms();
    expect(u.flash).toBe(0);
    expect(u.chroma).toBe(0);
    expect(u.radialBlur).toBe(0);
  });
});

describe("FeelBus screen uniforms (S-3)", () => {
  it("arms impulse on emit, decays via advance, publishes center from VP", () => {
    const vp = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] as const;
    const bus = createFeelBus({ presentedViewProjection: () => vp });
    bus.define("e", { screen: { flash: 0.5, chroma: 0.4 } });
    bus.emit("e", { position: [1, 2, 3] });
    const u0 = bus.screenUniforms();
    expect(u0.flash).toBeCloseTo(0.5, 6);
    expect(u0.center).toEqual([1, 2]);
    bus.advance(0.2); // one halflife
    expect(bus.screenUniforms().flash).toBeCloseTo(0.25, 2);
    for (let i = 0; i < 12; i++) bus.advance(0.2);
    expect(bus.screenUniforms().flash).toBe(0);
  });

  it("screen channel counts executed only for pixel-producing parts", () => {
    // No overlay, no consumer → 0.
    const b1 = createFeelBus({});
    b1.define("e", { screen: { flash: 0.5 } });
    b1.emit("e");
    b1.advance(0.016);
    expect(b1.evidence().executed.screen).toBeUndefined();
    // Consumer flag → counts.
    const b2 = createFeelBus({ screen: { consumed: () => true } });
    b2.define("e", { screen: { chroma: 0.5 } });
    b2.emit("e");
    b2.advance(0.016);
    expect(b2.evidence().executed.screen).toBe(1);
  });

  it("DOM overlay apply reports pixels for flash/vignette", () => {
    const els: { style: Record<string, string> }[] = [];
    const body = { kids: [] as unknown[], appendChild(e: unknown) { this.kids.push(e); }, removeChild() {} };
    const doc = { createElement: () => { const el = { style: {} as Record<string, string> }; els.push(el); return el; }, body };
    const overlay = createScreenOverlay(doc as never);
    expect(overlay.apply({ flash: 0.4, chroma: 0, radialBlur: 0, vignette: 0, center: [0, 0] })).toBe(true);
    expect(Number(els[0].style.opacity)).toBeCloseTo(0.4, 6);
    expect(overlay.apply({ flash: 0, chroma: 0, radialBlur: 0, vignette: 0, center: [0, 0] })).toBe(false);
    overlay.dispose();
  });

  it("presets define real specs", () => {
    expect(Object.keys(FEEL_PRESETS.fighting)).toContain("hit-heavy");
    const bus = createFeelBus({ camera: { shake: () => {} } });
    bus.preset("arcade");
    bus.emit("explode");
    expect(bus.evidence().executed.shake).toBe(1);
  });
});

describe("OccluderFade contributor (C-11)", () => {
  const item = (label: string): RenderItem => ({ label } as RenderItem);

  it("fades only occluder items; flag off returns the input array", () => {
    const fade = createOccluderFade();
    fade.setOccluders(["wall"]);
    for (let i = 0; i < 240; i++) fade.update(1 / 60); // 4s → settled at 0.3
    const c = createOccluderFadeContributor(fade);
    const items = [item("hero"), item("wall"), item("ground")];
    const out = c.collect!(items, ctx(true));
    expect(out[0].cameraFade).toBeUndefined();
    expect(out[1].cameraFade).toBeCloseTo(0.3, 2);
    expect(out[2].cameraFade).toBeUndefined();
    const off = createOccluderFadeContributor(fade);
    const offItems = [item("wall")];
    expect(off.collect!(offItems, ctx(false))).toBe(offItems);
  });

  it("springs back to opaque and drops the node", () => {
    const fade = createOccluderFade();
    fade.setOccluders(["wall"]);
    fade.update(0.1);
    expect(fade.fadeFor("wall")).toBeLessThan(1);
    fade.setOccluders([]);
    for (let i = 0; i < 60; i++) fade.update(1 / 30);
    expect(fade.fadeFor("wall")).toBe(1);
  });
});
