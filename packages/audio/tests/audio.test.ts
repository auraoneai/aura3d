import assert from "node:assert/strict";
import test from "node:test";
import { Scene } from "@aura3d/scene";
import {
  AudioClip,
  AudioContextManager,
  AudioFileManager,
  AudioListener,
  AudioSource,
  AudioTimelineTrack,
  FootstepPlayer,
  PositionalEmitter,
  SceneAudioBridge,
  SpatialAudio,
  applyOcclusionToGain,
  attachFocusPolicy,
  computeDistanceAttenuation,
  computeDopplerShift,
  createAudioTimelineMixSnapshot,
  createAudioWaveformReviewData,
  createAnimationAudioMixer,
  createExternalAudioNodeAdapter,
  createMediaElementAudioSourceAdapter,
  createMediaStreamAudioSourceAdapter,
  createAudioWaveform,
  createAudioWaveformPath,
  createGameMixer,
  occlusionLowpassFrequency,
  resolveOcclusion,
  sampleAudioWaveformAtTime,
  validateAudioCaptionSync,
  validateEpisodeAudioAssets
} from "../src/index";

class MockParam {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
}

class MockNode {
  connections: unknown[] = [];
  connect(destination: unknown) {
    this.connections.push(destination);
    return destination;
  }
  disconnect(destination?: unknown) {
    this.connections = destination ? this.connections.filter((item) => item !== destination) : [];
  }
}

class MockGain extends MockNode {
  gain = new MockParam();
}

class MockSource extends MockNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new MockParam();
  detune = new MockParam();
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  startArgs?: [number, number, number?];
  stopWhen?: number;
  start(when = 0, offset = 0, duration?: number) {
    this.started = true;
    this.startArgs = [when, offset, duration];
  }
  stop(when = 0) {
    this.stopped = true;
    this.stopWhen = when;
  }
}

function createMockAudioBuffer(channels: readonly Float32Array[], sampleRate: number): AudioBuffer {
  return {
    duration: channels.length === 0 ? 0 : (channels[0]?.length ?? 0) / sampleRate,
    length: channels[0]?.length ?? 0,
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData(index: number) {
      const channel = channels[index];
      if (!channel) throw new Error(`Unknown channel: ${index}`);
      return channel;
    }
  } as AudioBuffer;
}

test("AudioContextManager unlocks, suspends, resumes, and disposes a mock context", async () => {
  const context = {
    state: "suspended",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    async resume() {
      this.state = "running";
    },
    async suspend() {
      this.state = "suspended";
    },
    async close() {
      this.state = "closed";
    },
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => new MockSource() as unknown as AudioBufferSourceNode,
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  const manager = new AudioContextManager({ context });

  assert.equal(manager.state, "locked");
  await manager.unlock();
  assert.equal(manager.state, "running");
  await manager.suspend();
  assert.equal(manager.state, "suspended");
  await manager.dispose();
  assert.equal(manager.state, "closed");
});

test("AudioSource guards missing clip and tracks play/stop state", () => {
  const sourceNode = new MockSource();
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => sourceNode as unknown as AudioBufferSourceNode,
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  const source = new AudioSource({ context });
  assert.throws(() => source.play(), /without an AudioClip/);

  source.clip = new AudioClip({
    buffer: { duration: 1, numberOfChannels: 1, sampleRate: 44100 } as AudioBuffer
  });
  source.play();
  assert.equal(source.state, "playing");
  assert.equal(sourceNode.started, true);
  source.stop();
  assert.equal(source.state, "stopped");
});

test("SceneAudioBridge syncs listener and spatial source positions from scene nodes", () => {
  const scene = new Scene();
  const listenerNode = scene.createNode("listener");
  const sourceNode = scene.createNode("source");
  scene.root.addChild(listenerNode);
  scene.root.addChild(sourceNode);
  listenerNode.transform.setPosition(1, 2, 3);
  sourceNode.transform.setPosition(4, 5, 6);

  const listener = new AudioListener();
  const spatial = {
    position: { x: 0, y: 0, z: 0 },
    setPosition(position: { readonly x: number; readonly y: number; readonly z: number }) {
      this.position = { ...position };
    }
  };
  const bridge = new SceneAudioBridge(scene);
  bridge.bindListener(listenerNode, listener);
  bridge.bindSource(sourceNode, spatial as never);
  bridge.update();

  assert.deepEqual(listener.position, { x: 1, y: 2, z: 3 });
  assert.deepEqual(spatial.position, { x: 4, y: 5, z: 6 });
});

test("AudioFileManager loads typed audio assets once and caches decoded clips", async () => {
  const decodedBuffer = createMockAudioBuffer([new Float32Array([0, 0.5, -0.5, 0])], 4);
  let fetchCount = 0;
  let decodeCount = 0;
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => new MockSource() as unknown as AudioBufferSourceNode,
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode,
    decodeAudioData: async () => {
      decodeCount++;
      return decodedBuffer;
    }
  };
  const manager = new AudioFileManager({
    context,
    securityContext: "audio-cache-test-session",
    fetch: async (url) => {
      fetchCount++;
      assert.equal(url, "/aura-assets/dialogue.wav");
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
      };
    }
  });
  const asset = {
    kind: "aura-asset-ref",
    id: "line1",
    type: "audio",
    format: "wav",
    url: "/aura-assets/dialogue.wav"
  };

  const [first, second] = await Promise.all([manager.load(asset), manager.load(asset)]);

  assert.equal(first, second);
  assert.equal(first.name, "line1");
  assert.equal(first.duration, 1);
  assert.equal(fetchCount, 1);
  assert.equal(decodeCount, 1);
  assert.equal(manager.getCached(asset), first);
  const selected = await manager.loadFirstSupported(
    [
      { input: "/aura-assets/dialogue.ogg", mimeType: "audio/ogg" },
      { input: asset, mimeType: "audio/wav" }
    ],
    (mimeType) => mimeType === "audio/wav" ? "probably" : ""
  );
  assert.equal(selected, first);
  assert.throws(() => manager.resolve({ ...asset, type: "model" }), /not an audio asset/);
  await assert.rejects(() => manager.loadFirstSupported([{ input: asset, mimeType: "audio/wav" }], () => ""), /No supported audio codec/);
});

