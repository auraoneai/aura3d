import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * parity-audio (AU-01/AU-02/AU-03) — remote Playwright fixture.
 *
 * Renders real `OfflineAudioContext` graphs through the public
 * `@aura3d/audio` surface and measures RMS, so the assertions are about
 * audible gain, not node bookkeeping:
 *
 *  1. Distance attenuation lands EXACTLY ONCE per model — the C10 regression:
 *     `PositionalEmitter` used to fold `computeDistanceAttenuation` into the
 *     source gain while the panner applied its own inverse model. At d=11,
 *     ref=1 the rendered level is ~1/11, not ~1/121.
 *  2. Cone attenuates a listener outside the source cone (orientation flip on
 *     a fixed listener isolates the cone term).
 *  3. `AudioListener.setTransform` drives `ctx.listener` — a forward flip moves
 *     the stereo balance, which is only possible through the native listener.
 *  4. `createAudioAnalyser` wraps a real `AnalyserNode`; its byte spectrum
 *     tracks an oscillator's bin (read during an offline `suspend()`).
 *
 * Runs remote-only per the parity PRD (never a local Playwright suite).
 */

const REPORT_ROOT = resolve("tests/reports/parity-audio");
const HARNESS = "/tests/browser/parity-audio-harness.html";

test.describe("parity-audio", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("distance attenuation applies exactly once per model (C10 regression)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${server.origin}${HARNESS}`, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const audio = await import("/packages/audio/src/index.ts");
      const SR = 48_000;
      const SECONDS = 0.6;

      const tone = (ctx: OfflineAudioContext): AudioBuffer => {
        const buffer = ctx.createBuffer(1, SR * SECONDS, SR);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
          data[i] = 0.5 * Math.sin((2 * Math.PI * 330 * i) / SR);
        }
        return buffer;
      };

      const rmsTail = (buffer: AudioBuffer): number => {
        const data = buffer.getChannelData(0);
        let sum = 0;
        let count = 0;
        for (let i = Math.floor(data.length / 2); i < data.length; i += 1) {
          sum += data[i] * data[i];
          count += 1;
        }
        return Math.sqrt(sum / count);
      };

      // Emitter at the origin, listener on +Z at `distance`. equalpower panning
      // keeps the azimuth term constant across distances, so the rendered RMS
      // ratio isolates `distanceGain`.
      const renderEmitter = async (distance: number, model: "inverse" | "linear" | "exponential") => {
        const ctx = new OfflineAudioContext(1, SR * SECONDS, SR);
        const listener = new audio.AudioListener({ context: ctx });
        listener.setTransform({ x: 0, y: 0, z: distance });
        const emitter = new audio.PositionalEmitter({
          context: ctx,
          clip: new audio.AudioClip({ buffer: tone(ctx) }),
          loop: true,
          volume: 1,
          position: { x: 0, y: 0, z: 0 },
          panningModel: "equalpower",
          attenuation: { model, refDistance: 1, maxDistance: 11, rolloffFactor: 1 }
        });
        const evidence = emitter.update({ x: 0, y: 0, z: distance });
        emitter.play(0);
        const rendered = await ctx.startRendering();
        return { rms: rmsTail(rendered), evidence };
      };

      const out: Record<string, { ratio: number; expected: number; near: number; far: number; evidenceFar: number; connected: boolean }> = {};
      for (const model of ["inverse", "linear", "exponential"] as const) {
        const near = await renderEmitter(1, model);
        const far = await renderEmitter(11, model);
        const expected =
          model === "inverse"
            ? 1 / 11 // ref / (ref + f·(d − ref)) = 1/11
            : model === "linear"
              ? 0 // d hits maxDistance (11) with rolloff 1
              : Math.pow(11, -1); // (d/ref)^-f
        out[model] = {
          ratio: far.rms / near.rms,
          expected,
          near: near.rms,
          far: far.rms,
          evidenceFar: far.evidence.attenuationGain,
          connected: far.evidence.connected
        };
      }
      return out;
    });

    expect(errors).toEqual([]);
    // ~35% tolerance: renders are deterministic but HRTF-free equalpower +
    // mono downmix keep this within a few percent; the C10 double attenuation
    // would land at ~0.008 for inverse — an order of magnitude outside it.
    expect(result.inverse.connected).toBe(true);
    expect(result.inverse.ratio).toBeGreaterThan(0.05);
    expect(result.inverse.ratio).toBeLessThan(0.15);
    expect(result.inverse.evidenceFar).toBeCloseTo(1 / 11, 3);
    expect(result.linear.ratio).toBeLessThan(0.05); // at maxDistance → silence
    expect(result.exponential.ratio).toBeGreaterThan(0.05);
    expect(result.exponential.ratio).toBeLessThan(0.15);
    writeFileSync(resolve(REPORT_ROOT, "distance-models.json"), `${JSON.stringify(result, null, 2)}\n`);
  });

  test("cone attenuates a listener outside the outer cone; AudioListener drives ctx.listener", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}${HARNESS}`, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const audio = await import("/packages/audio/src/index.ts");
      const SR = 48_000;
      const SECONDS = 0.6;

      const tone = (ctx: OfflineAudioContext): AudioBuffer => {
        const buffer = ctx.createBuffer(1, SR * SECONDS, SR);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = 0.5 * Math.sin((2 * Math.PI * 550 * i) / SR);
        return buffer;
      };
      const rmsTail = (data: Float32Array): number => {
        let sum = 0;
        let count = 0;
        for (let i = Math.floor(data.length / 2); i < data.length; i += 1) {
          sum += data[i] * data[i];
          count += 1;
        }
        return Math.sqrt(sum / count);
      };

      // Listener fixed at -Z; emitter at origin. Only `orientation` flips, so
      // distance/panning are identical and the ratio isolates the cone term.
      const renderCone = async (orientationZ: number) => {
        const ctx = new OfflineAudioContext(1, SR * SECONDS, SR);
        const listener = new audio.AudioListener({ context: ctx });
        listener.setTransform({ x: 0, y: 0, z: -5 });
        const emitter = new audio.PositionalEmitter({
          context: ctx,
          clip: new audio.AudioClip({ buffer: tone(ctx) }),
          loop: true,
          volume: 1,
          position: { x: 0, y: 0, z: 0 },
          orientation: { x: 0, y: 0, z: orientationZ },
          panningModel: "equalpower",
          attenuation: { model: "inverse", refDistance: 1 },
          cone: { innerAngle: 60, outerAngle: 120, outerGain: 0.1 }
        });
        const evidence = emitter.update({ x: 0, y: 0, z: -5 });
        emitter.play(0);
        return { rms: rmsTail((await ctx.startRendering()).getChannelData(0)), evidence };
      };

      const facingListener = await renderCone(-1); // orientation -z: listener lies along the axis → gain 1
      const facingAway = await renderCone(1); // orientation +z: listener at 180° → outerGain 0.1

      // AU-01 proof: equalpower stereo render, source at +X. Facing -z puts it
      // hard right; facing +x centers it. Only possible if setTransform wrote
      // ctx.listener.forward*/up* through syncListener.
      const renderListenerForward = async (forwardX: number, forwardZ: number) => {
        const ctx = new OfflineAudioContext(2, SR * SECONDS, SR);
        const listener = new audio.AudioListener({ context: ctx });
        listener.setTransform({ x: 0, y: 0, z: 0 }, { x: forwardX, y: 0, z: forwardZ }, { x: 0, y: 1, z: 0 });
        const spatial = new audio.SpatialAudio({
          context: ctx,
          panningModel: "equalpower",
          distanceModel: "inverse",
          refDistance: 1,
          position: { x: 5, y: 0, z: 0 }
        });
        const source = ctx.createBufferSource();
        source.buffer = tone(ctx);
        source.loop = true;
        source.connect(spatial.panner);
        source.start(0);
        const rendered = await ctx.startRendering();
        return { left: rmsTail(rendered.getChannelData(0)), right: rmsTail(rendered.getChannelData(1)) };
      };
      const facingNegZ = await renderListenerForward(0, -1); // default pose: +x source sits at the right ear
      const facingPosX = await renderListenerForward(1, 0); // rotated: the same source is dead ahead

      return {
        coneRatio: facingAway.rms / facingListener.rms,
        coneGainFacing: facingListener.evidence.coneGain,
        coneGainAway: facingAway.evidence.coneGain,
        forwardNegZ: facingNegZ,
        forwardPosX: facingPosX
      };
    });

    expect(errors).toEqual([]);
    // The panner cone drops the off-axis listener to coneOuterGain (0.1).
    expect(result.coneGainFacing).toBe(1);
    expect(result.coneGainAway).toBeCloseTo(0.1, 6);
    expect(result.coneRatio).toBeGreaterThan(0.04);
    expect(result.coneRatio).toBeLessThan(0.2);
    // ctx.listener was actually driven: forward −z pans the +x source right;
    // forward +x centers it.
    expect(result.forwardNegZ.right / Math.max(result.forwardNegZ.left, 1e-9)).toBeGreaterThan(4);
    expect(Math.abs(result.forwardPosX.left - result.forwardPosX.right) / Math.max(result.forwardPosX.right, 1e-9)).toBeLessThan(0.35);
    writeFileSync(resolve(REPORT_ROOT, "cone-and-listener.json"), `${JSON.stringify(result, null, 2)}\n`);
  });

  test("createAudioAnalyser tracks an oscillator on a real AnalyserNode (offline suspend)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}${HARNESS}`, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const audio = await import("/packages/audio/src/index.ts");
      const SR = 48_000;
      const FFT = 2048;

      const analyse = async (frequency: number) => {
        const ctx = new OfflineAudioContext(1, SR, SR);
        const osc = ctx.createOscillator();
        osc.frequency.value = frequency;
        // `createAudioAnalyser(source, fftSize)` resolves the context off
        // `osc.context` — the real-node path a game would use.
        const tap = audio.createAudioAnalyser(osc, FFT);
        tap.analyser.connect(ctx.destination);
        let spectrum: Uint8Array | undefined;
        let average = -1;
        // Queue the suspend while the context is not running (spec ordering),
        // then read the frozen spectrum inside it — analyser reads during a
        // suspend MUST return the last rendered data.
        const suspended = ctx.suspend(0.5).then(() => {
          spectrum = tap.getFrequencyData();
          average = tap.getAverageFrequency();
          return ctx.resume();
        });
        osc.start(0);
        const rendered = await ctx.startRendering();
        await suspended;
        void rendered;
        const bins = Array.from(spectrum ?? []);
        let peak = 0;
        let peakIndex = -1;
        bins.forEach((value, index) => {
          if (value > peak) {
            peak = value;
            peakIndex = index;
          }
        });
        return { average, peak, peakIndex, frequencyBinCount: tap.frequencyBinCount, fftSize: tap.fftSize };
      };

      const low = await analyse(440);
      const high = await analyse(4400);
      const binHz = SR / FFT;
      return { low, high, expectedLowBin: 440 / binHz, expectedHighBin: 4400 / binHz, binHz };
    });

    expect(errors).toEqual([]);
    expect(result.low.fftSize).toBe(2048);
    expect(result.low.frequencyBinCount).toBe(1024);
    // The oscillator lands in its expected FFT bin; a 10× higher frequency moves
    // the peak ~10× further out — the analyser tracks the source, not silence.
    expect(result.low.peakIndex).toBeGreaterThanOrEqual(Math.floor(result.expectedLowBin) - 2);
    expect(result.low.peakIndex).toBeLessThanOrEqual(Math.ceil(result.expectedLowBin) + 2);
    expect(result.high.peakIndex).toBeGreaterThanOrEqual(Math.floor(result.expectedHighBin) - 4);
    expect(result.high.peakIndex).toBeLessThanOrEqual(Math.ceil(result.expectedHighBin) + 4);
    expect(result.high.peakIndex).toBeGreaterThan(result.low.peakIndex);
    expect(result.low.average).toBeGreaterThan(0);
    expect(result.high.peak).toBeGreaterThan(0);
    writeFileSync(resolve(REPORT_ROOT, "analyser.json"), `${JSON.stringify(result, null, 2)}\n`);
  });
});

export {};
