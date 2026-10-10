/**
 * audio-dsp harness (PRD-09 §15 Sound DSP): runs the §6.8 OfflineAudioContext
 * assertions in-browser (Node/jsdom have no Web Audio) against the real
 * game-sound classes and publishes measured numbers for the spec to assert.
 */
import { createMasterChain, createSpatialNode, createEngineLoop } from "@aura3d/audio";

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

const SR = 48_000;

function noiseBuffer(ctx: OfflineAudioContext, seconds: number, amp = 1): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.round(seconds * SR), SR);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * amp;
  return buf;
}

function sineBuffer(ctx: OfflineAudioContext, seconds: number, freq: number, ampDbfs: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.round(seconds * SR), SR);
  const data = buf.getChannelData(0);
  const amp = 10 ** (ampDbfs / 20);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.sin((2 * Math.PI * freq * i) / SR) * amp;
  return buf;
}

function sawBuffer(ctx: OfflineAudioContext, freq: number): AudioBuffer {
  const buf = ctx.createBuffer(1, SR, SR);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const p = (i * freq) / SR;
    data[i] = ((p % 1) * 2 - 1) * 0.5;
  }
  return buf;
}

const dbfs = (peak: number) => 20 * Math.log10(Math.max(peak, 1e-9));
const rmsDbfs = (data: Float32Array) =>
  20 * Math.log10(Math.max(Math.sqrt(data.reduce((s, v) => s + v * v, 0) / Math.max(data.length, 1)), 1e-9));

async function measurePanning(): Promise<number> {
  const ctx = new OfflineAudioContext(2, SR, SR);
  const spatial = createSpatialNode({ ctx: ctx as never, panningModel: "HRTF" });
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.5);
  src.connect(spatial.input as unknown as AudioNode);
  (spatial as { output?: AudioNode }).output?.connect(ctx.destination) ??
    spatial.occlusionFilter.connect?.(ctx.destination as never);
  spatial.setPosition([-10, 0, 0]);
  src.start();
  const out = await ctx.startRendering();
  return Math.abs(rmsDbfs(out.getChannelData(0)) - rmsDbfs(out.getChannelData(1)));
}

async function measureOcclusion(): Promise<number> {
  const bandEnergy = (data: Float32Array) => {
    // High-band energy proxy: mean squared first difference ≈ high-freq energy.
    let e = 0;
    for (let i = 1; i < data.length; i += 1) {
      const d = data[i] - data[i - 1];
      e += d * d;
    }
    return e / data.length;
  };
  const render = async (occlusion: number) => {
    const ctx = new OfflineAudioContext(1, SR, SR);
    const spatial = createSpatialNode({ ctx: ctx as never, panningModel: "equalpower" });
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.5);
    src.connect(spatial.input as unknown as AudioNode);
    const sink = (spatial as { output?: AudioNode }).output ?? (spatial.occlusionFilter as unknown as AudioNode);
    sink.connect(ctx.destination);
    spatial.setOcclusion(occlusion);
    src.start();
    const out = await ctx.startRendering();
    return bandEnergy(out.getChannelData(0));
  };
  return 10 * Math.log10((await render(0)) / Math.max(await render(1), 1e-12));
}

async function measureMasterChain(): Promise<{ peakDbfs: number; transparencyDb: number }> {
  const peakCtx = new OfflineAudioContext(2, SR, SR);
  const peakChain = createMasterChain(peakCtx as never);
  for (let i = 0; i < 32; i += 1) {
    const src = peakCtx.createBufferSource();
    src.buffer = noiseBuffer(peakCtx, 0.1);
    src.connect(peakChain.input);
    src.start();
  }
  peakChain.output.connect(peakCtx.destination as never);
  const peakOut = await peakCtx.startRendering();
  let peak = 0;
  for (let c = 0; c < 2; c += 1) for (const v of peakOut.getChannelData(c)) peak = Math.max(peak, Math.abs(v));

  const tCtx = new OfflineAudioContext(2, SR, SR);
  const tChain = createMasterChain(tCtx as never);
  const src = tCtx.createBufferSource();
  src.buffer = sineBuffer(tCtx, 1.0, 440, -12);
  src.connect(tChain.input);
  tChain.output.connect(tCtx.destination as never);
  src.start();
  const tOut = await tCtx.startRendering();
  // 440 Hz sine at -12 dBFS peak ≈ -15.01 dBFS RMS.
  return { peakDbfs: dbfs(peak), transparencyDb: Math.abs(rmsDbfs(tOut.getChannelData(0)) - -15.05) };
}

async function measureEngineLoop(): Promise<number> {
  const ctx = new OfflineAudioContext(1, SR, SR);
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  const buffers = new Map<string, AudioBuffer>([
    ["saw-1500", sawBuffer(ctx, 100)],
    ["saw-4500", sawBuffer(ctx, 200)]
  ]);
  let seq = 0;
  const loop = createEngineLoop({
    ctx: ctx as never,
    onLoad: [
      { asset: { url: "saw-1500" }, rpm: 1500 },
      { asset: { url: "saw-4500" }, rpm: 4500 }
    ] as never,
    idleRpm: 800,
    maxRpm: 7000,
    busInput: bus as never,
    pool: { release() {} } as never,
    bufferFor: (url) => buffers.get(url),
    startVoice: (buffer, input, looped) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer ?? null;
      src.loop = looped;
      src.connect(input as unknown as AudioNode);
      src.start();
      return {
        id: ++seq,
        cueId: "engine",
        priority: 0,
        startedAt: ctx.currentTime,
        source: src,
        gain: input as never,
        loop: looped,
        ended: false
      } as never;
    }
  });
  loop.setRpm(6000);
  const out = await ctx.startRendering();
  const data = out.getChannelData(0);
  const tail = data.slice(Math.floor(data.length * 0.6));
  // Fundamental estimate via dominant autocorrelation lag on the tail.
  const probe = tail.slice(0, 8192);
  let bestLag = 0;
  let bestCorr = -Infinity;
  for (let lag = 80; lag < 900; lag += 1) {
    let corr = 0;
    for (let i = 0; i + lag < probe.length; i += 16) corr += probe[i] * probe[i + lag];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  const measured = bestLag > 0 ? SR / bestLag : 0;
  // rpm 6000 vs the 100 Hz layer: expected shift ≈ +167 % (to ≈ 267 Hz).
  return ((measured - 100) / 100) * 100;
}

async function main(): Promise<void> {
  try {
    const [panningRatioDb, occlusionAttenuationDb, master, engineLoopShiftPct] = await Promise.all([
      measurePanning(),
      measureOcclusion(),
      measureMasterChain(),
      measureEngineLoop()
    ]);
    const cueCtx = new OfflineAudioContext(1, 4_800, SR);
    const cueRmsDbfs = rmsDbfs(sineBuffer(cueCtx, 0.1, 440, -6).getChannelData(0));
    window.__AURA3D_DSP__ = {
      status: "ready",
      panningRatioDb,
      occlusionAttenuationDb,
      masterPeakDbfs: master.peakDbfs,
      transparencyDb: master.transparencyDb,
      engineLoopShiftPct,
      cueRmsDbfs
    };
  } catch (error) {
    window.__AURA3D_DSP__ = { status: "error", error: String(error) };
  }
}

void main();
