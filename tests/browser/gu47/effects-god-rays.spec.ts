import { expect, test } from "@playwright/test";
import { HARNESS_SCENE, openPostReceipts, type PostReceiptSession } from "./post-receipts-lib";

/**
 * GU47 E-C receipt effects-god-rays (PRD WP-3 items 4 and 8): S4 god rays run
 * and are traced, add light, and `godRayDensity` 0.5 visibly shortens the
 * shafts against the default full march. Second test: the WP-3 acceptance
 * "diagnostics().post.stagesRan names every stage that ran in a test scene
 * with all effects on" (software WebGL2, remote runner only).
 */
const CAPABILITY = "effects-god-rays";
const ALL_EFFECT_STAGES = [/^S1:depth-prep$/, /^S3:ssr-/, /^S4:god-rays-/, /^CA:/, /^S6:dof/, /^S7:motion-blur/, /^S9:bloom/, /^S10:hdr-grade/, /^S10b:display-grade/, /^S12:film-grain/];

test.describe(`${CAPABILITY} receipt`, () => {
  test.setTimeout(300_000);
  let session: PostReceiptSession;
  test.beforeAll(async ({ browser }) => { session = await openPostReceipts(browser); });
  test.afterAll(async () => { await session?.close(); });

  test("S4 adds light shafts; godRayDensity 0.5 differs from the full march", async () => {
    const off = await session.render("god-off");
    const on = await session.render("god-on");
    const half = await session.render("god-density-half");
    const added = await session.compare("god-off", "god-on");
    const density = await session.compare("god-on", "god-density-half");
    expect(on.stagesRan.some((stage) => stage.startsWith("S4:god-rays-"))).toBe(true);
    expect(off.stagesRan.some((stage) => stage.startsWith("S4"))).toBe(false);
    expect(on.meanLuma).toBeGreaterThan(off.meanLuma);
    expect(added.changedFraction).toBeGreaterThan(0.01);
    expect(density.changedFraction).toBeGreaterThan(0.001);
    session.write(CAPABILITY, `${HARNESS_SCENE}; volumetricFog absent / density 0.2 + lightPosition [0.8, 3, -10] / + godRayDensity 0.5`,
      [session.save(CAPABILITY, off), session.save(CAPABILITY, on), session.save(CAPABILITY, half)],
      ["tests/unit/gu47/ec/tilt-shift-god-ray-density.test.ts", "tests/unit/gu47/ec/hdr-grade-and-stage-trace.test.ts"],
      { meanLumaDelta: on.meanLuma - off.meanLuma, changedFraction: added.changedFraction, densityChangedFraction: density.changedFraction });
  });

  test("stagesRan names every stage of an all-effects scene", async () => {
    const all = await session.render("all-effects");
    expect(all.errors).toEqual([]);
    for (const stage of ALL_EFFECT_STAGES) expect(all.stagesRan.some((ran) => stage.test(ran)), String(stage)).toBe(true);
    session.save(CAPABILITY, all);
  });
});
