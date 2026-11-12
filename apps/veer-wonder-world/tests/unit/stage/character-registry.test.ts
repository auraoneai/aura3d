import { describe, expect, it } from "vitest";
import { MODEL_INFO } from "../../../src/aura-assets.js";
import {
  CHARACTERS,
  CHARACTER_DEFINITIONS,
  CHARACTER_IDS,
  GESTURES,
  SHARED_GESTURES,
  createCharacterProfile,
  isCharacterId,
  isGesture,
  profileForSpeaker,
  type CharacterProfile
} from "../../../src/characters/character-registry.js";
import {
  CALM_GESTURES,
  GESTURE_CLIP_SECONDS,
  calmGesture,
  createAnimationDirector,
  planGesture,
  propAnimationProfile
} from "../../../src/runtime/animation-director.js";
import { isNeutral, sampleGestureMotion, type GestureMotionSpec, type PoseOffset } from "../../../src/scenes/motion.js";
import { strings as UI_STRINGS } from "../../../src/localization/en/ui.js";
import type { CharacterId, Gesture, MoveStyle } from "../../../src/types.js";

function mockRiggedProfile(): CharacterProfile {
  const base = CHARACTERS.momo;
  const clipMap: Partial<Record<Gesture, string>> = {
    idle: "idle",
    wave: "wave",
    happy: "happyJump",
    cheer: "cheer",
    dance: "jazzHands"
  };
  const locoMap: Partial<Record<MoveStyle, string>> = {
    walk: "walk",
    run: "run"
  };
  return {
    ...base,
    rigged: true,
    clips: ["idle", "walk", "run", "wave", "talk", "happyJump", "cheer", "jazzHands"],
    idleClip: () => "idle",
    talkClip: () => "talk",
    gestureClip: (g) => clipMap[g] ?? null,
    locomotionClip: (s) => locoMap[s] ?? null
  };
}

