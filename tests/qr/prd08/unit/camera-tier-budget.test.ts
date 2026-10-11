/**
 * PRD-08 §17 / §19 tier rules in lane code (S19 defects fixed here):
 *  - the camera probe had no per-frame sphere-cast cap: any number of casts
 *    ran on every tier (§19 "≤ 1 camera sphere cast per frame" on Low);
 *  - the occluder fade had no tier gate: Low ("fade feature off") still
 *    stamped `cameraFade` on draws;
 *  - `app.feel` published the full screen-feel uniforms on every tier —
 *    `screenUniformsForTier` existed but was never called, so Low published
 *    chroma + radial blur ("flash + vignette only").
 */
import { afterEach, describe, expect, it } from "vitest";
import { camera, createAuraApp, lights, primitives, scene, type AuraApp } from "@aura3d/engine";
import {
  CAMERA_PROBE_TIER_BUDGETS,
  cameraProbeBudgetForTier,
  createCameraProbe,
  createChaseRig,
  createOccluderFade,
  createOccluderFadeContributor,
  type AuraCameraProbeBudget
} from "@aura3d/engine/lanes";
import type { FrameContributorContext, RenderItem } from "@aura3d/rendering/contracts";

const wall = { id: "wall", min: [-2, -2, -0.5] as const, max: [2, 2, 0.5] as const };
const budgeted = (b: AuraCameraProbeBudget | undefined) => createCameraProbe({ bounds: () => [wall], budget: () => b });

describe("camera probe tier budget (§17)", () => {
  it("caps sphere casts per frame and resets on beginFrame", () => {
    const probe = budgeted(CAMERA_PROBE_TIER_BUDGETS.low);
    probe.beginFrame();
    expect(probe.sphereCast([0, 0, 5], [0, 0, -5], 0.2).hit).toBe(true);
    // Over the Low cap: refused (no hit, counted denied).
    expect(probe.sphereCast([0, 0, 5], [0, 0, -5], 0.2).hit).toBe(false);
    expect(probe.stats()).toEqual({ sphereCasts: 1, occluderQueries: 0, deniedCasts: 1, deniedOccluderQueries: 0 });
    probe.beginFrame();
    expect(probe.sphereCast([0, 0, 5], [0, 0, -5], 0.2).hit).toBe(true);
    expect(probe.stats().sphereCasts).toBe(1);
  });

  it("Low denies the occluder query (fade off)", () => {
    const probe = budgeted(CAMERA_PROBE_TIER_BUDGETS.low);
    probe.beginFrame();
    expect(probe.occluders([0, 0, 5], [0, 0, -5])).toEqual([]);
    expect(probe.stats().deniedOccluderQueries).toBe(1);
  });

  it("Medium/High spend a cast slot on the occluder query; Ultra has a dedicated one", () => {
    for (const tier of ["medium", "high"] as const) {
      const probe = budgeted(CAMERA_PROBE_TIER_BUDGETS[tier]);
      probe.beginFrame();
      expect(probe.occluders([0, 0, 5], [0, 0, -5])).toEqual(["wall"]);
      for (let i = 0; i < 5; i += 1) probe.sphereCast([0, 0, 5], [0, 0, -5], 0.2);
      const s = probe.stats();
      expect(s.sphereCasts, tier).toBe(CAMERA_PROBE_TIER_BUDGETS[tier].sphereCasts);
      expect(s.occluderQueries, tier).toBe(0);
    }
    const ultra = budgeted(CAMERA_PROBE_TIER_BUDGETS.ultra);
    ultra.beginFrame();
    expect(ultra.occluders([0, 0, 5], [0, 0, -5])).toEqual(["wall"]);
    for (let i = 0; i < 5; i += 1) ultra.sphereCast([0, 0, 5], [0, 0, -5], 0.2);
    expect(ultra.stats()).toMatchObject({ sphereCasts: 3, occluderQueries: 1, deniedCasts: 2 });
  });

  it("no budget keeps the standalone probe unlimited; unknown tier → high", () => {
    const probe = budgeted(undefined);
    probe.beginFrame();
    for (let i = 0; i < 10; i += 1) expect(probe.sphereCast([0, 0, 5], [0, 0, -5], 0.2).hit).toBe(true);
    expect(cameraProbeBudgetForTier("auto")).toBe(CAMERA_PROBE_TIER_BUDGETS.high);
  });
});

