import { describe, expect, it, vi } from "vitest";
import { MODEL_INFO, type ModelInfo, type ModelKey } from "../../../src/aura-assets.js";
import {
  CHARACTERS,
  CHARACTER_DEFINITIONS,
  CHARACTER_IDS,
  GESTURES,
  MissingClipError,
  SHARED_GESTURES,
  assertClip,
  clipCoverage,
  createCharacterProfile,
  isCharacterId,
  isGesture,
  missingClipCandidates,
  permittedClips,
  profileForSpeaker
} from "../../../src/characters/character-registry.js";
import {
  CALM_GESTURES,
  GESTURE_CLIP_SECONDS,
  calmGesture,
  createAnimationDirector,
  planGesture,
  propAnimationProfile
} from "../../../src/runtime/animation-director.js";
import { createAssetPreloader, isUsableStatus, storyModelKeys, type FetchLike } from "../../../src/runtime/asset-preloader.js";
import { isNeutral, sampleGestureMotion, type GestureMotionSpec, type PoseOffset } from "../../../src/scenes/motion.js";
import type { CharacterId, Gesture } from "../../../src/types.js";
import { strings as UI_STRINGS } from "../../../src/localization/en/ui.js";
import type { EpisodeSpec } from "../../../src/types.js";

const MOMO_CLIPS = ["idle", "walk", "run", "wave", "talk", "happyJump", "cheer", "sway", "mirror", "pickUp", "lookAround", "sleep", "drink", "wakeUp", "jazzHands", "shrug"];
const LULU_CLIPS = ["idle", "walk", "run", "dance", "hop", "cheer", "wave", "talk", "sway", "jazzHands", "happyJump", "funnyDance"];

const info = (clips: readonly string[], admitted = true, heightM = 0.9): ModelInfo => ({ admitted, rigged: clips.length > 0, clips, heightM, procedural: false });

