import { describe, expect, it } from "vitest";
import { createReverbSend, IR_BUDGET_SECONDS, PRESET_IR_SECONDS, presetIrUrl } from "../../../packages/audio/src/game-sound/ReverbSend";
import { probeFormat, formatExtension } from "../../../packages/audio/src/game-sound/formatProbe";
import { FakeContext, FakeNode } from "./fake-context";

describe("ReverbSend (PRD-09 §6.8/§17)", () => {
  it("low tier or preset 'none' creates no ConvolverNode", () => {
    const ctx = new FakeContext();
    expect(createReverbSend({ ctx, preset: "hall", tier: "low", bufferFor: () => undefined }).enabled).toBe(false);
    expect(createReverbSend({ ctx, preset: "none", tier: "ultra", bufferFor: () => undefined }).enabled).toBe(false);
    expect(ctx.ofKind("convolver").length).toBe(0);
  });

  it("IR length never exceeds the tier budget", () => {
    // preset hangar 2.2 s on medium (≤0.8 s) must clamp.
    expect(IR_BUDGET_SECONDS.medium).toBe(0.8);
    expect(Math.min(PRESET_IR_SECONDS.hangar, IR_BUDGET_SECONDS.medium)).toBe(0.8);
    const ctx = new FakeContext();
    const r = createReverbSend({ ctx, preset: "hangar", tier: "medium", bufferFor: () => undefined });
    expect(r.irSeconds).toBe(0.8);
  });

  it("hall on high: convolver tail wired to the send gain", () => {
    const ctx = new FakeContext();
    const r = createReverbSend({ ctx, preset: "hall", tier: "high", bufferFor: () => undefined }) as ReturnType<typeof createReverbSend> & { sendTail: FakeNode };
    expect(r.enabled).toBe(true);
    expect(r.irSeconds).toBeCloseTo(1.5, 3); // min(1.8 preset, 1.5 budget)
    const [convolver] = ctx.ofKind<FakeNode>("convolver");
    expect(r.sendInput).toBe(convolver);
    expect(convolver.connectedTo[0]).toBe(r.sendTail);
  });

  it("underwater preset inserts the 1.8 kHz lowpass between convolver and send", () => {
    const ctx = new FakeContext();
    createReverbSend({ ctx, preset: "underwater", tier: "high", bufferFor: () => undefined });
    const [convolver] = ctx.ofKind<FakeNode>("convolver");
    const lp = ctx.ofKind<{ type: string; frequency: { value: number } }>("biquad")[0];
    expect(lp.frequency.value).toBe(1800);
    expect(convolver.connectedTo[0]).toBe(lp);
  });

  it("presetIrUrl renders the pack path; 'none' has none", () => {
    expect(presetIrUrl("hall", "opus.webm")).toBe("assets/ir/hall.opus.webm");
    expect(presetIrUrl("none", "opus.webm")).toBeUndefined();
  });
});

describe("probeFormat (PRD-09 §6.8/1735)", () => {
  const okBuffer = { duration: 0.02 } as AudioBuffer;

  it("picks Opus when the Opus probe decodes", async () => {
    const decoded: string[] = [];
    const f = await probeFormat({
      decodeAudioData: async () => okBuffer,
      fetchProbe: async (url) => {
        decoded.push(url);
        return new ArrayBuffer(8);
      }
    });
    expect(f).toBe("opus-webm");
    expect(decoded[0]).toContain("probe-20ms.opus.webm");
    expect(decoded.length).toBe(1); // AAC never fetched
  });

  it("falls back to AAC/M4A when Opus decode rejects", async () => {
    const fetched: string[] = [];
    let calls = 0;
    const f = await probeFormat({
      decodeAudioData: async () => {
        calls += 1;
        if (calls === 1) throw new Error("no opus decoder");
        return okBuffer;
      },
      fetchProbe: async (url) => {
        fetched.push(url);
        return new ArrayBuffer(8);
      }
    });
    expect(f).toBe("aac-m4a");
    expect(fetched.map((u) => u.split("/").pop())).toEqual(["probe-20ms.opus.webm", "probe-20ms.m4a"]);
  });

  it("formatExtension maps format → packed asset suffix", () => {
    expect(formatExtension("opus-webm")).toBe("opus.webm");
    expect(formatExtension("aac-m4a")).toBe("m4a");
  });
});