test("AudioWaveform computes deterministic peak data and canvas path points", () => {
  const buffer = createMockAudioBuffer([new Float32Array([-1, 1, 0.5, -0.5])], 4);
  const waveform = createAudioWaveform(buffer, { samplesPerPeak: 2 });

  assert.equal(waveform.duration, 1);
  assert.equal(waveform.peakCount, 2);
  assert.deepEqual(waveform.peaks[0], { min: -1, max: 1, rms: 1 });
  assert.deepEqual(waveform.peaks[1], { min: -0.5, max: 0.5, rms: 0.5 });
  assert.deepEqual(sampleAudioWaveformAtTime(waveform, 0.75), waveform.peaks[1]);

  const path = createAudioWaveformPath(waveform, { width: 100, height: 40 });
  assert.equal(path.length, 2);
  assert.equal(path[0]?.x, 0);
  assert.equal(path[1]?.x, 100);
  assert.equal(path[0]?.yMin, 0);
  assert.equal(path[0]?.yMax, 40);
});

test("AudioTimelineTrack edits clips, routes buses, and ducks music under dialogue", () => {
  const dialogue = new AudioTimelineTrack({ id: "dialogue", role: "dialogue" });
  const music = new AudioTimelineTrack({ id: "music", role: "music", volume: 0.8 });
  const sfx = new AudioTimelineTrack({ id: "sfx", role: "sfx" });

  dialogue.addClip({
    id: "line1",
    startTime: 1,
    duration: 2,
    envelope: [
      { time: 0, value: 0 },
      { time: 0.5, value: 1 },
      { time: 2, value: 1 }
    ]
  });
  music.addClip({ id: "bed", startTime: 0, duration: 5 });
  sfx.addClip({ id: "chime", startTime: 1.25, duration: 0.5, volume: 0.5 });

  assert.equal(dialogue.busName, "voice");
  assert.equal(sfx.busName, "sfx");
  assert.equal(dialogue.sampleAt(1.25)[0]?.volume, 0.5);

  const [left, right] = dialogue.splitClip("line1", 2, "line1b");
  assert.equal(left.duration, 1);
  assert.equal(right.startTime, 2);
  assert.equal(right.trimStart, 1);
  assert.equal(dialogue.activeClipsAt(2.25)[0]?.id, "line1b");

  const moved = sfx.moveClip("chime", 1.5);
  assert.equal(moved.startTime, 1.5);
  const trimmed = music.trimClip("bed", 1, 4);
  assert.equal(trimmed.duration, 3);

  const snapshot = createAudioTimelineMixSnapshot([dialogue, music, sfx], 2.25, {
    duckMusicDuringDialogue: true,
    duckingRatio: 0.25,
    masterVolume: 0.9
  });
  const musicBus = snapshot.buses.find((bus) => bus.busName === "music");
  const voiceBus = snapshot.buses.find((bus) => bus.busName === "voice");

  assert.equal(snapshot.dialogueActive, true);
  assert.equal(snapshot.duckingApplied, true);
  assert.equal(musicBus?.ducked, true);
  assert.equal(musicBus?.volume, 0.2);
  assert.equal(voiceBus?.volume, 1);
  assert.deepEqual(snapshot.activeSamples.map((sample) => sample.clipId).sort(), ["bed", "line1b"]);
});

test("animation episode audio readiness reports missing typed audio assets", () => {
  const readiness = validateEpisodeAudioAssets([
    {
      kind: "aura-asset-ref",
      id: "moonGardenMusic",
      type: "audio",
      format: "ogg",
      url: "/aura-assets/moon-garden-music.ogg",
      license: "CC0"
    },
    {
      kind: "aura-asset-ref",
      id: "mikoLine1",
      type: "model",
      format: "glb",
      url: "/aura-assets/miko.glb",
      license: "CC0"
    }
  ], [
    { id: "mikoLine1", role: "dialogue", requireLicense: true },
    { id: "lumaLine1", role: "dialogue", requireLicense: true },
    { id: "moonGardenMusic", role: "music", requireLicense: true }
  ]);

  assert.equal(readiness.ok, false);
  assert.equal(readiness.requiredCount, 3);
  assert.equal(readiness.readyCount, 1);
  assert.deepEqual(readiness.missingAssetIds, ["lumaLine1"]);
  assert.deepEqual(readiness.diagnostics.map((issue) => issue.code), [
    "audio-asset-wrong-type",
    "audio-asset-missing"
  ]);
});