describe("occluder fade contributor tier gate", () => {
  const ctx = { flags: { on: (f: string) => f === "A3D_QR_CAMERA" }, frameIndex: 0 } as unknown as FrameContributorContext;
  it("Low passes items through untouched; Medium stamps cameraFade", () => {
    const fade = createOccluderFade();
    fade.setOccluders(["wall"]);
    fade.update(0.5);
    const items = [{ label: "wall" }] as unknown as RenderItem[];
    expect(createOccluderFadeContributor(fade, { tier: () => "low" }).collect!(items, ctx)).toBe(items);
    const out = createOccluderFadeContributor(fade, { tier: () => "medium" }).collect!(items, ctx);
    expect(out).not.toBe(items);
    expect(out[0]!.cameraFade).toBeLessThan(1);
  });
});

describe("mounted app follows app.quality.set", () => {
  const apps: AuraApp[] = [];
  afterEach(() => {
    for (const a of apps.splice(0)) a.dispose();
  });
  const mount = () => {
    const app = createAuraApp(null, {
      scene: scene()
        .add(lights.studio({ intensity: 1 }))
        .add(primitives.box({ name: "hero", size: [1, 1, 1], position: [0, 0.5, 0] }).runtime({ id: "hero" }))
        .add(primitives.box({ name: "wall", size: [4, 4, 0.4], position: [0, 1, -3] }).runtime({ id: "wall" }))
        .camera(camera.perspective({ position: [0, 2, -6], target: [0, 0, 0], fov: 50 })),
      qualityRebuild: { flags: ["camera"] }
    } as never);
    apps.push(app);
    return app as AuraApp & {
      quality: { set(t: string): Promise<void>; tier: string };
      camera: { probe: ReturnType<typeof createCameraProbe>; use(r: unknown): void; update(dt: number, ms: number): unknown };
      feel: { define(e: string, s: unknown): void; emit(e: string): void; latestScreenUniforms(): { chroma: number; radialBlur: number; flash: number } };
      onFrame(cb: (f: { dt: number; time: number }) => void): () => void;
    };
  };

  it("app.camera's probe casts at most the forced tier's cap per presented frame", async () => {
    const app = mount();
    for (const tier of ["low", "medium", "high", "ultra"] as const) {
      await app.quality.set(tier);
      app.camera.use(createChaseRig({ target: "hero", distance: 6, collision: true }));
      app.camera.update(1 / 60, 16);
      for (let i = 0; i < 6; i += 1) app.camera.probe.sphereCast([0, 1, 0], [0, 1, -8], 0.2);
      expect(app.camera.probe.stats().sphereCasts, tier).toBe(CAMERA_PROBE_TIER_BUDGETS[tier].sphereCasts);
    }
  });

  it("app.feel publishes flash + vignette only on Low", async () => {
    const app = mount();
    app.feel.define("t", { screen: { flash: 0.5, chroma: 0.5, radialBlur: 0.5, vignette: 0.5 } });
    // Drive the bus's own onFrame tick through a manual step.
    const step = () => (app as unknown as { step(dt: number): void }).step(1 / 60);
    await app.quality.set("low");
    app.feel.emit("t");
    step();
    let u = app.feel.latestScreenUniforms();
    expect(u.flash).toBeGreaterThan(0);
    expect(u.chroma).toBe(0);
    expect(u.radialBlur).toBe(0);
    await app.quality.set("high");
    app.feel.emit("t");
    step();
    u = app.feel.latestScreenUniforms();
    expect(u.chroma).toBeGreaterThan(0);
    expect(u.radialBlur).toBeGreaterThan(0);
  });
});