describe("character registry", () => {
  it("registers the six friends with procedural rigs, voices, heights and articulated sub-parts", () => {
    expect(CHARACTER_IDS).toEqual(["momo", "lulu", "sheru", "gogo", "lumi", "peeko"]);
    for (const id of CHARACTER_IDS) {
      const profile = CHARACTERS[id];
      expect(profile.id).toBe(id);
      expect(profile.modelKey).toBe(id);
      expect(profile.displayNameKey).toBe(`ui.speaker.${id}`);
      expect(UI_STRINGS[profile.displayNameKey], profile.displayNameKey).toMatch(/\S/);
      expect(profile.voice).toBe(id);
      expect(profile.heightM).toBe(MODEL_INFO[profile.modelKey].heightM);
      expect(MODEL_INFO[profile.modelKey].procedural).toBe(true);
      expect(profile.rigged).toBe(false);
      expect(profile.clips).toEqual([]);
      expect(profile.idleClip()).toBeNull();
      expect(profile.talkClip()).toBeNull();
      expect(profile.subParts).toBeDefined();
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

  it("creates procedural character profiles with zero external GLB clip dependencies", () => {
    for (const id of CHARACTER_IDS) {
      const profile = createCharacterProfile(CHARACTER_DEFINITIONS[id], MODEL_INFO[id]);
      expect(profile.rigged).toBe(false);
      expect(profile.clips).toEqual([]);
      for (const gesture of GESTURES) {
        expect(profile.gestureClip(gesture), `${id} ${gesture}`).toBeNull();
      }
      for (const style of ["walk", "run", "hop", "float", "drive"] as const) {
        expect(profile.locomotionClip(style), `${id} ${style}`).toBeNull();
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
      expect(wait.still ?? false, `${id} wait`).toBe(false);
      for (const spec of [surprise, wait]) {
        expect(spec.durationSec).toBeGreaterThanOrEqual(0.6);
        expect(spec.durationSec).toBeLessThanOrEqual(1.2);
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
    expect(kinds("lumi", "surprise")).not.toContain("hop");
    expect(highest("lumi", "surprise")).toBeGreaterThan(0.05);
    for (const gesture of ["surprise", "wait"] as const) {
      for (const kind of kinds("gogo", gesture)) expect(["hop", "stretch", "squash"], `gogo ${gesture}`).not.toContain(kind);
    }
    expect(kinds("sheru", "surprise")).toContain("tilt");
    const sheruWaits = sampleGestureMotion(CHARACTERS.sheru.procedural("wait"), 5, false);
    expect(sheruWaits.sy).toBeLessThan(1);
    expect(sheruWaits.rx).toBeLessThan(0);
    expect(kinds("peeko", "surprise")).toContain("flap");
    const momoWaits = sampleGestureMotion(CHARACTERS.momo.procedural("wait"), 5, false);
    expect(momoWaits.rx).toBeGreaterThan(0);
    expect(Math.abs(momoWaits.rz)).toBeGreaterThan(0.03);
    expect(Math.min(...samples(CHARACTERS.momo.procedural("surprise")).map((p) => p.rx))).toBeLessThan(0);
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
    expect(fullest).toBeGreaterThan(Math.PI);
    reduced.gesture("lumi", "happy", false);
    reduced.update(0.3);
    expect(Math.abs(reduced.pose("lumi").dy)).toBeGreaterThan(0.005);
  });
});

describe("animation director", () => {
  const rigged = mockRiggedProfile();

  it("plans a clip when a profile lists it and procedural motion otherwise", () => {
    expect(planGesture(rigged, "wave", true).clip).toBe("wave");
    expect(planGesture(rigged, "wave", true).motion).toBeNull();
    expect(planGesture(rigged, "wave", false).clip).toBeNull();
    expect(planGesture(rigged, "wave", false).motion).not.toBeNull();
    expect(planGesture(rigged, "point", true).clip).toBeNull();
    expect(planGesture(rigged, "idle", true).clip).toBe("idle");
  });

  it("returns a clip-capable actor to idle when a gesture's time is over", () => {
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

  it("procedural actors get procedural motion and no clip commands", () => {
    const director = createAnimationDirector();
    director.register({ id: "momo", profile: CHARACTERS.momo, canPlayClips: false });
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
    for (let i = 1; i < samples.length; i += 1) expect(Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0))).toBeLessThan(0.34);
    const steady = createAnimationDirector({ reducedMotion: true });
    steady.register({ id: "lumi", profile: CHARACTERS.lumi, canPlayClips: false });
    steady.gesture("lumi", "glow", false);
    steady.update(0.1);
    expect(steady.halo("lumi")).toBeGreaterThan(0);
    expect(steady.halo("lumi")).toBeLessThan(0.3);
    steady.update(0.5);
    expect(steady.halo("lumi")).toBeCloseTo(0.8, 6);
    steady.update(0.3);
    expect(steady.halo("lumi")).toBeCloseTo(0.8, 6);
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

describe("lip-sync, non-squished crouch gestures and coupled prop actions", () => {
  it("opens every character's and companion's jaw or beak during speech, and closes cleanly at rest", async () => {
    const { speechSubParts, propActionSubParts } = await import("../../../src/scenes/articulated-actors.js");
    for (const id of [...CHARACTER_IDS, "robot", "teddy", "cow", "sheep", "horse", "duck", "bird"]) {
      expect(speechSubParts(id, 0, 0.4, false), `${id} silent`).toBeUndefined();
      expect(speechSubParts(id, 0.01, 0.4, false), `${id} noise floor`).toBeUndefined();
      const speaking = speechSubParts(id, 0.85, 0.06, false);
      expect(speaking, `${id} speaking`).toBeDefined();
      const mouthPart = id === "peeko" || id === "duck" || id === "bird" ? speaking?.beakLower : speaking?.jaw;
      expect(mouthPart?.rotation?.[0] ?? 0, `${id} mouth opens`).toBeGreaterThan(0.12);
    }
    const brushing = propActionSubParts("momo", "brushTeeth", 1, 0.35, false);
    expect(brushing?.jaw?.rotation?.[0] ?? 0).toBeGreaterThan(0.2);
    expect(brushing?.armR?.rotation?.[0] ?? 0).toBeLessThan(-0.9);
  });

  it("keeps character piece scales uniform on stage (zero pancake squish on hide) and couples toothbrush to mouth", async () => {
    const { createStage } = await import("../../../src/scenes/stage.js");
    const { storyById } = await import("../../../src/content/catalog.js");
    const e19 = storyById("momos-day");
    expect(e19).toBeDefined();
    if (!e19) return;
    const stage = await createStage({ target: null, reducedMotion: false, manualClock: true, mountTimeoutMs: 50 });
    try {
      await stage.load(e19);
      stage.apply([
        { do: "enter", actor: "momo", at: "center", from: "center" },
        { do: "gesture", actor: "momo", gesture: "hide" }
      ]);
      for (let i = 0; i < 24; i += 1) stage.update(1 / 30);
      const app = stage.game().app;
      const momoHeadPieceIds = app.nodes.ids().filter((id) => id === "momo" || id === "momo__head" || id.startsWith("momo__head~"));
      expect(momoHeadPieceIds.length).toBeGreaterThan(1);
      for (const pieceId of momoHeadPieceIds) {
        const handle = app.nodes.get(pieceId);
        expect(handle).toBeDefined();
        const rawScale = handle?.scale ?? [1, 1, 1];
        const scale = typeof rawScale === "number" ? [rawScale, rawScale, rawScale] : rawScale;
        expect(scale[0], `${pieceId} sx==sy`).toBeCloseTo(scale[1], 4);
        expect(scale[1], `${pieceId} sy==sz`).toBeCloseTo(scale[2], 4);
      }

      stage.apply([
        { do: "gesture", actor: "momo", gesture: "idle" },
        { do: "enter", actor: "toothbrush", at: "right", from: "right" },
        { do: "carry", actor: "momo", item: "toothbrush" }
      ]);
      for (let i = 0; i < 15; i += 1) stage.update(1 / 30);
      const brushNode = stage.snapshot().nodes.find((n) => n.id === "toothbrush");
      expect(brushNode).toBeDefined();
      expect(brushNode?.position[1] ?? 0).toBeGreaterThan(0.32);
    } finally {
      stage.dispose();
    }
  });
});