test("animation dialogue audio stems stay aligned with captions within one frame", () => {
  const dialogue = new AudioTimelineTrack({ id: "dialogue", role: "dialogue" });
  dialogue.addClip({ id: "miko-line-1", startTime: 1, duration: 1.5 });
  dialogue.addClip({ id: "luma-line-1", startTime: 3, duration: 1 });

  const synced = validateAudioCaptionSync([dialogue], [
    { id: "caption-1", audioClipId: "miko-line-1", startTime: 1 + 1 / 60, endTime: 2.5 },
    { id: "caption-2", audioClipId: "luma-line-1", startTime: 3, endTime: 4 }
  ], { frameRate: 30, toleranceFrames: 1 });
  const broken = validateAudioCaptionSync([dialogue], [
    { id: "caption-3", audioClipId: "miko-line-1", startTime: 1.25, endTime: 2.5 }
  ], { frameRate: 30, toleranceFrames: 1 });

  assert.equal(synced.ok, true);
  assert.equal(synced.checkedCueCount, 2);
  assert.equal(broken.ok, false);
  assert.equal(broken.issues[0]?.code, "caption-audio-start-out-of-sync");
});

test("animation audio waveform review data and mixer defaults expose route evidence", () => {
  const waveform = createAudioWaveform(createMockAudioBuffer([new Float32Array([-1, 1, 0.5, -0.5])], 4), {
    samplesPerPeak: 2
  });
  const reviewData = createAudioWaveformReviewData([
    { id: "miko-line-1", label: "Miko line 1", startTime: 1, waveform }
  ], { width: 120, height: 48 });
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => new MockSource() as unknown as AudioBufferSourceNode,
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  const animationMixer = createAnimationAudioMixer(context, { musicVolume: 0.4 });
  const evidence = animationMixer.evidence({ unlocked: true });

  assert.equal(reviewData.kind, "audio-waveform-review-data");
  assert.equal(reviewData.stemCount, 1);
  assert.equal(reviewData.stems[0]?.path.length, 2);
  assert.deepEqual(evidence.buses.map((bus) => bus.name).sort(), ["ambient", "master", "music", "sfx", "voice"]);
  assert.equal(evidence.buses.find((bus) => bus.name === "music")?.volume, 0.4);
  assert.equal(evidence.unlocked, true);
});

test("distance attenuation matches the Web Audio panner formulas, including past maxDistance", () => {
  // Web Audio §6.4: inverse/exponential clamp d to [ref, ∞) — maxDistance is a
  // linear-only clamp. Past maxDistance the inverse model keeps decaying
  // (1/(1+9999) ≈ 1e-4); it is NOT forced to 0.
  assert.equal(computeDistanceAttenuation(0.5, { refDistance: 1 }), 1);
  assert.ok(Math.abs(computeDistanceAttenuation(10_000, { maxDistance: 100 }) - 1 / 10_000) < 1e-9);
  assert.equal(computeDistanceAttenuation(10_000, { maxDistance: 100, model: "linear" }), 0);
  assert.ok(Math.abs(computeDistanceAttenuation(4, { refDistance: 1, rolloffFactor: 1 }) - 1 / 4) < 1e-9);
  assert.equal(computeDistanceAttenuation(55, { refDistance: 10, maxDistance: 100, rolloffFactor: 1, model: "linear" }), 0.5);
  assert.ok(computeDistanceAttenuation(2, { refDistance: 1, rolloffFactor: 2, model: "exponential" }) < 0.26);
  // linear rolloff is clamped to [0, 1] in the spec model.
  assert.equal(computeDistanceAttenuation(100, { refDistance: 1, maxDistance: 100, rolloffFactor: 2, model: "linear" }), 0);
});

