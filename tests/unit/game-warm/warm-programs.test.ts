import { describe, expect, it } from "vitest";
import { warmPrograms, type WarmableApp } from "../../../packages/game/src/session/warmPrograms";

/** A fake app whose draw-call count follows a script, one value per stepped frame. */
function scripted(counts: number[], extras: Partial<WarmableApp> = {}): { app: WarmableApp; steps: () => number; log: string[] } {
  let i = -1;
  const log: string[] = [];
  const app: WarmableApp = {
    async precompile() {
      log.push("precompile");
      await Promise.resolve();
    },
    step() {
      i += 1;
      log.push("step");
    },
    diagnostics() {
      return { drawCalls: counts[Math.min(Math.max(i, 0), counts.length - 1)] };
    },
    ...extras
  };
  return { app, steps: () => i + 1, log };
}

describe("warmPrograms", () => {
  it("settles programs, steps a frame so the exact records are kicked, then settles again", async () => {
    const { app, log } = scripted([113]);
    await warmPrograms(app, { stableFrames: 2 });
    expect(log.slice(0, 4)).toEqual(["precompile", "step", "precompile", "step"]);
  });

  it("keeps stepping until the draw-call count is the same on three frames in a row", async () => {
    // the warm frame draws 47 of 113 calls; the first full frame also renders the shadow cascades
    const { app, steps } = scripted([47, 47, 161, 113, 113, 113, 113]);
    const result = await warmPrograms(app);
    expect(result.settled).toBe(true);
    expect(result.settleFrames).toBe(5);
    expect(steps()).toBe(6);
  });

  it("gives up after maxFrames and reports it did not settle", async () => {
    let n = 0;
    const app: WarmableApp = { async precompile() {}, step() { n += 1; }, diagnostics: () => ({ drawCalls: n }) };
    const result = await warmPrograms(app, { maxFrames: 5 });
    expect(result.settled).toBe(false);
    expect(result.settleFrames).toBe(5);
  });

  it("does not resolve until the second precompile has settled", async () => {
    let release!: () => void;
    let calls = 0;
    const gate = new Promise<void>((res) => { release = res; });
    let done = false;
    const pending = warmPrograms({
      async precompile() {
        calls += 1;
        if (calls === 2) await gate;
      },
      step() {}
    }).then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 5));
    expect(done).toBe(false);
    release();
    await pending;
    expect(done).toBe(true);
  });

  it("steps the requested number of warm frames and none when frames is 0", async () => {
    let steps = 0;
    const app = { async precompile() {}, step() { steps += 1; } };
    await warmPrograms(app, { frames: 3 });
    expect(steps).toBe(3);
    steps = 0;
    await warmPrograms(app, { frames: 0 });
    expect(steps).toBe(0);
  });

  it("still renders the warm frames for an app without precompile or diagnostics", async () => {
    let steps = 0;
    const result = await warmPrograms({ step() { steps += 1; } });
    expect(steps).toBe(1);
    expect(result.passes).toBe(0);
    expect(result.settled).toBe(true);
  });

  it("propagates a precompile failure", async () => {
    await expect(warmPrograms({ async precompile() { throw new Error("compile failed"); }, step() {} })).rejects.toThrow("compile failed");
  });

  describe("environment HDRI", () => {
    /** An app whose HDRI turns ready after `readyAfterSteps` stepped frames; drawCalls rises when it lands (the IBL variants). */
    function withHdri(readyAfterSteps: number | null) {
      let steps = 0;
      const log: string[] = [];
      const app: WarmableApp = {
        async precompile() { log.push("precompile"); await Promise.resolve(); },
        step() { steps += 1; log.push("step"); },
        diagnostics() {
          const ready = readyAfterSteps !== null && steps >= readyAfterSteps;
          return { drawCalls: ready ? 140 : 113, renderer: { environment: { hdriStatus: readyAfterSteps === null ? "pending" : ready ? "ready" : "pending" } } };
        }
      };
      return { app, log, steps: () => steps };
    }

    it("waits for a pending HDRI, then precompiles and settles again on the final programs", async () => {
      const { app, log } = withHdri(12);
      const result = await warmPrograms(app, { stableFrames: 2, environmentTimeoutMs: 5000 });
      expect(result.environmentReady).toBe(true);
      expect(result.environmentFrames).toBeGreaterThan(0);
      expect(result.settled).toBe(true);
      expect(log.filter((l) => l === "precompile").length).toBeGreaterThanOrEqual(3);
    });

    it("gives the second settle pass its own frame budget", async () => {
      // the first pass never settles (changing counts) and uses all of maxFrames; the pass after the HDRI still runs
      let steps = 0;
      const app: WarmableApp = {
        async precompile() { await Promise.resolve(); },
        step() { steps += 1; },
        diagnostics() { return { drawCalls: steps < 30 ? steps : 200, renderer: { environment: { hdriStatus: steps >= 8 ? "ready" : "pending" } } }; }
      };
      const result = await warmPrograms(app, { stableFrames: 3, maxFrames: 6, environmentTimeoutMs: 2000 });
      expect(result.environmentReady).toBe(true);
      expect(result.settleFrames).toBeGreaterThan(6);
    });

    it("gives up after the timeout and says so", async () => {
      const { app } = withHdri(null);
      const result = await warmPrograms(app, { stableFrames: 2, environmentTimeoutMs: 120 });
      expect(result.environmentReady).toBe(false);
    });

    it("does not wait when waitForEnvironment is false, or when no HDRI was requested", async () => {
      const a = withHdri(null);
      const off = await warmPrograms(a.app, { stableFrames: 2, waitForEnvironment: false });
      expect(off.environmentFrames).toBe(0);
      const none = scripted([113]);
      const r = await warmPrograms(none.app, { stableFrames: 2 });
      expect(r.environmentFrames).toBe(0);
      expect(r.environmentReady).toBe(true);
    });
  });

  it("waits for pending texture upgrades, then settles the draw-call count again", async () => {
    let frame = 0;
    const app: WarmableApp = {
      async precompile() {},
      step() { frame += 1; },
      diagnostics() {
        // the textured program variants appear when the upload lands on frame 6: the count only then reaches 131
        const landed = frame >= 6;
        return { drawCalls: landed ? 131 : 113, renderer: { runtime: { texturedMaterials: [{ status: landed ? "textured" : "pending" }, { status: "textured" }] } } };
      }
    };
    const result = await warmPrograms(app, { textureTimeoutMs: 5_000 });
    expect(result.texturesReady).toBe(true);
    expect(result.textureFrames).toBeGreaterThan(0);
    expect(result.settled).toBe(true);
    expect(app.diagnostics!().drawCalls).toBe(131);
  });

  it("gives up on a texture upgrade that never lands and says so", async () => {
    const app: WarmableApp = {
      async precompile() {},
      step() {},
      diagnostics: () => ({ drawCalls: 10, renderer: { runtime: { texturedMaterials: [{ status: "pending" }] } } })
    };
    const result = await warmPrograms(app, { textureTimeoutMs: 120 });
    expect(result.texturesReady).toBe(false);
    expect(result.textureFrames).toBeGreaterThan(0);
  });

  it("skips the texture wait when asked, and when nothing is pending", async () => {
    const pending: WarmableApp = {
      async precompile() {},
      step() {},
      diagnostics: () => ({ drawCalls: 10, renderer: { runtime: { texturedMaterials: [{ status: "pending" }] } } })
    };
    expect((await warmPrograms(pending, { waitForTextures: false })).textureFrames).toBe(0);
    const clean = scripted([113]);
    expect((await warmPrograms(clean.app)).textureFrames).toBe(0);
  });
});
