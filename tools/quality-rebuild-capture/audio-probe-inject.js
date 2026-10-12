// Injected before any page script by audio-buzz-probe.mjs. Wraps the Web Audio
// graph so the probe can report, per context, which sources are playing, how
// loud their gain chain is, and what actually reaches the destination
// (an AnalyserNode tap spliced in front of ctx.destination).
(() => {
  const W = window;
  const Ctx = W.AudioContext || W.webkitAudioContext;
  if (!Ctx) return;
  const state = { contexts: [], sources: [], starts: 0, connects: 0 };
  W.__AUDIO_PROBE__ = state;
  const edges = new WeakMap(); // node -> Set(dest)
  const meta = new WeakMap(); // node -> {kind}
  const origConnect = AudioNode.prototype.connect;
  const origDisconnect = AudioNode.prototype.disconnect;
  const tapOf = new WeakMap(); // ctx -> tap gain
  AudioNode.prototype.connect = function (dest, ...rest) {
    state.connects += 1;
    let target = dest;
    if (dest instanceof AudioDestinationNode) {
      const tap = tapOf.get(this.context);
      if (tap && tap !== this) target = tap;
    }
    if (target instanceof AudioNode) {
      let set = edges.get(this);
      if (!set) { set = new Set(); edges.set(this, set); }
      set.add(target);
    }
    return origConnect.call(this, target, ...rest);
  };
  AudioNode.prototype.disconnect = function (...args) {
    if (args.length === 0) edges.delete(this);
    else if (args[0] instanceof AudioNode) edges.get(this)?.delete(args[0]);
    return origDisconnect.apply(this, args);
  };
  const Wrapped = function (...args) {
    const ctx = new Ctx(...args);
    const tap = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;
    origConnect.call(tap, ctx.destination);
    origConnect.call(tap, analyser);
    tapOf.set(ctx, tap);
    meta.set(tap, { kind: "tap" });
    state.contexts.push({ ctx, tap, analyser });
    return ctx;
  };
  Wrapped.prototype = Ctx.prototype;
  W.AudioContext = Wrapped;
  if (W.webkitAudioContext) W.webkitAudioContext = Wrapped;

  const track = (kind) => function (orig) {
    return function (...args) {
      const node = orig.apply(this, args);
      meta.set(node, { kind });
      if (kind === "buffer" || kind === "oscillator") {
        const rec = { node, kind, started: false, ended: false, startCount: 0, createdAt: performance.now() };
        state.sources.push(rec);
        const origStart = node.start.bind(node);
        node.start = (...a) => { rec.started = true; rec.startCount += 1; rec.startedAt = performance.now(); state.starts += 1; return origStart(...a); };
        node.addEventListener("ended", () => { rec.ended = true; });
      }
      return node;
    };
  };
  const P = BaseAudioContext.prototype;
  P.createBufferSource = track("buffer")(P.createBufferSource);
  P.createOscillator = track("oscillator")(P.createOscillator);
  // Constructor forms (new OscillatorNode(ctx) / new AudioBufferSourceNode(ctx)).
  for (const [name, kind] of [["OscillatorNode", "oscillator"], ["AudioBufferSourceNode", "buffer"]]) {
    const C = W[name];
    if (!C) continue;
    const factory = kind === "buffer" ? "createBufferSource" : "createOscillator";
    const Shim = function (ctx, opts) {
      const n = ctx[factory]();
      if (opts) for (const [k, v] of Object.entries(opts)) {
        if (n[k] instanceof AudioParam) n[k].value = v; else n[k] = v;
      }
      return n;
    };
    Shim.prototype = C.prototype;
    W[name] = Shim;
  }

  // Effective linear gain of the loudest path node -> tap (GainNode values multiplied).
  const pathGain = (node, depth = 0, seen = new Set()) => {
    if (depth > 24 || seen.has(node)) return 0;
    seen.add(node);
    const m = meta.get(node);
    if (m && m.kind === "tap") return 1;
    const outs = edges.get(node);
    if (!outs || outs.size === 0) return 0;
    let own = 1;
    if (node instanceof GainNode) own = Math.abs(node.gain.value);
    let best = 0;
    for (const o of outs) best = Math.max(best, pathGain(o, depth + 1, seen));
    return own * best;
  };

  // HTMLMediaElement playback (new Audio(url).play()) bypasses the Web Audio graph.
  const media = new Set();
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    media.add(this);
    state.mediaPlays = (state.mediaPlays ?? 0) + 1;
    return origPlay.apply(this, a);
  };

  W.__AUDIO_PROBE_SNAPSHOT__ = () => {
    const now = performance.now();
    const mediaPlaying = [...media].filter((m) => !m.paused && !m.ended).map((m) => ({
      kind: "media",
      loop: !!m.loop,
      volume: +m.volume.toFixed(3),
      muted: m.muted,
      src: String(m.currentSrc || m.src).split("/").pop().slice(0, 60)
    }));
    const playing = state.sources.filter((s) => s.started && !s.ended);
    const voices = playing.map((s) => {
      const n = s.node;
      const v = {
        kind: s.kind,
        loop: s.kind === "buffer" ? !!n.loop : true,
        ageMs: Math.round(now - (s.startedAt ?? now)),
        startCount: s.startCount,
        gainToOut: +pathGain(n).toFixed(4)
      };
      if (s.kind === "buffer") {
        v.bufferSec = n.buffer ? +n.buffer.duration.toFixed(3) : null;
        v.rate = +n.playbackRate.value.toFixed(3);
        // Loop-seam discontinuity (|last - first| sample of channel 0).
        if (n.buffer && n.buffer.length > 1) {
          const d = n.buffer.getChannelData(0);
          v.seamJump = +Math.abs(d[d.length - 1] - d[0]).toFixed(4);
        }
      } else {
        v.type = n.type;
        v.freq = +n.frequency.value.toFixed(1);
      }
      return v;
    });
    const out = state.contexts.map(({ ctx, analyser }) => {
      const td = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(td);
      let sum = 0;
      let peak = 0;
      for (const x of td) { sum += x * x; peak = Math.max(peak, Math.abs(x)); }
      const fd = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(fd);
      let bi = 1;
      for (let i = 1; i < fd.length; i += 1) if (fd[i] > fd[bi]) bi = i;
      const rms = Math.sqrt(sum / td.length);
      // Share of spectral power above 4 kHz (shrillness).
      let hi = 0;
      let all = 0;
      const hiBin = Math.floor((4000 * analyser.fftSize) / ctx.sampleRate);
      for (let i = 1; i < fd.length; i += 1) {
        const p = Math.pow(10, fd[i] / 10);
        all += p;
        if (i >= hiBin) hi += p;
      }
      return {
        hiShare: all > 0 ? +(hi / all).toFixed(4) : 0,
        state: ctx.state,
        rms: +rms.toFixed(5),
        rmsDb: +(20 * Math.log10(Math.max(rms, 1e-7))).toFixed(1),
        peak: +peak.toFixed(4),
        dominantHz: +((bi * ctx.sampleRate) / analyser.fftSize).toFixed(1),
        dominantDb: +fd[bi].toFixed(1)
      };
    });
    return {
      contexts: out,
      totalSourcesCreated: state.sources.length,
      totalStarts: state.starts,
      playingCount: voices.length,
      loopingCount: voices.filter((v) => v.loop).length,
      mediaPlays: state.mediaPlays ?? 0,
      media: mediaPlaying,
      voices
    };
  };
})();
