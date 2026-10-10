/**
 * camera-feel.spec.ts — browser proofs for the C-22/C-23 controller + feel
 * surface on the L-8 harness (PRD-08 §16): presented-pose plumbing
 * (setPose/setFov/setRoll/addLayer), S6 chase framing, S7 shake in the
 * presented VP, S8 orbit collision, S10 feel accounting, S5 global hit-stop,
 * S14 touch device, reduced motion.
 *
 * Runs the harness's scripted clock (?scripted=1): each tick pumps exactly
 * one presented frame, so pose assertions are frame-exact, not rAF-timed.
 * Scenario code (harness/scenarios-*.ts) and thresholds (../checks.ts) are
 * shared with the headless mirror tests/qr/prd08/unit/harness-pipeline.test.ts.
 *
 * Remote-only: `qr-prd08-camera.yml` browser-gpu (macos-14).
 */
import { expect, test, type Page } from "@playwright/test";
import { startPrd08DevServer, type ExampleDevServer } from "../dev-server";
import {
  checkChase,
  checkChaseLegacyMisses,
  checkFeelAccounting,
  checkHitStopGlobal,
  checkOrbitWall,
  checkShake
} from "../checks";
import { openHarness, pump, pwExpect, scenario, writeEvidence } from "./harness-page";

interface PoseSnapshot {
  position: readonly number[];
  target: readonly number[];
  up: readonly number[];
  fov: number;
  roll: number;
}

interface HarnessApp {
  camera: {
    presented(): PoseSnapshot;
    setPose(p: Partial<PoseSnapshot>, o?: { cut?: boolean }): void;
    setFov(fov: number, o?: { halflife?: number }): void;
    setRoll(roll: number, o?: { halflife?: number }): void;
    addLayer(l: { id: string; apply(p: PoseSnapshot, ctx: { dt: number }): PoseSnapshot }, order?: number): () => void;
  };
  feel: { emit(id: string): void; preset(name: string): void; screenUniforms(): Record<string, number> };
  input(options: unknown): { activeDevice(): string | undefined; prompt(a: string): string | undefined; dispose(): void };
}
type Harness = { app: HarnessApp; tick(dtMs: number): void };

let server: ExampleDevServer;

test.beforeAll(async () => {
  server = await startPrd08DevServer();
});
test.afterAll(async () => {
  await server.close();
});

const presented = (page: Page) =>
  page.evaluate(() => (window as never as { __AURA3D_PRD08_HARNESS__: Harness }).__AURA3D_PRD08_HARNESS__.app.camera.presented());

test.describe("prd08 camera feel — presented-pose plumbing", () => {
  test("setPose cut lands on presented() within one presented frame", async ({ page }) => {
    await openHarness(page, server.origin);
    const before = await presented(page);
    await page.evaluate(() => {
      const c = (window as never as { __AURA3D_PRD08_HARNESS__: Harness }).__AURA3D_PRD08_HARNESS__.app.camera;
      c.setPose({ position: [1.5, 2.5, 3.5], target: [0, 0.5, 0] }, { cut: true });
    });
    await pump(page, 1000 / 60, 1);
    const after = await presented(page);
    expect(after.position).not.toEqual(before.position);
    expect(after.position[0]).toBeCloseTo(1.5, 5);
    expect(after.target[1]).toBeCloseTo(0.5, 5);
  });

  test("setFov ramp converges presented fov without an abrupt first frame", async ({ page }) => {
    await openHarness(page, server.origin);
    await pump(page, 1000 / 60, 5);
    const seq = await page.evaluate(() => {
      const h = (window as never as { __AURA3D_PRD08_HARNESS__: Harness }).__AURA3D_PRD08_HARNESS__;
      const out = [h.app.camera.presented().fov];
      h.app.camera.setFov(60, { halflife: 0.2 });
      // 1.5 s = 7.5 half-lives of the 0.2 s ramp (the camera now updates
      // once per presented tick on real dt — no double-stepped spring).
      for (let i = 0; i < 90; i += 1) {
        h.tick(1000 / 60);
        out.push(h.app.camera.presented().fov);
      }
      return out;
    });
    // Monotone approach (no overshoot) and converged at the target.
    for (let i = 1; i < seq.length; i += 1) expect(seq[i]! - seq[i - 1]!).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.abs(seq.at(-1)! - 60)).toBeLessThan(0.25);
  });

  test("setRoll reaches the presented pose; an additive layer's energy decays to exactly zero", async ({ page }) => {
    await openHarness(page, server.origin);
    const r = await page.evaluate(() => {
      const h = (window as never as { __AURA3D_PRD08_HARNESS__: Harness }).__AURA3D_PRD08_HARNESS__;
      h.app.camera.setRoll(0.2, { halflife: 0.1 });
      for (let i = 0; i < 30; i += 1) h.tick(1000 / 60);
      const roll = h.app.camera.presented().roll;
      // Decaying-offset layer on real dt (half-life ≈ 0.07 s), snapped to 0.
      const p0 = [...h.app.camera.presented().position];
      let amp = 0.3;
      const off = h.app.camera.addLayer({
        id: "decay-probe",
        apply(p, ctx) {
          const out = { ...p, position: [p.position[0]! + amp, p.position[1]!, p.position[2]!] };
          amp *= Math.pow(0.85, ctx.dt * 60);
          if (amp < 1e-6) amp = 0;
          return out;
        }
      });
      let moved = 0;
      for (let i = 0; i < 90; i += 1) {
        h.tick(1000 / 60);
        const p = h.app.camera.presented().position;
        moved = Math.max(moved, Math.hypot(p[0]! - p0[0]!, p[1]! - p0[1]!, p[2]! - p0[2]!));
      }
      const settled = h.app.camera.presented().position;
      off();
      return { roll, moved, residual: Math.hypot(settled[0]! - p0[0]!, settled[1]! - p0[1]!, settled[2]! - p0[2]!) };
    });
    expect(Math.abs(r.roll - 0.2)).toBeLessThan(0.02);
    expect(r.moved).toBeGreaterThan(0.1); // layer energy reached the presented pose
    expect(r.residual).toBeLessThan(1e-9); // decayed to exact zero
  });
});

