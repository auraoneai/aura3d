/**
 * audio-dsp.spec.ts (PRD-09 §15 Sound DSP): the OfflineAudioContext assertions
 * Node cannot run — panning ratio ≥ 6 dB, occlusion 1.0 attenuates the
 * 5–10 kHz band ≥ 18 dB vs occlusion 0, master-chain sample peak ≤ −0.3 dBFS
 * under 32 summed 0 dBFS bursts, transparency within 0.5 dB at −12 dBFS,
 * engine-loop fundamental shift ≥ 25 %, cue RMS > −40 dBFS.
 */
import { expect, test, withServer } from "./support";

declare global {
  interface Window {
    __AURA3D_DSP__?: {
      status: "ready" | "error";
      error?: string;
      panningRatioDb?: number;
      occlusionAttenuationDb?: number;
      masterPeakDbfs?: number;
      transparencyDb?: number;
      engineLoopShiftPct?: number;
      cueRmsDbfs?: number;
    };
  }
}

withServer((getServer) => {
  test("§6.8 dsp assertions on a real OfflineAudioContext", async ({ page }) => {
    await page.goto(`${getServer().origin}/tests/browser/game-shell/audio-dsp-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => window.__AURA3D_DSP__?.status !== undefined, undefined, { timeout: 30_000 });
    const r = await page.evaluate(() => window.__AURA3D_DSP__!);
    expect(r.status, r.error).toBe("ready");

    expect(r.cueRmsDbfs!, "cue RMS below -40 dBFS").toBeGreaterThan(-40);
    expect(r.panningRatioDb!, `panning L/R ratio ${r.panningRatioDb?.toFixed(1)} dB`).toBeGreaterThanOrEqual(6);
    expect(
      r.occlusionAttenuationDb!,
      `occlusion attenuation ${r.occlusionAttenuationDb?.toFixed(1)} dB`
    ).toBeGreaterThanOrEqual(18);
    expect(r.masterPeakDbfs!, `master peak ${r.masterPeakDbfs?.toFixed(2)} dBFS`).toBeLessThanOrEqual(-0.3);
    expect(r.transparencyDb!, `transparency off by ${r.transparencyDb?.toFixed(2)} dB`).toBeLessThanOrEqual(0.5);
    expect(
      r.engineLoopShiftPct!,
      `engine loop fundamental shift ${r.engineLoopShiftPct?.toFixed(0)}%`
    ).toBeGreaterThanOrEqual(25);
  });
});
