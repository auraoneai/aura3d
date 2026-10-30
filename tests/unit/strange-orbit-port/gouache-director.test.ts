import { describe, expect, it } from "vitest";
import { createCameraFeel, createPostDirector, createSectorDirector } from "../../../examples/strange-orbit-port/art/director";
import { LOOKS, SECTORS } from "../../../examples/strange-orbit-port/art/look";

/** GU47 WP-25 (lane g15): camera feel (SO47-C1), sector light (L3) and boost/menu post (P2, P3), incl. reduced motion. */
describe("strange-orbit-port gouache directors", () => {
  const run = (feel: ReturnType<typeof createCameraFeel>, seconds: number, input: { boosting: boolean; lean: number; racing: boolean }) => {
    let frame = feel.update(0, input);
    for (let t = 0; t < seconds; t += 1 / 60) frame = feel.update(1 / 60, input);
    return frame;
  };

  it("cruises at fov 64 and reaches >= 72 on boost, with a >= 1.5 degree lean roll", () => {
    const feel = createCameraFeel("gouache", false);
    expect(feel.baseFov).toBe(64);
    expect(run(feel, 2, { boosting: false, lean: 0, racing: true }).fovOffset).toBeCloseTo(0, 3);
    expect(feel.baseFov + run(feel, 2, { boosting: true, lean: 0, racing: true }).fovOffset).toBeGreaterThanOrEqual(72);
    const leaning = run(feel, 0.5, { boosting: false, lean: 0.24, racing: true });
    expect((leaning.roll * 180) / Math.PI).toBeGreaterThanOrEqual(1.5);
  });

  it("kicks on landings and punches on hard ones", () => {
    const feel = createCameraFeel("gouache", false);
    run(feel, 1, { boosting: false, lean: 0, racing: true });
    feel.landing(true);
    const frame = feel.update(1 / 60, { boosting: false, lean: 0, racing: true });
    expect(frame.fovOffset).toBeGreaterThan(4);
    expect(frame.punch).toBeGreaterThan(0);
  });

  it("has zero kick energy under reduced motion (PRD §6.3)", () => {
    const feel = createCameraFeel("gouache", true);
    feel.landing(true);
    expect(run(feel, 2, { boosting: true, lean: 0.24, racing: true }).energy).toBe(0);
    const post = createPostDirector(LOOKS.gouache, true, true);
    let frame = post.update(0, { boosting: true, zeroG: true, phase: "racing" });
    for (let i = 0; i < 60; i++) frame = post.update(1 / 60, { boosting: true, zeroG: true, phase: "racing" });
    expect(frame.motionBlur).toBe(0);
    expect(frame.chromaticAberration).toBe(0);
  });

  it("keeps ?look=original free of kicks", () => {
    const feel = createCameraFeel("original", false);
    expect(feel.baseFov).toBe(72);
    expect(run(feel, 2, { boosting: true, lean: 0.24, racing: true }).energy).toBe(0);
  });

  it("ramps boost motion blur to 0.6 with CA 0.0015 on High only, DOF only in menu and results", () => {
    const post = createPostDirector(LOOKS.gouache, true, false);
    let frame = post.update(0, { boosting: true, zeroG: false, phase: "racing" });
    for (let i = 0; i < 120; i++) frame = post.update(1 / 60, { boosting: true, zeroG: false, phase: "racing" });
    expect(frame.motionBlur).toBeCloseTo(0.6, 2);
    expect(frame.chromaticAberration).toBe(0.0015);
    expect(frame.depthOfField).toBe(false);
    expect(post.update(1 / 60, { boosting: false, zeroG: false, phase: "menu" }).depthOfField).toBe(true);
    const low = createPostDirector(LOOKS.gouache, false, false);
    expect(low.update(1, { boosting: true, zeroG: true, phase: "racing" })).toEqual({ motionBlur: 0, chromaticAberration: 0, depthOfField: false });
  });

  it("changes sector once per boundary and eases the nebula hue", () => {
    const sectors = createSectorDirector("gouache");
    expect(sectors.update(200, 1 / 60).changed?.id).toBe("warm");
    expect(sectors.update(201, 1 / 60).changed).toBeNull();
    const violet = sectors.update(450, 1 / 60);
    expect(violet.changed).toEqual(SECTORS.violet);
    let shift = violet.nebulaShift;
    for (let i = 0; i < 120; i++) shift = sectors.update(450, 1 / 60).nebulaShift;
    expect(shift).toBeCloseTo(SECTORS.violet.nebulaShift, 2);
    expect(createSectorDirector("original").update(450, 1).changed).toBeNull();
  });
});