describe("character registry", () => {
  it("registers the six friends with their model keys, voices and name keys", () => {
    expect(CHARACTER_IDS).toEqual(["momo", "lulu", "sheru", "gogo", "lumi", "peeko"]);
    for (const id of CHARACTER_IDS) {
      const profile = CHARACTERS[id];
      expect(profile.id).toBe(id);
      expect(profile.modelKey).toBe(id);
      // The name key resolves in the English UI strings (the caption speaker names).
      expect(profile.displayNameKey).toBe(`ui.speaker.${id}`);
      expect(UI_STRINGS[profile.displayNameKey], profile.displayNameKey).toMatch(/\S/);
      expect(profile.voice).toBe(id);
      expect(profile.heightM).toBe(MODEL_INFO[profile.modelKey].heightM);
      expect(profile.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(isCharacterId("peeko")).toBe(true);
    expect(isCharacterId("pip")).toBe(false);
    expect(isCharacterId("narrator")).toBe(false);
  });

  it("Sheru only barks; everyone else speaks", () => {
    expect(CHARACTERS.sheru.speaks).toBe(false);
    for (const id of ["momo", "lulu", "gogo", "lumi", "peeko"] as const) expect(CHARACTERS[id].speaks).toBe(true);
  });

  it("maps speakers to on-screen characters (narrator and robot have none)", () => {
    expect(profileForSpeaker("momo")?.id).toBe("momo");
    expect(profileForSpeaker("narrator")).toBeNull();
    expect(profileForSpeaker("robot")).toBeNull();
  });

  it("plays a clip only when MODEL_INFO lists it for the admitted GLB (Momo)", () => {
    const momo = createCharacterProfile(CHARACTER_DEFINITIONS.momo, info(MOMO_CLIPS));
    expect(momo.rigged).toBe(true);
    expect(permittedClips(momo)).toEqual(MOMO_CLIPS);
    expect(momo.gestureClip("wave")).toBe("wave");
    expect(momo.gestureClip("happy")).toBe("happyJump");
    expect(momo.gestureClip("look")).toBe("lookAround");
    expect(momo.gestureClip("eat")).toBe("drink");
    expect(momo.gestureClip("wake")).toBe("wakeUp");
    expect(momo.gestureClip("dance")).toBe("jazzHands");
    expect(momo.gestureClip("point")).toBeNull();
    expect(momo.locomotionClip("walk")).toBe("walk");
    expect(momo.locomotionClip("run")).toBe("run");
    expect(momo.idleClip()).toBe("idle");
    expect(momo.talkClip()).toBe("talk");
    for (const { clip } of clipCoverage(momo)) if (clip !== null) expect(MOMO_CLIPS).toContain(clip);
  });

  it("plays Lulu's merged clips and falls back for the rest", () => {
    const lulu = createCharacterProfile(CHARACTER_DEFINITIONS.lulu, info(LULU_CLIPS, true, 1));
    expect(lulu.gestureClip("dance")).toBe("dance");
    expect(lulu.gestureClip("hop")).toBe("hop");
    expect(lulu.gestureClip("clap")).toBe("jazzHands");
    expect(lulu.gestureClip("stomp")).toBe("walk");
    expect(lulu.gestureClip("freeze")).toBe("idle");
    expect(lulu.gestureClip("sleep")).toBeNull();
    expect(lulu.locomotionClip("hop")).toBe("hop");
  });

  it("falls back to procedural motion for every clip that is missing at runtime", () => {
    const partial = createCharacterProfile(CHARACTER_DEFINITIONS.momo, info(["idle", "walk"]));
    expect(partial.gestureClip("wave")).toBeNull();
    expect(partial.gestureClip("cheer")).toBeNull();
    expect(partial.procedural("wave").layers.length).toBeGreaterThan(0);
    expect(missingClipCandidates(CHARACTER_DEFINITIONS.momo, info(["idle", "walk"]))).toEqual(expect.arrayContaining(["wave", "talk", "happyJump", "lookAround"]));
    expect(() => assertClip(partial, "wave")).toThrow(MissingClipError);
    expect(assertClip(partial, "idle")).toBe("idle");
  });

  it("never plays clips for a model that is not admitted (even if clip names are listed)", () => {
    const notAdmitted = createCharacterProfile(CHARACTER_DEFINITIONS.momo, info(MOMO_CLIPS, false));
    expect(notAdmitted.rigged).toBe(false);
    expect(notAdmitted.clips).toEqual([]);
    for (const gesture of GESTURES) expect(notAdmitted.gestureClip(gesture)).toBeNull();
    expect(notAdmitted.idleClip()).toBeNull();
  });

  it("Sheru, GoGo, Lumi and Peeko are procedural only", () => {
    for (const id of ["sheru", "gogo", "lumi", "peeko"] as const) {
      const profile = createCharacterProfile(CHARACTER_DEFINITIONS[id], info(["idle", "walk", "wave"]));
      for (const gesture of GESTURES) {
        if (gesture === "idle") continue;
        expect(profile.gestureClip(gesture), `${id} ${gesture}`).toBeNull();
      }
    }
  });

  it("has a procedural motion for every gesture of every character, and the glow halo never flashes", () => {
    for (const id of CHARACTER_IDS) {
      const profile = CHARACTERS[id];
      for (const gesture of GESTURES) {
        const spec = profile.procedural(gesture);
        expect(spec.durationSec, `${id} ${gesture}`).toBeGreaterThan(0);
        for (const layer of spec.layers) expect(layer.durationSec).toBeGreaterThanOrEqual(0.3);
      }
      expect(profile.procedural("glow").halo).toBe(true);
      expect(profile.procedural("hide").hold).toBe(true);
      expect(profile.procedural("freeze").still).toBe(true);
    }
    expect(Object.keys(SHARED_GESTURES).sort()).toEqual([...GESTURES].sort());
  });

  it("the current generated MODEL_INFO never names a clip a profile cannot find", () => {
    for (const id of CHARACTER_IDS) {
      const profile = CHARACTERS[id];
      for (const { clip } of clipCoverage(profile)) {
        if (clip !== null) expect(MODEL_INFO[profile.modelKey].clips).toContain(clip);
      }
    }
  });

  it("recognises gesture ids (song motions are plain strings)", () => {
    for (const gesture of GESTURES) expect(isGesture(gesture)).toBe(true);
    expect(isGesture("jump")).toBe(false);
    expect(isGesture("")).toBe(false);
  });
});

describe("surprise and wait (07 B20)", () => {
  const samples = (spec: GestureMotionSpec, steps = 60): PoseOffset[] =>
    Array.from({ length: steps + 1 }, (_, i) => sampleGestureMotion(spec, (i / steps) * spec.durationSec, false));
  const kinds = (id: CharacterId, gesture: Gesture): string[] => CHARACTERS[id].procedural(gesture).layers.map((layer) => layer.kind);
  const highest = (id: CharacterId, gesture: Gesture): number => Math.max(...samples(CHARACTERS[id].procedural(gesture)).map((p) => p.dy));

  it("every character has a calm surprise that ends where it began, and a wait that holds", () => {
    for (const id of CHARACTER_IDS) {
      const surprise = CHARACTERS[id].procedural("surprise");
      const wait = CHARACTERS[id].procedural("wait");
      expect(surprise.hold ?? false, `${id} surprise`).toBe(false);
      expect(surprise.halo ?? false, `${id} surprise`).toBe(false);
      expect(wait.hold, `${id} wait`).toBe(true);
      // Attentive, not frozen: idle breathing goes on while it waits.
      expect(wait.still ?? false, `${id} wait`).toBe(false);
      for (const spec of [surprise, wait]) {
        expect(spec.durationSec).toBeGreaterThanOrEqual(0.6);
        expect(spec.durationSec).toBeLessThanOrEqual(1.2);
        // Calm caps: never a startle (02 section 1).
        for (const p of samples(spec)) {
          for (const v of [p.dx, p.dy, p.dz]) expect(Math.abs(v), id).toBeLessThanOrEqual(0.1);
          for (const v of [p.rx, p.ry, p.rz]) expect(Math.abs(v), id).toBeLessThanOrEqual(0.2);
          for (const v of [p.sx, p.sy, p.sz]) {
            expect(v, id).toBeGreaterThanOrEqual(0.85);
            expect(v, id).toBeLessThanOrEqual(1.15);
          }
        }
      }
      expect(isNeutral(sampleGestureMotion(surprise, surprise.durationSec, false), 1e-6), `${id} surprise ends neutral`).toBe(true);
      expect(isNeutral(sampleGestureMotion(wait, wait.durationSec + 5, false)), `${id} wait holds its pose`).toBe(false);
    }
    expect(GESTURE_CLIP_SECONDS.surprise).toBeGreaterThan(0);
    expect(GESTURE_CLIP_SECONDS.wait).toBeGreaterThan(0);
  });

  it("fits each character: Lumi floats up, GoGo never hops or stretches, Sheru tilts and sits, Peeko flutters, Momo leans in", () => {
    // Lumi floats: no hop off the ground, she rises.
    expect(kinds("lumi", "surprise")).not.toContain("hop");
    expect(highest("lumi", "surprise")).toBeGreaterThan(0.05);
    // GoGo is a vehicle: no hop, stretch or squash in either.
    for (const gesture of ["surprise", "wait"] as const) {
      for (const kind of kinds("gogo", gesture)) expect(["hop", "stretch", "squash"], `gogo ${gesture}`).not.toContain(kind);
    }
    // Sheru is a dog: a puppy head tilt when surprised, and he waits sitting (lower, leaning back).
    expect(kinds("sheru", "surprise")).toContain("tilt");
    const sheruWaits = sampleGestureMotion(CHARACTERS.sheru.procedural("wait"), 5, false);
    expect(sheruWaits.sy).toBeLessThan(1);
    expect(sheruWaits.rx).toBeLessThan(0);
    // Peeko flutters its wings.
    expect(kinds("peeko", "surprise")).toContain("flap");
    // Momo leans in toward the child with a curious tilt, and leans back a little when surprised.
    const momoWaits = sampleGestureMotion(CHARACTERS.momo.procedural("wait"), 5, false);
    expect(momoWaits.rx).toBeGreaterThan(0);
    expect(Math.abs(momoWaits.rz)).toBeGreaterThan(0.03);
    expect(Math.min(...samples(CHARACTERS.momo.procedural("surprise")).map((p) => p.rx))).toBeLessThan(0);
    // The others keep the shared motion.
    expect(CHARACTERS.lulu.procedural("surprise")).toBe(SHARED_GESTURES.surprise);
    expect(CHARACTERS.lumi.procedural("wait")).toBe(SHARED_GESTURES.wait);
  });

  it("plays through the director: surprise returns to idle, wait holds until the next gesture", () => {
    const director = createAnimationDirector();
    director.register({ id: "sheru", profile: CHARACTERS.sheru, canPlayClips: false });
    director.gesture("sheru", "surprise", false);
    director.update(0.4);
    expect(director.snapshot("sheru")?.gesture).toBe("surprise");
    expect(Math.abs(director.pose("sheru").rz)).toBeGreaterThan(0.05);
    director.update(1);
    expect(director.snapshot("sheru")).toMatchObject({ gesture: null, holding: false });
    director.gesture("sheru", "wait", false);
    director.update(3);
    expect(director.snapshot("sheru")).toMatchObject({ gesture: null, holding: true });
    expect(director.pose("sheru").sy).toBeLessThan(0.95);
    director.gesture("sheru", "wag", false);
    expect(director.snapshot("sheru")?.holding).toBe(false);
  });
});

describe("calm variants and reduced motion", () => {
  it("song motions in reduced motion never hop or spin, for any character", () => {
    for (const id of CHARACTER_IDS) {
      for (const gesture of Object.keys(CALM_GESTURES)) {
        if (!isGesture(gesture)) throw new Error(gesture);
        const calm = calmGesture(gesture);
        expect(calm).not.toBe(gesture);
        for (const layer of CHARACTERS[id].procedural(calm).layers) expect(["hop", "spin"], `${id} ${gesture} -> ${calm}`).not.toContain(layer.kind);
      }
    }
  });

  it("drops a spin in reduced motion: Lumi never turns her back and never snaps round", () => {
    const full = createAnimationDirector();
    const reduced = createAnimationDirector({ reducedMotion: true });
    for (const director of [full, reduced]) {
      director.register({ id: "lumi", profile: CHARACTERS.lumi, canPlayClips: false });
      director.gesture("lumi", "happy", false);
    }
    let fullest = 0;
    let previous = 0;
    for (let i = 0; i < 40; i += 1) {
      full.update(0.05);
      reduced.update(0.05);
      fullest = Math.max(fullest, Math.abs(full.pose("lumi").ry));
      const ry = reduced.pose("lumi").ry;
      expect(Math.abs(ry)).toBeLessThan(1e-9);
      expect(Math.abs(ry - previous)).toBeLessThan(0.2);
      previous = ry;
    }
    // Full motion still spins the whole turn.
    expect(fullest).toBeGreaterThan(Math.PI);
    // The semantic action stays: she still floats in reduced motion.
    reduced.gesture("lumi", "happy", false);
    reduced.update(0.3);
    expect(Math.abs(reduced.pose("lumi").dy)).toBeGreaterThan(0.005);
  });
});

describe("animation director", () => {
  const rigged = createCharacterProfile(CHARACTER_DEFINITIONS.momo, info(MOMO_CLIPS));

  it("plans a clip when the rigged model lists it and procedural motion otherwise", () => {
    expect(planGesture(rigged, "wave", true).clip).toBe("wave");
    expect(planGesture(rigged, "wave", true).motion).toBeNull();
    expect(planGesture(rigged, "wave", false).clip).toBeNull();
    expect(planGesture(rigged, "wave", false).motion).not.toBeNull();
    expect(planGesture(rigged, "point", true).clip).toBeNull();
    expect(planGesture(rigged, "idle", true).clip).toBe("idle");
  });

  it("returns a rigged actor to idle when a gesture's time is over", () => {
    const director = createAnimationDirector();
    director.register({ id: "momo", profile: rigged, canPlayClips: true, initialClip: "idle" });
    expect(director.drainClipCommands()).toEqual([]);
    director.gesture("momo", "wave", false);
    expect(director.drainClipCommands()).toEqual([{ actor: "momo", clip: "wave", loop: true }]);
    director.update(GESTURE_CLIP_SECONDS.wave - 0.05);
    expect(director.drainClipCommands()).toEqual([]);
    director.update(0.1);
    expect(director.drainClipCommands()).toEqual([{ actor: "momo", clip: "idle", loop: true }]);
    expect(director.snapshot("momo")?.gesture).toBeNull();
  });

  it("travel clips win over gestures, and the talk clip plays only while idle", () => {
    const director = createAnimationDirector();
    director.register({ id: "momo", profile: rigged, canPlayClips: true, initialClip: "idle" });
    director.setTalking("momo");
    expect(director.drainClipCommands()).toEqual([{ actor: "momo", clip: "talk", loop: true }]);
    director.setLocomotion("momo", "walk");
    expect(director.drainClipCommands()).toEqual([{ actor: "momo", clip: "walk", loop: true }]);
    director.setLocomotion("momo", null);
    expect(director.drainClipCommands()).toEqual([{ actor: "momo", clip: "talk", loop: true }]);
    director.setTalking(null);
    expect(director.drainClipCommands()).toEqual([{ actor: "momo", clip: "idle", loop: true }]);
  });

  it("stand-ins and unrigged models get procedural motion and no clip commands", () => {
    const director = createAnimationDirector();
    director.register({ id: "momo", profile: rigged, canPlayClips: false });
    director.gesture("momo", "happy", false);
    director.update(0.3);
    expect(director.drainClipCommands()).toEqual([]);
    expect(isNeutral(director.pose("momo"))).toBe(false);
  });

  it("holds hide until the next gesture, and freeze stops idle breathing", () => {
    const director = createAnimationDirector();
    director.register({ id: "peeko", profile: CHARACTERS.peeko, canPlayClips: false });
    director.gesture("peeko", "hide", false);
    director.update(5);
    expect(director.snapshot("peeko")?.holding).toBe(true);
    expect(director.pose("peeko").sy).toBeLessThan(0.6);
    director.gesture("peeko", "idle", false);
    director.update(0.01);
    expect(director.pose("peeko").sy).toBeGreaterThan(0.95);
    director.gesture("peeko", "freeze", true);
    expect(isNeutral(director.pose("peeko"))).toBe(true);
  });

  it("pulses the speaking actor gently (never lip sync) and only while its line plays", () => {
    const director = createAnimationDirector({ reducedMotion: true });
    director.register({ id: "lumi", profile: CHARACTERS.lumi, canPlayClips: false });
    expect(isNeutral(director.pose("lumi"))).toBe(true);
    director.setTalking("lumi");
    director.update(0.2);
    const talking = director.pose("lumi");
    expect(talking.sy).toBeGreaterThan(1);
    expect(talking.sy).toBeLessThan(1 + CHARACTERS.lumi.talkStrength);
    director.setTalking(null);
    expect(isNeutral(director.pose("lumi"))).toBe(true);
  });

  it("reduced motion halves gesture amplitude and drops idle loops", () => {
    const full = createAnimationDirector();
    const reduced = createAnimationDirector({ reducedMotion: true });
    for (const director of [full, reduced]) {
      director.register({ id: "lulu", profile: CHARACTERS.lulu, canPlayClips: false });
      director.gesture("lulu", "cheer", false);
      director.update(0.4);
    }
    expect(reduced.pose("lulu").dy).toBeCloseTo(full.pose("lulu").dy / 2, 2);
    const idleFull = createAnimationDirector();
    const idleReduced = createAnimationDirector({ reducedMotion: true });
    idleFull.register({ id: "lumi", profile: CHARACTERS.lumi, canPlayClips: false });
    idleReduced.register({ id: "lumi", profile: CHARACTERS.lumi, canPlayClips: false });
    idleFull.update(0.7);
    idleReduced.update(0.7);
    expect(isNeutral(idleFull.pose("lumi"))).toBe(false);
    expect(isNeutral(idleReduced.pose("lumi"))).toBe(true);
  });

  it("glow shows a soft halo that rises and falls (steady in reduced motion)", () => {
    const director = createAnimationDirector();
    director.register({ id: "lumi", profile: CHARACTERS.lumi, canPlayClips: false });
    director.gesture("lumi", "glow", false);
    const samples: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      director.update(0.1);
      samples.push(director.halo("lumi"));
    }
    expect(Math.max(...samples)).toBeGreaterThan(0.9);
    // Slow: neighbouring samples 0.1 s apart never jump by more than a third (no flashing).
    for (let i = 1; i < samples.length; i += 1) expect(Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0))).toBeLessThan(0.34);
    const steady = createAnimationDirector({ reducedMotion: true });
    steady.register({ id: "lumi", profile: CHARACTERS.lumi, canPlayClips: false });
    steady.gesture("lumi", "glow", false);
    // Reduced motion: a soft fade in, then a steady glow (no breathing).
    steady.update(0.1);
    expect(steady.halo("lumi")).toBeGreaterThan(0);
    expect(steady.halo("lumi")).toBeLessThan(0.3);
    steady.update(0.5);
    expect(steady.halo("lumi")).toBeCloseTo(0.8, 6);
    steady.update(0.3);
    expect(steady.halo("lumi")).toBeCloseTo(0.8, 6);
    // A looping glow fades in too, then breathes slowly.
    const looping = createAnimationDirector();
    looping.register({ id: "lumi", profile: CHARACTERS.lumi, canPlayClips: false });
    looping.gesture("lumi", "glow", true);
    const loopSamples: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      looping.update(0.05);
      loopSamples.push(looping.halo("lumi"));
    }
    expect(loopSamples[0] ?? 1).toBeLessThan(0.15);
    for (let i = 1; i < loopSamples.length; i += 1) expect(Math.abs((loopSamples[i] ?? 0) - (loopSamples[i - 1] ?? 0))).toBeLessThan(0.1);
  });

  it("is deterministic: the same events give the same poses", () => {
    const run = () => {
      const director = createAnimationDirector();
      director.register({ id: "sheru", profile: CHARACTERS.sheru, canPlayClips: false });
      director.register({ id: "ball", profile: propAnimationProfile("none"), canPlayClips: false });
      director.gesture("sheru", "wag", true);
      director.gesture("ball", "hop", false);
      const poses = [];
      for (let i = 0; i < 20; i += 1) {
        director.update(1 / 30);
        poses.push(director.pose("sheru"), director.pose("ball"));
      }
      return poses;
    };
    expect(run()).toEqual(run());
  });

  it("ignores unknown ids", () => {
    const director = createAnimationDirector();
    expect(director.gesture("nobody", "wave", false)).toBeNull();
    expect(isNeutral(director.pose("nobody"))).toBe(true);
    expect(director.halo("nobody")).toBe(0);
  });
});