test.describe("prd08 camera feel — §16 S-rows", () => {
  test("S6: chase at 20 u/s holds distance(v) within 2 % and framing within 3 %; legacy follow misses", async ({ page }) => {
    await openHarness(page, server.origin, "?scripted=1&scene=chase");
    const r = await scenario<Parameters<typeof checkChase>[1]>(page, "chase-framing", { seconds: 2 });
    writeEvidence("camera-feel", "s6-chase.json", r);
    checkChase(pwExpect, r);
    await openHarness(page, server.origin, "?scripted=1&scene=chase");
    checkChaseLegacyMisses(pwExpect, await scenario(page, "chase-framing", { seconds: 2, legacy: true }));
  });

  test("S7: trauma 1.0 reaches the presented VP unfiltered (1e-6 rad), peaks early, rolls", async ({ page }) => {
    await openHarness(page, server.origin);
    const r = await scenario<Parameters<typeof checkShake>[1]>(page, "shake-impulse", { frames: 30 });
    writeEvidence("camera-feel", "s7-shake.json", r);
    checkShake(pwExpect, r);
  });

  test("S8: scripted 30 s orbit never puts the eye inside the wall; collision off enters it", async ({ page }) => {
    await openHarness(page, server.origin, "?scripted=1&scene=wall");
    const on = await scenario<Parameters<typeof checkOrbitWall>[1]>(page, "orbit-wall", { collision: true, seconds: 30 });
    await openHarness(page, server.origin, "?scripted=1&scene=wall");
    const off = await scenario<Parameters<typeof checkOrbitWall>[2]>(page, "orbit-wall", { collision: false, seconds: 30 });
    writeEvidence("camera-feel", "s8-orbit-wall.json", { on, off });
    checkOrbitWall(pwExpect, on, off);
  });

  test("S10: feel executed counts only channels with a real provider", async ({ page }) => {
    await openHarness(page, server.origin);
    const r = await scenario<Parameters<typeof checkFeelAccounting>[1]>(page, "feel-accounting");
    writeEvidence("camera-feel", "s10-feel-accounting.json", r);
    expect(r.hasVibrate).toBe(true); // Chromium exposes navigator.vibrate → haptics provider is real
    checkFeelAccounting(pwExpect, r);
  });

  test("S5-browser: global hit-stop stalls sim time while presented frames continue", async ({ page }) => {
    await openHarness(page, server.origin);
    const r = await scenario<Parameters<typeof checkHitStopGlobal>[1]>(page, "hit-stop-global", { seconds: 0.12 });
    checkHitStopGlobal(pwExpect, r, 0.12);
  });

  test.describe("S14 touch-only (390×844 DPR 3)", () => {
    test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });

    test("a real touch on the canvas marks activeDevice 'touch' and prompt resolves", async ({ page }) => {
      await openHarness(page, server.origin);
      await page.evaluate(() => {
        const h = (window as never as { __AURA3D_PRD08_HARNESS__: Harness }).__AURA3D_PRD08_HARNESS__;
        (window as never as { __PRD08_INPUT__?: unknown }).__PRD08_INPUT__ = h.app.input({
          actions: { jump: ["touch:jump"], move: ["touch:move"] },
          touch: true,
          target: document.querySelector("canvas")!
        });
      });
      await page.touchscreen.tap(120, 300);
      const state = await page.evaluate(() => {
        const input = (window as never as { __PRD08_INPUT__: ReturnType<HarnessApp["input"]> }).__PRD08_INPUT__;
        const out = { device: input.activeDevice(), jumpPrompt: input.prompt("jump") };
        input.dispose();
        return out;
      });
      expect(state.device).toBe("touch");
      expect(state.jumpPrompt).toBe("Jump");
    });
  });

  test.describe("reduced motion", () => {
    test.use({ contextOptions: { reducedMotion: "reduce" } });

    test("emitted feel events suppress flash/chroma/radialBlur and halve vignette", async ({ page }) => {
      await openHarness(page, server.origin);
      const uniforms = await page.evaluate(() => {
        const h = (window as never as { __AURA3D_PRD08_HARNESS__: Harness }).__AURA3D_PRD08_HARNESS__;
        h.app.feel.preset("fighting");
        h.app.feel.emit("ko"); // flash 0.4 vignette 0.5
        h.tick(1000 / 60);
        return h.app.feel.screenUniforms();
      });
      expect(uniforms.flash ?? 0).toBe(0);
      expect(uniforms.chroma ?? 0).toBe(0);
      expect(uniforms.radialBlur ?? 0).toBe(0);
      // vignette is not suppressed but scaled by the 0.5× reduced-motion rule.
      expect(uniforms.vignette ?? 0).toBeGreaterThan(0);
      expect(uniforms.vignette ?? 0).toBeLessThanOrEqual(0.25);
    });
  });
});
