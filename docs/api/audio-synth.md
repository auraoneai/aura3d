# Audio synth kit (`@aura3d/audio`, also `@aura3d/engine/audio`)

Procedural sound cues with no samples and no assets. Games kept re-writing the same Web Audio synth (ten `audio.ts` files); this kit is that code, once.

It sits on the page's single `AudioContextManager`, so the one-`AudioContext`-owner rule still holds: the kit never constructs a context itself.

```ts
import { createCueBank, createStepSequencer, createToneLoop, noteFrom, SCALES, scaleSemitones } from "@aura3d/engine/audio";

const note = noteFrom(523.25); // C5
const bank = createCueBank({
  cues: {
    coin: { layers: [{ freq: note(12), type: "triangle", dur: 0.14, gain: 0.2, slideTo: note(19) }] },
    // A layer function reads the level you pass to play(): the pitch climbs with a combo.
    match: { layers: ({ level }) => [{ freq: note(scaleSemitones(SCALES.pentatonic, level)), type: "triangle", dur: 0.16 }] },
    crash: {
      layers: [
        { freq: 190, type: "sawtooth", dur: 0.32, slideTo: 55 },
        { kind: "noise", dur: 0.26, gain: 0.11, freq: 430, q: 0.7, slideTo: 110 }
      ],
      priority: 1,
      duckMusic: { amount: 0.6, ms: 700 }
    }
  },
  muteKey: "KeyM" // default; `false` turns the binding off
});

bank.install(); // first pointerdown/keydown/touchstart unlocks audio, M toggles mute
bank.play("coin");
bank.play("match", { level: combo });
```

## Cues

A cue is a list of layers. A **tone layer** is an oscillator with an exponential attack/decay envelope, an optional pitch glide (`slideTo`), `delay`, `detune` and an optional filter. A **noise layer** is deterministic filtered noise (`kind: "noise"`, an LCG, never `Math.random`: a simulation's random stream stays untouched) with an optional cutoff sweep. `layers` may be a function of `{ level, pitch, gain }`.

Per-cue limits: `priority` (cues with `priority > 0` may use 1.5x the voice budget), `cooldownMs`, `maxConcurrent`, and `duckMusic` (dip the music bus while the cue sounds).

`play()` returns `false` when the bank is locked, muted, cooling down or over budget, so callers never need to check state.

## Bank

| Member | Purpose |
| --- | --- |
| `unlock()` | Create the graph and resume the context. Call from a gesture; safe to repeat. Resolves `false` if the context cannot start. |
| `install(target?, { unlockEvents, onMuteChange })` | Wire first-gesture unlock and the mute key. Ignores `event.repeat`, modified keys and key presses inside form fields. Returns a remover. |
| `setMuted` / `toggleMute` / `muted` | Master mute with a short fade. A mute set before `unlock()` is honoured. |
| `setMusicLevel(level, timeConstant)` | Music bus level with a smooth transition. |
| `duck(amount, ms)` | Dip the music bus, then recover to the remembered level. |
| `voice({ at, dur, freq, ... })` | Schedule one oscillator voice at an absolute time (sequencers use it). |
| `dispose()` | Remove listeners and close the context through the manager. |

Options: `cues`, `manager` or `context` (inject for tests/offline), `masterGain`, `sfxGain`, `musicGain`, `maxVoices` (default 24), `noiseSeed`, `now`.

## Music and beds

- `createStepSequencer(bank, { bpm, stepsPerBeat, step })` is a lookahead scheduler on the music bus: your `step(index, at, stepSeconds, voice)` callback schedules notes at sample-accurate times. `start()`, `stop()`, `setBpm()`.
- `createToneLoop(bank, { voices, noise, filter })` is a continuous, parameter-driven bed (engine drone, wind, pad). `set({ pitch, cutoff, gain, noiseGain })` moves it smoothly each frame.

## Notes

`midiToHz`, `semitoneHz`, `noteFrom(baseHz)`, `SCALES` (major, minor, pentatonic, minorPentatonic), `scaleSemitones(scale, degree)` (wraps by octaves, both directions) and `createNoiseSource(seed)`.

## Relation to `createGameSoundEngine`

`createGameSoundEngine` plays authored audio assets with spatial voices, a reverb send and mastering. This kit is for games that generate their sounds in code; both share the same `AudioContextManager`.

## Migrated example

`examples/splat-rush-port/audio.ts` is built on this kit: the cue table, a 132 BPM step sequencer and `setMusicLevel` replace about 190 lines of hand-rolled Web Audio.