describe("asset preloader", () => {
  const source = (key: ModelKey) => (key === "teddy" || key === "momo" || key === "tree" ? { url: `/models/${key}`, sha256: `sha256-${key}hash` } : undefined);
  const okResponse = { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) };

  it("never fetches models drawn from scene geometry by design", async () => {
    let fetches = 0;
    const fetch: FetchLike = async () => { fetches += 1; return okResponse; };
    const preloader = createAssetPreloader({ fetch, source, digest: null, enabled: true });
    const result = await preloader.preload(["ball", "cloud"]);
    expect(fetches).toBe(0);
    expect(result.status.get("ball")).toBe("procedural");
    expect(result.available.has("ball")).toBe(false);
  });

  it("resolves not-admitted keys at once without fetching", async () => {
    let fetches = 0;
    const fetch: FetchLike = async () => { fetches += 1; return okResponse; };
    const preloader = createAssetPreloader({ fetch, source: () => undefined, digest: null, enabled: true });
    const result = await preloader.preload(["momo", "teddy"]);
    expect(fetches).toBe(0);
    expect(result.status.get("momo")).toBe("not-admitted");
    expect(result.available.size).toBe(0);
  });

  it("times out a model that never arrives instead of deadlocking (then it is a stand-in)", async () => {
    const timers: Array<() => void> = [];
    const fetch: FetchLike = () => new Promise(() => undefined);
    const preloader = createAssetPreloader({
      fetch,
      source,
      digest: null,
      enabled: true,
      schedule: (callback) => {
        timers.push(callback);
        return () => undefined;
      }
    });
    const pending = preloader.preload(["teddy"]);
    expect(preloader.status("teddy")).toBe("pending");
    for (const fire of timers) fire();
    const result = await pending;
    expect(result.status.get("teddy")).toBe("timeout");
    expect(preloader.isAvailable("teddy")).toBe(false);
  });

  it("retries a timed-out model on the next preload", async () => {
    let calls = 0;
    const timers: Array<() => void> = [];
    const fetch: FetchLike = () => {
      calls += 1;
      return calls === 1 ? new Promise(() => undefined) : Promise.resolve(okResponse);
    };
    const preloader = createAssetPreloader({ fetch, source, digest: null, enabled: true, schedule: (cb) => { timers.push(cb); return () => undefined; } });
    const first = preloader.preload(["teddy"]);
    timers.splice(0).forEach((fire) => fire());
    expect((await first).status.get("teddy")).toBe("timeout");
    const second = await preloader.preload(["teddy"]);
    expect(second.status.get("teddy")).toBe("unverified");
    expect(calls).toBe(2);
  });

  it("keeps downloading a model whose wait timed out and uses it from the next preload", async () => {
    let calls = 0;
    let arrive: (response: typeof okResponse) => void = () => undefined;
    const timers: Array<{ fire: () => void; ms: number }> = [];
    const fetch: FetchLike = () => {
      calls += 1;
      return new Promise((resolve) => { arrive = resolve; });
    };
    const preloader = createAssetPreloader({
      fetch,
      source,
      digest: null,
      enabled: true,
      timeoutMs: 10_000,
      maxMs: 120_000,
      schedule: (fire, ms) => { timers.push({ fire, ms }); return () => undefined; }
    });
    const first = preloader.preload(["teddy"]);
    // Only the preload's 10 s wait runs out; the 120 s download cap does not.
    for (const timer of timers.filter((t) => t.ms === 10_000)) timer.fire();
    const firstResult = await first;
    expect(firstResult.status.get("teddy")).toBe("timeout");
    expect(firstResult.available.has("teddy")).toBe(false);
    expect(preloader.status("teddy")).toBe("pending");
    expect(preloader.summary()).toEqual({ pending: 1 });
    arrive(okResponse);
    await vi.waitFor(() => expect(preloader.isAvailable("teddy")).toBe(true));
    const second = await preloader.preload(["teddy"]);
    expect(second.status.get("teddy")).toBe("unverified");
    expect(second.available.has("teddy")).toBe(true);
    expect(calls).toBe(1);
    expect(preloader.summary()).toEqual({ unverified: 1 });
  });

  it("aborts a download at its cap and fetches it again on the next preload", async () => {
    let calls = 0;
    const signals: AbortSignal[] = [];
    const timers: Array<{ fire: () => void; ms: number }> = [];
    const fetch: FetchLike = (_url, init) => {
      calls += 1;
      if (init?.signal) signals.push(init.signal);
      return calls === 1 ? new Promise(() => undefined) : Promise.resolve(okResponse);
    };
    const preloader = createAssetPreloader({ fetch, source, digest: null, enabled: true, schedule: (fire, ms) => { timers.push({ fire, ms }); return () => undefined; } });
    const first = preloader.preload(["teddy"]);
    timers.splice(0).forEach((timer) => timer.fire());
    expect((await first).status.get("teddy")).toBe("timeout");
    expect(signals[0]?.aborted).toBe(true);
    expect(preloader.status("teddy")).toBe("timeout");
    expect((await preloader.preload(["teddy"])).status.get("teddy")).toBe("unverified");
    expect(calls).toBe(2);
  });

  it("checks sha256: a match is ready, a mismatch is a stand-in", async () => {
    const fetch: FetchLike = async () => okResponse;
    const good = createAssetPreloader({ fetch, source, enabled: true, digest: async () => "teddyhash" });
    expect((await good.preload(["teddy"])).status.get("teddy")).toBe("ready");
    const bad = createAssetPreloader({ fetch, source, enabled: true, digest: async () => "0000" });
    const result = await bad.preload(["teddy"]);
    expect(result.status.get("teddy")).toBe("hash-mismatch");
    expect(result.available.has("teddy")).toBe(false);
  });

  it("treats 404 as missing and ?models=0 as disabled", async () => {
    const notFound: FetchLike = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    expect((await createAssetPreloader({ fetch: notFound, source, digest: null, enabled: true }).preload(["tree"])).status.get("tree")).toBe("missing");
    expect((await createAssetPreloader({ fetch: notFound, source, digest: null, enabled: false }).preload(["tree"])).status.get("tree")).toBe("disabled");
  });

  it("markFailed keeps a model that broke a mount as a stand-in for the session", async () => {
    const preloader = createAssetPreloader({ fetch: async () => okResponse, source, digest: null, enabled: true });
    await preloader.preload(["momo"]);
    expect(preloader.isAvailable("momo")).toBe(true);
    preloader.markFailed(["momo"]);
    expect(preloader.isAvailable("momo")).toBe(false);
    expect((await preloader.preload(["momo"])).status.get("momo")).toBe("failed");
    expect(isUsableStatus("failed")).toBe(false);
  });

  it("lists a story's cast, props (not the procedural bubble) and world dressing once each", () => {
    const story: EpisodeSpec = {
      kind: "episode",
      id: "probe",
      version: 1,
      phase: "P1",
      number: 17,
      host: "sheru",
      titleKey: "e17.title",
      world: "meadow",
      cast: [{ id: "momo", at: "left" }, { id: "sheru", at: "center" }],
      props: [
        { id: "ball", asset: "ball", at: "right" },
        { id: "bubble-1", asset: "bubble", at: "high" },
        { id: "tree-near", asset: "tree", at: "farRight" }
      ],
      targetWords: ["ball"],
      supportWords: [],
      offlinePlayKey: "e17.offline",
      caregiverBridgeKey: "e17.bridge",
      review: { language: "approved", rights: "approved", reviewer: "test", date: "2026-10-29" },
      beats: [],
      estimatedDurationSec: 150
    };
    const keys = storyModelKeys(story);
    expect(keys.slice(0, 3)).toEqual(["momo", "sheru", "ball"]);
    expect(keys).toContain("tree");
    expect(keys).toContain("bush");
    expect(keys).not.toContain("bubble" as ModelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
