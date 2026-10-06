/**
 * Courier Rush engine-loop fixture — exercises the same `createEngineLoop`
 * contract the migrated route uses (same `vehicle.van.*` layer ids, same rpm
 * anchors, same speed→rpm / throttle→load mapping) so `audio-live.spec.ts`
 * can assert live pitch shifting in a real browser without depending on the
 * route's own sources (PRD-09 1739).
 */
import {
  AudioContextManager,
  VoicePool,
  createEngineLoop,
  formatExtension,
  probeFormat,
  type EngineLoopSpec,
  type SoundGraphContext
} from "@aura3d/audio";
// Variant picking never runs in this fixture (the loop's voices are started
// by our own startVoice), so a fixed rng keeps the pool deterministic.
const fixtureRng = () => 0.5;

/** Same anchors as the route's vanEngineSpec: three layers across the span. */
export const vanEngineSpec: EngineLoopSpec = {
  idleRpm: 700,
  maxRpm: 4800,
  bus: "sfx",
  onLoad: [
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer0.on.{format}" }, rpm: 700 },
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer1.on.{format}" }, rpm: 2400 },
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer2.on.{format}" }, rpm: 4800 }
  ],
  offLoad: [
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer0.off.{format}" }, rpm: 700 },
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer1.off.{format}" }, rpm: 2400 },
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer2.off.{format}" }, rpm: 4800 }
  ]
};

export const VAN_MAX_SPEED = 13;

/** Route updateEngine math: van speed (m/s) → rpm inside [idle, max]. */
export const rpmForSpeed = (speed: number): number =>
  vanEngineSpec.idleRpm +
  Math.min(1, Math.abs(speed) / VAN_MAX_SPEED) * (vanEngineSpec.maxRpm - vanEngineSpec.idleRpm);

export interface FixtureLayerReport {
  readonly rpm: number;
  readonly onLoad: boolean;
  /** Loop's own AudioBufferSourceNode.playbackRate — the live RPM pitch. */
  readonly rate: number;
  /** The per-layer gain node the loop fades (reported separately too). */
  readonly gain: number;
  readonly buffered: boolean;
}

type LayerSpec = EngineLoopSpec["onLoad"][number];

/**
 * Build the real engine loop on a live AudioContextManager context. Every
 * pack layer is decoded up front (the route's cues are eagerly loaded the
 * same way) and the fixture's `startVoice` captures each source the loop
 * starts, so `layerReport()` reads the loop's own playbackRate/gain state.
 */
export async function createCourierEngineFixture(options: { readonly probeBase?: string } = {}) {
  const manager = new AudioContextManager();
  const ctx = manager.context as unknown as SoundGraphContext;
  const buffers = new Map<string, AudioBuffer>();
  const captured: { source: { playbackRate: { value: number }; connect(d: unknown): void; start(): void; buffer: unknown }; input: unknown }[] = [];

  const ext = formatExtension(
    await probeFormat({
      decodeAudioData: (data) => ctx.decodeAudioData!(data),
      probeBase: options.probeBase
    }).catch(() => "aac-m4a" as const)
  );
  const resolve = (url: string) => url.replace("{format}", ext);

  const decode = async (url: string): Promise<AudioBuffer> =>
    ctx.decodeAudioData!(await fetch(resolve(url)).then((r) => r.arrayBuffer()));

  const specs: { spec: LayerSpec; onLoad: boolean }[] = [
    ...vanEngineSpec.onLoad.map((spec) => ({ spec, onLoad: true })),
    ...(vanEngineSpec.offLoad ?? []).map((spec) => ({ spec, onLoad: false }))
  ];
  await Promise.all(specs.map(({ spec }) => decode(spec.asset.url).then((b) => buffers.set(spec.asset.url, b))));

  const busInput = ctx.createGain() as unknown as Parameters<typeof createEngineLoop>[0]["busInput"];
  (busInput as unknown as { connect(d: unknown): void }).connect(ctx.destination);

  const pool = new VoicePool({
    ctx,
    rng: fixtureRng,
    bufferFor: (url) => buffers.get(url),
    voiceCap: 32
  });

  const engine = createEngineLoop({
    ctx,
    onLoad: vanEngineSpec.onLoad,
    offLoad: vanEngineSpec.offLoad,
    idleRpm: vanEngineSpec.idleRpm,
    maxRpm: vanEngineSpec.maxRpm,
    busInput,
    pool,
    bufferFor: (url) => buffers.get(url),
    startVoice: (buffer, input, loop) => {
      const source = ctx.createBufferSource() as unknown as {
        buffer: AudioBuffer | null;
        loop: boolean;
        playbackRate: { value: number };
        connect(d: unknown): void;
        start(w?: number): void;
      };
      source.buffer = (buffer as AudioBuffer | undefined) ?? null;
      source.loop = loop;
      source.connect(input);
      source.start(0);
      captured.push({ source: source as never, input });
      return {
        id: captured.length,
        cueId: "_engine",
        priority: 0,
        startedAt: ctx.currentTime * 1000,
        source: source as never,
        gain: input as never,
        loop,
        ended: false
      } as never;
    }
  });

  // buildSet order is on-load layers then off-load layers, spec order kept.
  const layerAt = (i: number) => ({ spec: specs[i].spec, onLoad: specs[i].onLoad, source: captured[i].source });

  return {
    contextState: () => String(ctx.state),
    unlock: async () => { await ctx.resume(); },
    setRpm: (rpm: number) => engine.setRpm(rpm),
    setLoad: (load: number) => engine.setLoad(load),
    /** Route updateEngine(): call per frame with van speed + throttle. */
    update(speed: number, throttle: number) {
      engine.setRpm(rpmForSpeed(speed));
      engine.setLoad(Math.min(1, Math.max(0, throttle)));
    },
    layerReport(): readonly FixtureLayerReport[] {
      return specs.map((_, i) => {
        const l = layerAt(i);
        return {
          rpm: l.spec.rpm,
          onLoad: l.onLoad,
          rate: l.source.playbackRate.value,
          // The engine hands each source its per-layer gain node as `input`.
          gain: (captured[i].input as unknown as { gain?: { value: number } }).gain?.value ?? -1,
          buffered: l.source.buffer != null
        };
      });
    },
    stop: () => engine.stop()
  };
}
