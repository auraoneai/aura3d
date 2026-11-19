import { describe, expect, it } from "vitest";
import { isFrameBusyError, leaseSafeWarmApp, swapVenue } from "../../../apps/showcase-iron-crown/src/game/venueSwap";
import { warmPrograms } from "../../../packages/game/src/session/warmPrograms";

/**
 * Real-GPU QA: black frames on Quick Bout / venue switch and PRD07_DEVICE_LEASE_BUSY during the switch. A simulated app:
 * setScene drops to zero draws until the warm settles the new venue; the screen shows the freeze-frame whenever the
 * canvas has zero draws, and a warm step that meets a busy device is skipped, not thrown.
 */
function fakeApp() {
  const log: string[] = [];
  let draws = 120, mounted = "old", frozen = false, looping = true, busyLeft = 2;
  const zeroDrawVisible: string[] = [];
  const present = (who: string) => { if (draws === 0 && !frozen) zeroDrawVisible.push(who); };
  const app = {
    screenshot: () => ({ dataUrl: `data:image/png;base64,${mounted}` }),
    pause: () => { looping = false; log.push("pause"); },
    resume: () => { looping = true; log.push("resume"); },
    loopTick: () => { if (looping) present("loop"); },
    step: () => {
      if (busyLeft > 0) { busyLeft -= 1; throw new Error("PRD07_DEVICE_LEASE_BUSY"); }
      draws = mounted === "new" ? Math.min(140, draws + 70) : draws;
      present("step");
    },
    precompile: async () => { log.push("precompile"); },
    diagnostics: () => ({ drawCalls: draws, renderer: { environment: { hdriStatus: "ready" }, runtime: { texturedMaterials: [] } } }),
    setScene: async () => { log.push("setScene"); draws = 0; mounted = "new"; app.loopTick(); }
  };
  return { app, log, zeroDrawVisible, freeze: { show: () => { frozen = true; log.push("freeze"); }, hide: () => { frozen = false; log.push("unfreeze"); app.loopTick(); } }, get draws() { return draws; } };
}

describe("Iron Crown venue swap: no black frames, no device-lease page error", () => {
  it("recognises busy-device errors only", () => {
    expect(isFrameBusyError(new Error("PRD07_DEVICE_LEASE_BUSY"))).toBe(true);
    expect(isFrameBusyError(new Error("Aura3D async frame is pending; await it before synchronous rendering."))).toBe(true);
    expect(isFrameBusyError(new Error("WEBGL_CONTEXT_LOST"))).toBe(false);
  });

  it("freezes the old venue, mounts and warms the new one under it, then reveals it; busy warm frames are skipped", async () => {
    const f = fakeApp();
    let busy = 0;
    const result = await swapVenue({
      capture: () => f.app.screenshot().dataUrl,
      showFreeze: () => f.freeze.show(),
      hideFreeze: () => f.freeze.hide(),
      pauseLoop: () => f.app.pause(),
      resumeLoop: () => f.app.resume(),
      setScene: () => f.app.setScene(),
      warm: () => warmPrograms(leaseSafeWarmApp(f.app, () => busy++), { stableFrames: 2, maxFrames: 8 })
    });
    expect(result.froze).toBe(true);
    expect(busy).toBe(2);
    expect(f.zeroDrawVisible).toEqual([]);
    expect(f.draws).toBeGreaterThan(0);
    const i = (s: string) => f.log.indexOf(s);
    expect(i("freeze")).toBeLessThan(i("setScene"));
    expect(i("pause")).toBeGreaterThan(i("setScene"));
    expect(i("resume")).toBeLessThan(i("unfreeze"));
    expect(f.log.at(-1)).toBe("unfreeze");
  });

  it("other warm failures still surface, and the freeze and loop are always restored", async () => {
    const f = fakeApp();
    await expect(swapVenue({
      capture: () => "x", showFreeze: () => f.freeze.show(), hideFreeze: () => f.freeze.hide(),
      pauseLoop: () => f.app.pause(), resumeLoop: () => f.app.resume(), setScene: () => f.app.setScene(),
      warm: () => warmPrograms(leaseSafeWarmApp({ step: () => { throw new Error("WEBGL_CONTEXT_LOST"); } }))
    })).rejects.toThrow("WEBGL_CONTEXT_LOST");
    expect(f.log.slice(-2)).toEqual(["resume", "unfreeze"]);
  });

  it("a failing capture swaps without a freeze instead of failing the bout", async () => {
    const f = fakeApp();
    const r = await swapVenue({
      capture: () => { throw new Error("lost"); }, showFreeze: () => f.freeze.show(), hideFreeze: () => f.freeze.hide(),
      pauseLoop: () => f.app.pause(), resumeLoop: () => f.app.resume(), setScene: () => f.app.setScene(), warm: async () => {}
    });
    expect(r.froze).toBe(false);
  });
});
