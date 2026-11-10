/**
 * Ion Circuit sound, synthesised in code on the shared cue bank (no samples, no original audio): the strike layer's cues,
 * the race cues (countdown, GO, checkpoint, lap, boost pad, pickup, crash, DNF), a 138 BPM cyber-electro step sequencer
 * on the music bus, and a speed-pitched engine (HP-16). The context is created only from a user gesture (`install`
 * listens for the first one) so autoplay policies and headless runs stay quiet; M or the HUD button toggles mute.
 *
 * The engine is deliberately not a fixed low drone (a 55 Hz sine bed at constant level read as a "permanent buzz" in
 * earlier games): two detuned saws through a low-pass, pitched 70 to 210 Hz with speed, at a low level that follows
 * throttle and speed and falls silent when the drone stops, crashes, the race ends or the game pauses.
 */
import { AudioContextManager, createCueBank, createStepSequencer, midiToHz, type CueSpec } from "@aura3d/engine/audio";
import type { Race } from "./race";

export const CUES = {
  fire: { cooldownMs: 55, maxConcurrent: 4, layers: [{ freq: 1040, slideTo: 380, type: "square" as const, dur: 0.07, gain: 0.05, attack: 0.002 }, { kind: "noise" as const, type: "highpass" as const, freq: 3200, dur: 0.04, gain: 0.05 }] },
  hit: { cooldownMs: 40, layers: [{ freq: 220, slideTo: 140, type: "sawtooth" as const, dur: 0.09, gain: 0.1, attack: 0.002 }, { kind: "noise" as const, type: "bandpass" as const, freq: 1800, q: 2, dur: 0.07, gain: 0.12 }] },
  kill: {
    priority: 2,
    layers: ({ level }) => [
      { freq: 160, slideTo: 55, type: "sawtooth" as const, dur: 0.34, gain: 0.2, attack: 0.003 },
      { kind: "noise" as const, type: "lowpass" as const, freq: 900, slideTo: 200, dur: 0.38, gain: 0.35 },
      { freq: 660 * Math.pow(2, Math.min(8, Math.max(0, level - 1)) / 12), type: "triangle" as const, dur: 0.22, gain: 0.12, attack: 0.01, delay: 0.05 }
    ]
  },
  barrel: { priority: 3, layers: [{ freq: 90, slideTo: 36, type: "sine" as const, dur: 0.6, gain: 0.45, attack: 0.002 }, { kind: "noise" as const, type: "lowpass" as const, freq: 600, slideTo: 120, dur: 0.7, gain: 0.5 }] },
  overheat: { cooldownMs: 400, layers: [{ freq: 300, slideTo: 90, type: "square" as const, dur: 0.25, gain: 0.07 }] },
  medal: { priority: 3, layers: [523, 659, 784, 1046].map((freq, i) => ({ freq, type: "triangle" as const, dur: 0.35, gain: 0.16, attack: 0.01, delay: i * 0.11 })) },
  count: { layers: [{ freq: 440, type: "triangle" as const, dur: 0.16, gain: 0.12, attack: 0.005 }] },
  go: { priority: 2, layers: [{ freq: 880, type: "triangle" as const, dur: 0.38, gain: 0.14, attack: 0.005 }, { freq: 1320, type: "sine" as const, dur: 0.3, gain: 0.05, attack: 0.01 }] },
  checkpoint: { cooldownMs: 200, layers: [{ freq: 740, slideTo: 990, type: "triangle" as const, dur: 0.18, gain: 0.08, attack: 0.005 }] },
  lap: { priority: 2, layers: [659, 880].map((freq, i) => ({ freq, type: "triangle" as const, dur: 0.24, gain: 0.12, attack: 0.008, delay: i * 0.12 })) },
  boostPad: { cooldownMs: 250, layers: [{ kind: "noise" as const, type: "bandpass" as const, freq: 900, slideTo: 2600, q: 1.2, dur: 0.32, gain: 0.12 }] },
  pickup: { cooldownMs: 150, layers: [{ freq: 988, slideTo: 1480, type: "sine" as const, dur: 0.16, gain: 0.1, attack: 0.004 }] },
  crash: { priority: 3, layers: [{ freq: 120, slideTo: 40, type: "sawtooth" as const, dur: 0.45, gain: 0.22, attack: 0.002 }, { kind: "noise" as const, type: "lowpass" as const, freq: 1400, slideTo: 160, dur: 0.5, gain: 0.4 }] },
  dnf: { priority: 3, layers: [392, 311, 233].map((freq, i) => ({ freq, type: "triangle" as const, dur: 0.3, gain: 0.12, attack: 0.01, delay: i * 0.16 })) }
} satisfies Record<string, CueSpec>;

/** engine voice pitch (Hz) and level for a speed in 0..1 and a throttle in 0..1; pure, for tests and the live voice */
export function engineVoice(speed01: number, throttle: number, active: boolean): { freq: number; gain: number; cutoff: number } {
  const s = Math.max(0, Math.min(1, speed01));
  const t = Math.max(0, Math.min(1, throttle));
  const gain = active ? (s < 0.02 && t === 0 ? 0 : 0.012 + 0.03 * s + 0.012 * t) : 0;
  return { freq: 70 + 140 * s, gain, cutoff: 500 + 1700 * s };
}

export interface HeatsinkAudio {
  /**
   * play the cues for the strike and race events not yet heard and steer the engine voice; call once per rendered
   * frame. `count` is the countdown banner text; `active` is false while paused or on a menu.
   */
  update(race: Race, frame?: { count: string; throttle: number; active: boolean }): void;
  /** forget the event cursor (a new race clears the event list) */
  reset(): void;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
}

