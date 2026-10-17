/* Recorded tennis impacts, shared by local and server-confirmed contacts. */
(function(root) {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const assets = {hit:'/toptennis/assets/audio/racket.wav', bounce:'/toptennis/assets/audio/bounce.wav'};

  function create() {
    let context = null, master = null, enabled = true;
    const buffers = {}, fallback = {}, voices = new Set();
    const previousVariant = {hit:-1, bounce:-1};
    // Fetch while the menu is open; creating/resuming the context stays inside
    // a user gesture. A missing file never holds up the match or queues old hits.
    const downloads = Object.fromEntries(Object.entries(assets).map(([kind, url]) =>
      [kind, typeof root.fetch === 'function' ? root.fetch(url).then(response => {
        if (!response.ok) throw new Error('Audio unavailable');
        return response.arrayBuffer();
      }).catch(() => null) : Promise.resolve(null)]));

    function init() {
      if (!enabled) return;
      if (!context) {
        const AudioContextClass = root.AudioContext || root.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
          context = new AudioContextClass({latencyHint:'interactive'});
          master = context.createGain();
          master.gain.value = .9;
          master.connect(context.destination);
          for (const kind of Object.keys(assets)) {
            fallback[kind] = makeFallback(kind);
            downloads[kind].then(bytes => bytes && context.decodeAudioData(bytes))
              .then(buffer => { if (buffer) buffers[kind] = buffer; }).catch(() => {});
          }
        } catch { context = null; master = null; return; }
      }
      if (context.state === 'suspended' || context.state === 'interrupted') context.resume().catch(() => {});
    }

    // A short, damped impact only covers slow/failed downloads. Normal playback
    // uses the bundled field recordings, with their natural string/felt detail.
    function makeFallback(kind) {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .13), context.sampleRate);
      const data = buffer.getChannelData(0), hit = kind === 'hit';
      let seed = hit ? 739 : 193, noise = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / context.sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        noise = noise * .42 + (seed / 2147483648) * .58;
        const attack = Math.min(1, t / .0006);
        data[i] = attack * (.48 * noise * Math.exp(-t / (hit ? .009 : .006)) +
          .26 * Math.sin(2 * Math.PI * (hit ? 330 : 175) * t) * Math.exp(-t / .014));
      }
      return buffer;
    }

    function setEnabled(value) {
      enabled = !!value;
      if (!enabled) {
        if (master) master.gain.setValueAtTime(0, context.currentTime);
        // Stop delayed score tones as well, so unmuting cannot resurrect them.
        for (const source of voices) { try { source.stop(); } catch {} }
      } else {
        init();
        if (master) master.gain.setValueAtTime(.9, context.currentTime);
      }
    }

    function track(source, nodes) {
      voices.add(source);
      source.onended = () => {
        voices.delete(source);
        source.disconnect();
        for (const node of nodes) node.disconnect();
      };
    }

    function impact(kind, pitch, contact = {}) {
      if (!enabled || !context || context.state !== 'running') return;
      const isHit = kind === 'hit';
      const energy = isHit ? clamp(finite(contact.speedKph, 100) / 145, .22, 1) :
        clamp(finite(contact.verticalSpeed, 3) / 6, .025, 1);
      const distance = clamp((finite(contact.y, 0) + 1.25) / 2.5, 0, 1);
      const surface = contact.venue === 'grass' ? {gain:.7, cutoff:2100} :
        contact.venue === 'clay' ? {gain:.88, cutoff:4400} : {gain:1, cutoff:10000};
      const source = context.createBufferSource();
      source.buffer = buffers[kind] || fallback[kind];
      // Narrow variation keeps consecutive contacts natural without cartoon
      // pitch sweeps; shot strength primarily changes loudness.
      source.playbackRate.value = 1 + (Math.random() - .5) * .045 +
        (isHit ? clamp(finite(pitch, 1) - 1, -.2, .28) * .08 : 0);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass'; filter.Q.value = .5;
      filter.frequency.value = isHit ? 11000 : surface.cutoff;
      const gain = context.createGain();
      gain.gain.value = (isHit ? .38 + .32 * Math.sqrt(energy) : .46 * Math.sqrt(energy) * surface.gain) *
        (.76 + distance * .24) * (.96 + Math.random() * .08);
      const nodes = [filter, gain];
      source.connect(filter).connect(gain);
      if (context.createStereoPanner) {
        const pan = context.createStereoPanner();
        pan.pan.value = clamp(finite(contact.x, 0) * .48, -.65, .65);
        gain.connect(pan).connect(master); nodes.push(pan);
      } else gain.connect(master);
      track(source, nodes);
      if (buffers[kind]) {
        // Three separately recorded contacts per sprite; never repeat the same
        // take consecutively. Each 240 ms slice has a faded, silent boundary.
        const index = (previousVariant[kind] + 1 + Math.floor(Math.random() * 2)) % 3;
        previousVariant[kind] = index;
        source.start(context.currentTime, index * .3, .24);
      } else source.start(context.currentTime);
    }

    function tone(freq, duration, type = 'sine', volume = .04, delay = 0) {
      if (!enabled || !context || context.state !== 'running') return;
      const time = context.currentTime + delay;
      const source = context.createOscillator(), gain = context.createGain();
      source.type = type; source.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(.001, time + duration);
      source.connect(gain).connect(master);
      track(source, [gain]); source.start(time); source.stop(time + duration);
    }

    return {init, setEnabled, tone, hit:(pitch = 1, contact) => impact('hit', pitch, contact),
      bounce:contact => impact('bounce', 1, contact)};
  }
  root.TennisAudio = Object.freeze({create});
})(window);