test("doppler shift is 1 at rest and rises on approach", () => {
  const rest = computeDopplerShift({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  assert.equal(rest, 1);
  const approaching = computeDopplerShift(
    { x: 10, y: 0, z: 0 }, { x: -10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }
  );
  const receding = computeDopplerShift(
    { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }
  );
  assert.ok(approaching > 1);
  assert.ok(receding < 1);
});

test("occlusion helpers clamp and map to gain + lowpass", () => {
  assert.equal(resolveOcclusion(undefined, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 0);
  assert.equal(resolveOcclusion(7, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 1);
  assert.equal(resolveOcclusion(() => 0.5, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 0.5);
  assert.equal(applyOcclusionToGain(0), 1);
  assert.ok(Math.abs(applyOcclusionToGain(1) - 0.15) < 1e-9);
  assert.equal(occlusionLowpassFrequency(0), 20_000);
  assert.equal(occlusionLowpassFrequency(1), 400);
});

class MockPanner extends MockNode {
  panningModel = "";
  distanceModel = "";
  maxDistance = 0;
  refDistance = 0;
  rolloffFactor = 0;
  positionX = new MockParam();
  positionY = new MockParam();
  positionZ = new MockParam();
}

class MockFilter extends MockNode {
  type = "";
  frequency = new MockParam();
}

function createSpatialContext() {
  const panners: MockPanner[] = [];
  const filters: MockFilter[] = [];
  const sources: MockSource[] = [];
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => {
      const source = new MockSource() as unknown as AudioBufferSourceNode & { playbackRate: { value: number } };
      (source as unknown as { playbackRate: { value: number } }).playbackRate = { value: 1 };
      sources.push(source as unknown as MockSource);
      return source;
    },
    createPanner: () => {
      const panner = new MockPanner();
      panners.push(panner);
      return panner as unknown as PannerNode;
    },
    createBiquadFilter: () => {
      const filter = new MockFilter();
      filters.push(filter);
      return filter as unknown as BiquadFilterNode;
    },
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  return { context, panners, filters, sources };
}

test("PositionalEmitter chains source into filter into panner and reports evidence", () => {
  const { context, panners, filters } = createSpatialContext();
  const emitter = new PositionalEmitter({
    context,
    clip: new AudioClip({ buffer: { duration: 1, numberOfChannels: 1, sampleRate: 44100 } as AudioBuffer }),
    position: { x: 3, y: 0, z: 0 },
    volume: 0.8
  });
  assert.equal(emitter.connected, true);
  assert.equal(panners.length, 1);
  assert.equal(filters.length, 1);
  // source gain feeds the occlusion filter, which feeds the panner.
  assert.equal(filters[0]?.connections[0], panners[0]);

  const evidence = emitter.update({ x: 0, y: 0, z: 0 });
  assert.equal(evidence.kind, "positional-emitter-evidence");
  assert.ok(Math.abs(evidence.attenuationGain - 1 / 3) < 1e-9);
  assert.equal(evidence.dopplerShift, 1);
  assert.equal(evidence.occlusion, 0);
  assert.deepEqual(evidence.position, { x: 3, y: 0, z: 0 });

  emitter.setVelocity({ x: -34.3, y: 0, z: 0 });
  const doppler = emitter.update({ x: 0, y: 0, z: 0 });
  assert.ok(doppler.dopplerShift > 1);
  assert.equal(emitter.source.playbackRate, doppler.dopplerShift);

  emitter.setOcclusion(1);
  assert.equal(emitter.evidence().occlusion, 1);
  emitter.update({ x: 0, y: 0, z: 0 });
  assert.ok(emitter.source.gain.gain.value < 0.8 * (1 / 3) + 1e-9);

  emitter.play();
  assert.equal(emitter.source.state, "playing");
  emitter.dispose();
});

test("PositionalEmitter without panner support still reports math, never fake-connected", () => {
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => new MockSource() as unknown as AudioBufferSourceNode,
    createPanner: () => {
      throw new Error("panner unavailable");
    },
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  const emitter = new PositionalEmitter({ context, position: { x: 9, y: 0, z: 0 } });
  assert.equal(emitter.connected, false);
  const evidence = emitter.update({ x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(evidence.attenuationGain - 1 / 9) < 1e-9);
  emitter.dispose();
});

test("createGameMixer builds music/sfx/voice buses with dialogue ducking", () => {
  const { context } = createSpatialContext();
  const mixer = createGameMixer(context, { musicVolume: 0.8 });
  assert.equal(mixer.evidence().music.volume, 0.8);
  assert.equal(mixer.evidence().duckingActive, false);

  const ducked = mixer.setDialogueActive(true);
  assert.equal(ducked.duckingActive, true);
  assert.ok(Math.abs(ducked.music.volume - 0.8 * 0.35) < 1e-9);
  // sfx/voice are untouched by dialogue ducking.
  assert.equal(ducked.sfx.volume, 0.9);
  assert.equal(ducked.voice.volume, 1);

  const restored = mixer.setDialogueActive(false);
  assert.equal(restored.duckingActive, false);
  assert.ok(Math.abs(restored.music.volume - 0.8) < 1e-9);

  const muted = mixer.setMuted(true);
  assert.equal(muted.muted, true);
  mixer.setMuted(false);
  assert.throws(() => mixer.setDuckingRatio(2), /between 0 and 1/);
});

test("focus policy ducks on blur and restores on focus without a DOM", () => {
  const { context } = createSpatialContext();
  const mixer = createGameMixer(context);
  const listeners = new Map<string, Array<() => void>>();
  const target = {
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
    }
  };
  const detach = attachFocusPolicy(target, mixer, "duck-on-blur");
  for (const listener of listeners.get("blur") ?? []) listener();
  assert.equal(mixer.evidence().duckingActive, true);
  for (const listener of listeners.get("focus") ?? []) listener();
  assert.equal(mixer.evidence().duckingActive, false);
  detach();
  assert.equal(listeners.get("blur")?.length ?? 0, 0);
  assert.equal(mixer.evidence().duckingActive, false);
});

test("FootstepPlayer round-robins per surface and falls back honestly", () => {
  const player = new FootstepPlayer({ surfaces: { grass: ["step-grass-a", "step-grass-b"] }, fallback: "step-default" });
  assert.equal(player.onPlant({ foot: "left", surface: "grass" }), "step-grass-a");
  assert.equal(player.onPlant({ foot: "right", surface: "grass" }), "step-grass-b");
  assert.equal(player.onPlant({ foot: "left", surface: "grass" }), "step-grass-a");
  assert.equal(player.onPlant({ foot: "left", surface: "metal" }), "step-default");
  assert.equal(player.evidence().plantCount, 4);
  assert.equal(player.evidence().lastCue, "step-default");

  const bare = new FootstepPlayer();
  assert.equal(bare.onPlant({ foot: "left", surface: "grass" }), null);
  assert.equal(bare.evidence().plantCount, 0);
  assert.throws(() => bare.registerSurface("empty", []), /at least one cue/);
});

function playbackContext() {
  const nodes: MockSource[] = [];
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => {
      const node = new MockSource();
      nodes.push(node);
      return node as unknown as AudioBufferSourceNode;
    },
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  return { context, nodes };
}

function twentySecondClip(): AudioClip {
  return new AudioClip({ buffer: { duration: 20, numberOfChannels: 1, sampleRate: 48_000 } as AudioBuffer });
}

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be near ${expected}`);
}

test("AudioSource accounts for rate, detune, delayed starts and resumable sprite duration", () => {
  const { context, nodes } = playbackContext();
  const source = new AudioSource({ context, clip: twentySecondClip() });
  context.currentTime = 10;
  source.play(12);
  context.currentTime = 11;
  assert.equal(source.positionSeconds, 0);
  source.pause();
  assert.equal(source.positionSeconds, 0);
  assert.equal(nodes[0].stopped, true);
  source.resume();
  assert.deepEqual(nodes[1].startArgs, [0, 0, undefined]);
  context.currentTime = 13;
  near(source.positionSeconds, 2);
  source.setPlaybackRate(2);
  context.currentTime = 14;
  near(source.positionSeconds, 4);
  source.setDetune(1200);
  assert.equal(nodes[1].detune.value, 1200);
  context.currentTime = 14.5;
  near(source.positionSeconds, 6);
  source.pause();
  source.resume();
  assert.deepEqual(nodes[2].startArgs, [0, 6, undefined]);
  assert.equal(nodes[2].playbackRate.value, 2);
  assert.equal(nodes[2].detune.value, 1200);

  source.stop();
  source.setPlaybackRate(1);
  source.setDetune(0);
  source.playSprite(4, 3);
  context.currentTime += 1;
  source.pause();
  near(source.positionSeconds, 5);
  source.resume();
  assert.deepEqual(nodes[4].startArgs, [0, 5, 2]);
  source.dispose();
  source.dispose();
  assert.throws(() => source.play(), /disposed/);
});

test("AudioSource integrates exponential rate ramps, loop regions, and scheduled stops", () => {
  const { context, nodes } = playbackContext();
  const source = new AudioSource({ context, clip: twentySecondClip(), loop: true, loopStart: 2, loopEnd: 5 });
  source.play();
  assert.equal(nodes[0].loopStart, 2);
  assert.equal(nodes[0].loopEnd, 5);
  context.currentTime = 7;
  near(source.positionSeconds, 4);
  source.pause();
  source.resume();
  assert.deepEqual(nodes[1].startArgs, [0, 4, undefined]);
  context.currentTime = 9;
  near(source.positionSeconds, 3);
  source.setLoopRegion(1, 4);
  assert.equal(nodes[1].loopStart, 1);
  assert.equal(nodes[1].loopEnd, 4);
  assert.throws(() => source.setLoopRegion(4, 2), RangeError);
  source.stop(11);
  assert.equal(source.state, "playing");
  assert.equal(nodes[1].stopWhen, 11);
  assert.ok(nodes[1].connections.length > 0);
  context.currentTime = 10;
  near(source.positionSeconds, 1);
  nodes[1].onended?.();
  assert.equal(source.state, "stopped");
  assert.equal(nodes[1].connections.length, 0);

  context.currentTime = 12;
  source.loop = false;
  source.play();
  source.setPlaybackRate(3, 3000); // tau = 1 second
  context.currentTime = 13;
  const firstRampDistance = 3 - 2 * (1 - Math.exp(-1));
  near(source.positionSeconds, firstRampDistance);
  source.pause();
  near(source.positionSeconds, firstRampDistance);
  context.currentTime = 20;
  source.resume();
  context.currentTime = 21;
  near(source.positionSeconds, firstRampDistance + 3 - (2 / Math.E) * (1 - 1 / Math.E));
  source.dispose();
});

test("AudioSource integrates successive rate targets and does not resume an exhausted sprite", () => {
  const { context, nodes } = playbackContext();
  const source = new AudioSource({ context, clip: twentySecondClip() });
  source.play();
  source.setPlaybackRate(3, 3000);
  context.currentTime = 1;
  const first = 3 - 2 * (1 - 1 / Math.E);
  source.setPlaybackRate(1, 1500);
  context.currentTime = 2;
  near(source.positionSeconds, first + 1 + (2 - 2 / Math.E) * (1 - Math.exp(-2)) / 2);
  source.stop();
  source.playSprite(4, 1);
  context.currentTime = 4;
  source.pause();
  assert.equal(source.state, "stopped");
  source.resume();
  assert.equal(nodes.length, 2);
  source.dispose();
});

test("AudioSource replaces active rate automation when switching to an immediate rate", () => {
  type Event = { type: "value" | "target"; value: number; time: number; constant?: number };
  class AutomationParam extends MockParam {
    events: Event[] = [];
    setTargetAtTime(value: number, time = 0, constant = 1) {
      this.events.push({ type: "target", value, time, constant });
    }
    setValueAtTime(value: number, time = 0) {
      this.events.push({ type: "value", value, time });
    }
    cancelScheduledValues(time = 0) {
      this.events = this.events.filter((event) => event.time < time);
    }
    at(time: number): number {
      let value = 1;
      let target: number | undefined;
      let constant = 1;
      let at = 0;
      for (const event of this.events) {
        if (event.time > time) break;
        if (target !== undefined) value = target + (value - target) * Math.exp(-(event.time - at) / constant);
        if (event.type === "value") { value = event.value; target = undefined; }
        else { target = event.value; constant = event.constant!; }
        at = event.time;
      }
      return target === undefined ? value : target + (value - target) * Math.exp(-(time - at) / constant);
    }
  }
  const { context, nodes } = playbackContext();
  const create = context.createBufferSource;
  let automation!: AutomationParam;
  context.createBufferSource = () => {
    const node = create();
    automation = new AutomationParam();
    (nodes[nodes.length - 1] as MockSource).playbackRate = automation;
    return node;
  };
  const source = new AudioSource({ context, clip: twentySecondClip() });
  source.play();
  source.setPlaybackRate(3, 3000);
  context.currentTime = 1;
  const rampDistance = 3 - 2 * (1 - Math.exp(-1));
  source.setPlaybackRate(4);
  context.currentTime = 2;
  near(source.positionSeconds, rampDistance + 4);
  near(automation.at(2), 4);
  source.dispose();
});

test("AudioSource respects a sprite offset past its loop and resumes without rewinding", () => {
  const { context, nodes } = playbackContext();
  const source = new AudioSource({ context, clip: twentySecondClip(), loop: true, loopStart: 2, loopEnd: 5 });
  source.playSprite(8, 4, 10);
  context.currentTime = 9;
  near(source.positionSeconds, 8);
  context.currentTime = 10;
  near(source.positionSeconds, 5);
  context.currentTime = 11;
  near(source.positionSeconds, 6);
  source.pause();
  source.resume();
  assert.deepEqual(nodes[1].startArgs, [0, 6, 3]);
  assert.equal(nodes[1].loop, false);
  source.loop = true;
  assert.equal(nodes[1].loop, false);
  source.setLoopRegion(1, 5);
  assert.equal(nodes[1].loop, false);
  context.currentTime = 12;
  near(source.positionSeconds, 7);
  source.setLoopRegion(2, 10);
  assert.equal(nodes[1].loop, true);
  context.currentTime = 15;
  // The four buffer seconds requested by the sprite are exhausted at 9.
  near(source.positionSeconds, 9);
  source.dispose();
});

test("AudioSource pauses a delayed looped sprite before the start without changing its requested offset", () => {
  const { context, nodes } = playbackContext();
  const source = new AudioSource({ context, clip: twentySecondClip(), loop: true, loopStart: 2, loopEnd: 5 });
  source.playSprite(8, 4, 10);
  context.currentTime = 2;
  source.pause();
  source.resume();
  assert.equal(nodes[1].loop, true);
  assert.deepEqual(nodes[1].startArgs, [0, 8, 4]);
  near(source.positionSeconds, 5);
  source.dispose();
});

test("AudioSource rejects an invalid sprite start without corrupting the active voice", () => {
  const { context, nodes } = playbackContext();
  const source = new AudioSource({ context, clip: twentySecondClip() });
  source.play();
  context.currentTime = 1;
  assert.throws(() => source.playSprite(8, 4, -1), /start time/);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].stopped, false);
  near(source.positionSeconds, 1);
  const create = context.createBufferSource;
  context.createBufferSource = () => { throw new Error("source unavailable"); };
  assert.throws(() => source.playSprite(8, 4), /source unavailable/);
  near(source.positionSeconds, 1);
  assert.equal(nodes[0].stopped, false);
  context.createBufferSource = create;
  source.pause();
  source.resume();
  assert.deepEqual(nodes[1].startArgs, [0, 1, undefined]);
  source.dispose();
});

test("SceneAudioBridge resolves nested mirrored, nonuniform world poses and releases borrowed bindings", () => {
  const scene = new Scene();
  const parent = scene.createNode("parent");
  const child = scene.createNode("child");
  scene.root.addChild(parent);
  parent.addChild(child);
  const halfSqrt = Math.SQRT1_2;
  parent.transform.setPosition(3, 4, 5).setRotation(0, halfSqrt, 0, halfSqrt).setScale(-2, 3, 4);
  child.transform.setPosition(1, 2, 3).setRotation(0, 0, halfSqrt, halfSqrt);
  const listener = new AudioListener();
  const spatial = {
    orientation: { x: 1, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    setPosition(position: { x: number; y: number; z: number }) { this.position = { ...position }; },
    setOrientation(orientation: { x: number; y: number; z: number }) { this.orientation = { ...orientation }; }
  };
  // No Scene argument: ancestor transforms still have to be updated.
  const bridge = new SceneAudioBridge();
  bridge.bindListener(child, listener);
  const binding = bridge.bindSource(child, spatial as never);
  bridge.update();
  near(listener.position.x, 15); near(listener.position.y, 10); near(listener.position.z, 7);
  near(listener.forward.x, -1); near(listener.forward.y, 0); near(listener.forward.z, 0);
  near(listener.up.x, 0); near(listener.up.y, 0); near(listener.up.z, -1);
  near(spatial.orientation.x, 0); near(spatial.orientation.y, 1); near(spatial.orientation.z, 0);
  near(spatial.position.x, 15); near(spatial.position.y, 10); near(spatial.position.z, 7);
  bridge.unbindSource(binding);
  bridge.unbindListener();
  child.transform.setPosition(0, 0, 0);
  bridge.update();
  near(listener.position.x, 15);
  near(spatial.position.x, 15);
  bridge.dispose();
  bridge.dispose();
  assert.throws(() => bridge.bindListener(child, listener), /disposed/);
});

test("SceneAudioBridge writes world axes to native listener and panner parameters", () => {
  const { context } = playbackContext();
  const nativeListener = {
    positionX: new MockParam(), positionY: new MockParam(), positionZ: new MockParam(),
    forwardX: new MockParam(), forwardY: new MockParam(), forwardZ: new MockParam(),
    upX: new MockParam(), upY: new MockParam(), upZ: new MockParam()
  };
  const panner = Object.assign(new MockNode(), {
    positionX: new MockParam(), positionY: new MockParam(), positionZ: new MockParam(),
    orientationX: new MockParam(), orientationY: new MockParam(), orientationZ: new MockParam()
  });
  const graph = { ...context, listener: nativeListener, createPanner: () => panner as unknown as PannerNode };
  const scene = new Scene();
  const node = scene.createNode("oriented");
  scene.root.addChild(node);
  node.transform.setRotation(0, Math.SQRT1_2, 0, Math.SQRT1_2);
  const listener = new AudioListener({ context: graph });
  const spatial = new SpatialAudio({ context: graph });
  const bridge = new SceneAudioBridge(scene);
  bridge.bindListener(node, listener);
  bridge.bindSource(node, spatial);
  bridge.update();
  near(nativeListener.forwardX.value, -1);
  near(nativeListener.forwardY.value, 0);
  near(nativeListener.forwardZ.value, 0);
  near(nativeListener.upY.value, 1);
  near(panner.orientationX.value, 0);
  near(panner.orientationY.value, 0);
  near(panner.orientationZ.value, -1);
  bridge.dispose();
  spatial.dispose();
  assert.equal(panner.connections.length, 0);
});

test("SceneAudioBridge keeps listener axes unit and orthogonal under inherited shear", () => {
  const scene = new Scene();
  const parent = scene.createNode("stretched");
  const child = scene.createNode("tilted");
  scene.root.addChild(parent);
  parent.addChild(child);
  parent.transform.setScale(1, 2, 3);
  child.transform.setRotation(Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8));
  const listener = new AudioListener();
  const bridge = new SceneAudioBridge(scene);
  bridge.bindListener(child, listener);
  bridge.update();
  near(listener.forward.y, 2 / Math.sqrt(13));
  near(listener.forward.z, -3 / Math.sqrt(13));
  near(listener.up.y, 3 / Math.sqrt(13));
  near(listener.up.z, 2 / Math.sqrt(13));
  near(listener.forward.x * listener.up.x + listener.forward.y * listener.up.y + listener.forward.z * listener.up.z, 0);
});

test("SceneAudioBridge updates the scene hierarchy once while resolving detached bindings", () => {
  const scene = new Scene();
  const first = scene.createNode("first");
  const second = scene.createNode("second");
  const detachedParent = scene.createNode("detached-parent");
  const detached = scene.createNode("detached");
  scene.root.addChild(first).addChild(second);
  detachedParent.addChild(detached);
  detachedParent.transform.setPosition(7, 8, 9);
  let rootUpdates = 0;
  const updateRoot = scene.root.updateWorldTransform.bind(scene.root);
  scene.root.updateWorldTransform = (force = false) => { rootUpdates++; updateRoot(force); };
  const bridge = new SceneAudioBridge(scene);
  const listener = new AudioListener();
  const otherListener = new AudioListener();
  const spatial = { setPosition: (value: { x: number; y: number; z: number }) => otherListener.setTransform(value) };
  bridge.bindListener(detached, listener);
  bridge.bindSource(first, spatial as never);
  bridge.bindSource(second, spatial as never);
  bridge.update();
  assert.equal(rootUpdates, 1);
  assert.deepEqual(listener.position, { x: 7, y: 8, z: 9 });
  bridge.dispose();
});

test("audio source adapters preserve borrowed routes, user-gesture failures, and owned media teardown", async () => {
  const output = new MockNode();
  const unrelated = new MockNode();
  const mediaSource = new MockNode();
  const streamSource = new MockNode();
  let elementCreations = 0;
  let resumed = 0;
  let played = 0;
  let paused = 0;
  let trackStops = 0;
  const context = {
    destination: output as unknown as AudioNode,
    createGain: () => new MockGain() as unknown as GainNode,
    createMediaElementSource: () => { elementCreations++; return mediaSource as unknown as MediaElementAudioSourceNode; },
    createMediaStreamSource: () => streamSource as unknown as MediaStreamAudioSourceNode,
    resume: () => { resumed++; }
  };
  const element = { play: async () => { played++; throw new Error("gesture required"); }, pause: () => { paused++; } } as unknown as HTMLMediaElement;
  const stream = { getTracks: () => [{ stop: () => { trackStops++; } }, { stop: () => { trackStops++; } }] } as unknown as MediaStream;
  mediaSource.connect(unrelated);
  const borrowed = createMediaElementAudioSourceAdapter({ context, element });
  const other = createMediaElementAudioSourceAdapter({ context, element, ownership: "owned" });
  assert.equal(elementCreations, 1);
  assert.equal(mediaSource.connections.length, 3);
  assert.equal(played, 0);
  assert.equal(resumed, 0);
  await assert.rejects(borrowed.play(), /gesture required/);
  borrowed.dispose();
  borrowed.dispose();
  assert.equal(mediaSource.connections.length, 2);
  assert.ok(mediaSource.connections.includes(unrelated));
  assert.equal(paused, 0);
  assert.throws(() => borrowed.connect(output as unknown as AudioNode), /disposed/);
  other.dispose();
  assert.deepEqual(mediaSource.connections, [unrelated]);
  assert.equal(paused, 1);
  assert.equal(played, 1);
  assert.equal(resumed, 0);
  const again = createMediaElementAudioSourceAdapter({ context, element });
  assert.equal(elementCreations, 1);
  again.dispose();
  const anotherContext = { ...context, createMediaElementSource: () => new MockNode() as unknown as MediaElementAudioSourceNode };
  assert.throws(() => createMediaElementAudioSourceAdapter({ context: anotherContext, element }), /another audio context/i);

  const borrowedStream = createMediaStreamAudioSourceAdapter({ context, stream });
  borrowedStream.pause();
  assert.equal(borrowedStream.output.gain.value, 0);
  await borrowedStream.play();
  assert.equal(borrowedStream.output.gain.value, 1);
  borrowedStream.dispose();
  assert.equal(trackStops, 0);
  const ownedStream = createMediaStreamAudioSourceAdapter({ context, stream, ownership: "owned" });
  ownedStream.dispose();
  ownedStream.dispose();
  assert.equal(trackStops, 2);

  const external = new MockSource();
  external.connect(unrelated);
  const externalAdapter = createExternalAudioNodeAdapter({ context, node: external as unknown as AudioNode });
  externalAdapter.dispose();
  assert.deepEqual(external.connections, [unrelated]);
  assert.equal(external.stopped, false);
  const ownedExternal = createExternalAudioNodeAdapter({ context, node: external as unknown as AudioNode, ownership: "owned" });
  ownedExternal.dispose();
  assert.equal(external.stopped, true);
  assert.equal(external.connections.length, 0);
  assert.throws(() => createMediaStreamAudioSourceAdapter({ context: { destination: context.destination, createGain: context.createGain }, stream }), /does not support/);

  let settlePlay!: () => void;
  let latePauses = 0;
  const lateElement = {
    play: () => new Promise<void>((resolve) => { settlePlay = resolve; }),
    pause: () => { latePauses++; }
  } as unknown as HTMLMediaElement;
  const late = createMediaElementAudioSourceAdapter({ context, element: lateElement, ownership: "owned" });
  const pendingPlay = late.play();
  late.dispose();
  settlePlay();
  await pendingPlay;
  assert.equal(latePauses, 2);
});

test("owned stream teardown attempts every track even when one stop fails", () => {
  const { context } = playbackContext();
  let secondStopped = false;
  const stream = { getTracks: () => [
    { stop: () => { throw new Error("first track failed"); } },
    { stop: () => { secondStopped = true; } }
  ] } as unknown as MediaStream;
  const graph = { ...context, createMediaStreamSource: () => new MockNode() as unknown as MediaStreamAudioSourceNode };
  const adapter = createMediaStreamAudioSourceAdapter({ context: graph, stream, ownership: "owned" });
  assert.throws(() => adapter.dispose(), /first track failed/);
  assert.equal(secondStopped, true);
  assert.equal(adapter.disposed, true);
});

test("owned adapter releases its stream if output disconnection fails", () => {
  const { context } = playbackContext();
  const input = new MockNode();
  const output = new MockGain();
  output.disconnect = () => { throw new Error("output disconnect failed"); };
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => { stopped++; } }] } as unknown as MediaStream;
  const graph = {
    ...context,
    createGain: () => output as unknown as GainNode,
    createMediaStreamSource: () => input as unknown as MediaStreamAudioSourceNode
  };
  const adapter = createMediaStreamAudioSourceAdapter({ context: graph, stream, ownership: "owned" });
  assert.throws(() => adapter.dispose(), /output disconnect failed/);
  assert.deepEqual(input.connections, []);
  assert.equal(stopped, 1);
  assert.equal(adapter.disposed, true);
});

test("AudioContextManager defers unlock until running and recovers from iOS interrupted statechange", async () => {
  const listeners = new Set<() => void>();
  let allowRunning = false;
  const context = {
    state: "suspended",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    addEventListener(_type: "statechange", listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: "statechange", listener: () => void) {
      listeners.delete(listener);
    },
    async resume() {
      if (allowRunning) {
        this.state = "running";
        listeners.forEach((cb) => cb());
      }
    },
    async suspend() {
      this.state = "suspended";
      listeners.forEach((cb) => cb());
    },
    async close() {
      this.state = "closed";
    },
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => new MockSource() as unknown as AudioBufferSourceNode,
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };

  const states: string[] = [];
  const manager = new AudioContextManager({ context });
  const off = manager.onStateChange((state) => states.push(state));

  // Non-gesture unlock attempt where context remains suspended stays locked.
  await manager.unlock();
  assert.equal(manager.state, "locked");

  // Gesture unlock succeeds once context reaches running.
  allowRunning = true;
  await manager.unlock();
  assert.equal(manager.state, "running");

  // iOS Safari interruption re-locks the manager so gesture listeners re-arm.
  context.state = "interrupted";
  listeners.forEach((cb) => cb());
  assert.equal(manager.state, "locked");

  // Subsequent gesture unlock recovers cleanly.
  await manager.unlock();
  assert.equal(manager.state, "running");
  assert.ok(states.includes("locked"));
  assert.ok(states.includes("running"));

  off();
  await manager.dispose();
  assert.equal(listeners.size, 0);
});