const BASS_PATTERN: readonly number[] = [38, 38, 50, 38, 41, 38, 45, 43, 38, 38, 50, 41, 43, 45, 48, 45];
const ARP_PATTERN: readonly (number | null)[] = [null, 62, 69, null, 65, null, 72, 69, null, 62, 74, null, 72, 69, 65, null];

export function createHeatsinkAudio(): HeatsinkAudio {
  const manager = new AudioContextManager();
  const bank = createCueBank({ cues: CUES, manager, masterGain: 0.7, sfxGain: 1, musicGain: 0.28, noiseSeed: 0x2f6e2b1 });
  bank.install();
  const music = createStepSequencer(bank, {
    bpm: 138,
    stepsPerBeat: 4,
    step(index, _at, stepSeconds, voice) {
      const s = index & 15;
      const bassMidi = BASS_PATTERN[s]!;
      voice({
        type: "sawtooth",
        freq: midiToHz(bassMidi),
        dur: stepSeconds * 0.82,
        gain: (s & 3) === 0 ? 0.068 : 0.048,
        attack: 0.005,
        filter: { type: "lowpass", freq: (s & 3) === 0 ? 680 : 520, q: 1.4 },
        bus: "music"
      });
      const arpMidi = ARP_PATTERN[s];
      if (arpMidi !== null && arpMidi !== undefined) {
        voice({
          type: "triangle",
          freq: midiToHz(arpMidi + ((index >> 4) & 1 ? 2 : 0)),
          dur: stepSeconds * 0.68,
          gain: 0.032,
          attack: 0.006,
          filter: { type: "lowpass", freq: 2400, q: 0.9 },
          bus: "music"
        });
      }
      if ((s & 3) === 2) {
        voice({
          type: "square",
          freq: 4600,
          dur: 0.022,
          gain: 0.012,
          attack: 0.002,
          filter: { type: "highpass", freq: 3400 },
          bus: "music"
        });
      }
    }
  });
  let seen = 0;
  let raceSeen = 0;
  let locked = false;
  let lastCount = "";
  let engine: { a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  const engineNode = () => {
    if (engine) return engine;
    const ctx = bank.context as unknown as AudioContext | null;
    const out = bank.sfxDestination;
    if (!ctx || !out || typeof ctx.createOscillator !== "function") return null;
    const a = ctx.createOscillator(), b = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    a.type = "sawtooth"; b.type = "sawtooth"; b.detune.value = 9;
    filter.type = "lowpass"; filter.Q.value = 0.7;
    gain.gain.value = 0;
    a.connect(filter); b.connect(filter); filter.connect(gain); gain.connect(out);
    a.start(); b.start();
    engine = { a, b, filter, gain };
    return engine;
  };
  return {
    update(race, frame) {
      const racing = race.events;
      if (raceSeen > racing.length) raceSeen = 0;
      for (; raceSeen < racing.length; raceSeen++) {
        const ev = racing[raceSeen]!;
        if (ev.type === "checkpoint") bank.play("checkpoint");
        else if (ev.type === "lap") { bank.play("lap"); bank.duck(0.35, 220); }
        else if (ev.type === "boostPad") bank.play("boostPad");
        else if (ev.type === "pickup") bank.play("pickup");
        else if (ev.type === "crash") { bank.play("crash"); bank.duck(0.65, 420); }
        else if (ev.type === "dnf") bank.play("dnf");
      }
      const count = frame?.count ?? "";
      if (count !== lastCount) {
        if (count === "GO") bank.play("go");
        else if (count) bank.play("count");
        lastCount = count;
      }
      const p = race.player;
      const activeRace = (frame?.active ?? true) && race.state === "race" && !p.crashed && !race.resultsOpen;
      if (bank.running && !bank.muted && activeRace) {
        music.setBpm(138 + Math.round(Math.max(0, Math.min(1, p.v01)) * 8));
        if (!music.playing) music.start();
      } else if (music.playing) {
        music.stop();
      }
      const e = bank.running ? engineNode() : null;
      if (e) {
        const v = engineVoice(p.v01, frame?.throttle ?? 0, activeRace);
        const now = (bank.context as unknown as AudioContext).currentTime;
        e.a.frequency.setTargetAtTime(v.freq, now, 0.08);
        e.b.frequency.setTargetAtTime(v.freq * 1.5, now, 0.08);
        e.filter.frequency.setTargetAtTime(v.cutoff, now, 0.1);
        e.gain.gain.setTargetAtTime(v.gain, now, 0.12);
      }
      const events = race.ops.events;
      if (seen > events.length) seen = 0;
      for (; seen < events.length; seen++) {
        const ev = events[seen]!;
        if (ev.type === "fire") bank.play("fire");
        else if (ev.type === "hit") bank.play("hit");
        else if (ev.type === "kill") { bank.play("kill", { level: race.ops.chain }); bank.duck(0.3, 180); }
        else if (ev.type === "barrel") { bank.play("barrel"); bank.duck(0.5, 320); }
        else if (ev.type === "medal" && ev.detail !== "none") bank.play("medal");
      }
      const now = race.player.gunLocked;
      if (now && !locked) bank.play("overheat");
      locked = now;
    },
    reset() { seen = 0; raceSeen = 0; locked = false; lastCount = ""; if (music.playing) music.stop(); },
    get muted() { return bank.muted; },
    setMuted(muted) { bank.setMuted(muted); if (muted && music.playing) music.stop(); }
  };
}
