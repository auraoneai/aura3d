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
});
