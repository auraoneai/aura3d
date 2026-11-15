import { describe, expect, it } from "vitest";
import { storyById } from "../../../src/content/catalog.js";
import { createStage } from "../../../src/scenes/stage.js";
import {
  COUNTED_MAX_OVERLAP,
  FACE_CLAMP_RAD,
  NO_FOCUS,
  SUBJECT_MAX_COVERED,
  beatFocus,
  focusForSnapshot,
  subjectFramedPose,
  resolveSightlines,
  sightViolations,
  type BeatFocus,
  type MovableActor,
  type SightState
} from "../../../src/scenes/sightlines.js";
import {
  SPOTS,
  clampYawTowardCamera,
  fitPoseForSubjects,
  frameCamera,
  screenEllipse,
  sightlineCoverage,
  silhouetteOverlap,
  yawToCamera,
  type Occupant,
  type Vec3
} from "../../../src/scenes/spots.js";
import type { BeatSpec, StorySpec } from "../../../src/types.js";

const WIDE = frameCamera("wide", 16 / 9);
const box = (id: string, position: Vec3, size: Vec3 = [0.6, 0.8, 0.6]): SightState => ({ id, position, size, visible: true });

describe("sightline coverage maths", () => {
  it("measures nothing hidden when nodes stand apart", () => {
    const cov = sightlineCoverage([box("a", [-1.3, 0, 0]), box("b", [1.3, 0, 0])], WIDE, 16 / 9);
    expect(cov.get("a")?.covered).toBe(0);
    expect(cov.get("b")?.covered).toBe(0);
    expect(cov.get("a")?.inFrame).toBe(true);
  });

  it("only counts the nearer node as hiding: a node right in front hides most of the one behind, not the reverse", () => {
    const back = box("back", [0, 0, -1.2]);
    const front = box("front", [0, 0, 1.2], [0.8, 1, 0.7]);
    const cov = sightlineCoverage([back, front], WIDE, 16 / 9);
    expect(cov.get("back")!.covered).toBeGreaterThan(0.6);
    expect(cov.get("back")!.by[0]?.id).toBe("front");
    expect(cov.get("front")!.covered).toBe(0);
  });

  it("is deterministic and honours the ignore filter (what a node rests on never hides it)", () => {
    const nodes = [box("sheep", [0, 0.5, 0]), box("cloud", [0, 0, 0.6], [1, 0.6, 1])];
    const a = sightlineCoverage(nodes, WIDE, 16 / 9);
    const b = sightlineCoverage(nodes, WIDE, 16 / 9);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect(a.get("sheep")!.covered).toBeGreaterThan(0);
    expect(sightlineCoverage(nodes, WIDE, 16 / 9, () => true).get("sheep")!.covered).toBe(0);
  });

  it("projects a silhouette ellipse and measures shared area between two nodes", () => {
    const e = screenEllipse(box("a", [0, 0, 0]), WIDE, 16 / 9)!;
    expect(e.rx).toBeGreaterThan(0);
    expect(e.ry).toBeGreaterThan(0);
    expect(silhouetteOverlap(box("a", [0, 0, 0]), box("b", [0, 0, 0]), WIDE, 16 / 9)).toBeCloseTo(1, 5);
    expect(silhouetteOverlap(box("a", [-1.3, 0, 0]), box("b", [1.3, 0, 0]), WIDE, 16 / 9)).toBe(0);
  });

  it("clamps a yaw to face the camera within the limit and leaves a yaw inside it alone", () => {
    const at: Vec3 = [1.3, 0, 0];
    const toCam = yawToCamera(at, WIDE);
    expect(clampYawTowardCamera(toCam + 0.2, at, WIDE, FACE_CLAMP_RAD)).toBeCloseTo(toCam + 0.2, 9);
    expect(clampYawTowardCamera(toCam + 2.5, at, WIDE, FACE_CLAMP_RAD) - toCam).toBeCloseTo(FACE_CLAMP_RAD, 9);
    expect(clampYawTowardCamera(toCam - 2.5, at, WIDE, FACE_CLAMP_RAD) - toCam).toBeCloseTo(-FACE_CLAMP_RAD, 9);
  });
});

const focus = (subjects: string[], counted: string[] = []): BeatFocus => ({ subjects, counted, deliberateHiding: false });

describe("sightline rules", () => {
  it("flags a subject a host stands in front of, on desktop and on the phone", () => {
    const nodes = [box("sheep", [0, 0, -1.2]), box("host", [0, 0, 1.2], [0.8, 1, 0.7])];
    const violations = sightViolations(nodes, focus(["sheep"]), "wide");
    expect(violations.map((v) => v.screen).sort()).toEqual(["desktop", "phone"]);
    expect(violations.every((v) => v.kind === "covered" && v.by === "host" && v.amount > SUBJECT_MAX_COVERED)).toBe(true);
  });

  it("flags counted members that overlap each other and allows a stacked tower", () => {
    const one = box("one", [0, 0, 0]);
    const two = box("two", [0.1, 0, 0]);
    expect(sightViolations([one, two], focus(["one", "two"], ["one", "two"]), "wide").some((v) => v.kind === "counted-overlap" && v.amount > COUNTED_MAX_OVERLAP)).toBe(true);
    const stacked = [one, { ...box("two", [0, 0.8, 0]), attachedTo: ["one"] }];
    expect(sightViolations(stacked, focus(["one", "two"], ["one", "two"]), "wide").filter((v) => v.kind === "counted-overlap")).toEqual([]);
  });

  it("skips deliberate hiding and beats without subjects, and treats an open door as see-through", () => {
    const nodes = [box("sheep", [0, 0, -1.2]), box("door", [0, 0, 1.2], [1, 1.6, 0.2])];
    expect(sightViolations(nodes, { subjects: ["sheep"], counted: [], deliberateHiding: true }, "wide")).toEqual([]);
    expect(sightViolations(nodes, NO_FOCUS, "wide")).toEqual([]);
    expect(sightViolations(nodes, focus(["sheep"]), "wide").length).toBeGreaterThan(0);
    const open = [nodes[0]!, { ...nodes[1]!, seeThrough: true }];
    expect(sightViolations(open, focus(["sheep"]), "wide")).toEqual([]);
  });
});

const actor = (id: string, position: Vec3, extra: Partial<MovableActor> = {}): MovableActor => ({
  id,
  role: "actor",
  width: 0.8,
  depth: 0.7,
  height: 1,
  floats: false,
  position,
  ...extra
});
const occupant = (n: SightState): Occupant => ({ id: n.id, position: n.position, role: "actor", width: n.size[0], depth: n.size[2], height: n.size[1] });

describe("subject framing (the frame edge counts as hiding)", () => {
  const PHONE = 390 / 844;
  it("flags a subject the phone frame cuts off and keeps it on screen once the camera fits", () => {
    const sheep = [box("one", SPOTS.left), box("two", SPOTS.center), box("three", [2.1, 0, 0.1])];
    const f = focus(["one", "three", "two"], ["one", "three", "two"]);
    const raw = frameCamera("wide", PHONE);
    expect(sightlineCoverage(sheep, raw, PHONE).get("three")!.framed).toBeLessThan(0.9);
    const fitted = subjectFramedPose(sheep, f, "wide", PHONE);
    for (const id of ["one", "two", "three"]) expect(sightlineCoverage(sheep, fitted, PHONE).get(id)!.framed).toBe(1);
    expect(sightViolations(sheep, f, "wide")).toEqual([]);
  });

  it("leaves the camera alone when the subjects already fit, and ignores subjects waiting off stage", () => {
    const pose = frameCamera("wide", 16 / 9);
    expect(fitPoseForSubjects(pose, [box("a", SPOTS.center)], 16 / 9)).toBe(pose);
    const wings = [box("a", SPOTS.center), box("b", SPOTS.offRight)];
    expect(subjectFramedPose(wings, focus(["a", "b"]), "wide", 16 / 9)).toEqual(pose);
  });
});

describe("sightline resolver", () => {
  const sheep = box("sheep", [0, 0, -1.2]);
  const host = box("host", [0, 0, 1.2], [0.8, 1, 0.7]);

  it("moves the host who hides a subject to an on-stage spot where it hides nothing and stays in frame", () => {
    const moves = resolveSightlines({
      nodes: [sheep, host],
      movable: [actor("host", host.position)],
      occupants: [occupant(sheep), occupant(host)],
      focus: focus(["sheep"]),
      preset: "wide"
    });
    expect(moves).toHaveLength(1);
    expect(moves[0]!.id).toBe("host");
    const after = [sheep, { ...host, position: moves[0]!.position }];
    expect(sightViolations(after, focus(["sheep"]), "wide")).toEqual([]);
  });

  it("host moves aside: a subject that is free to move stays put while the host in front clears the view", () => {
    const teddy = box("teddy", [1.3, 0, 0.1]);
    const moves = resolveSightlines({
      nodes: [sheep, teddy, host],
      movable: [actor("teddy", teddy.position, { subject: true }), actor("host", host.position)],
      occupants: [occupant(sheep), occupant(teddy), occupant(host)],
      focus: focus(["sheep", "teddy"]),
      preset: "wide"
    });
    expect(moves.map((m) => m.id)).toEqual(["host"]);
  });

  it("subject in front wins only when no host is in the way: then the front subject steps aside", () => {
    const teddy = box("teddy", [0, 0, 1.2], [0.8, 1, 0.7]);
    const moves = resolveSightlines({
      nodes: [sheep, teddy],
      movable: [actor("teddy", teddy.position, { subject: true })],
      occupants: [occupant(sheep), occupant(teddy)],
      focus: focus(["sheep", "teddy"]),
      preset: "wide"
    });
    expect(moves.map((m) => m.id)).toEqual(["teddy"]);
    expect(sightViolations([sheep, { ...teddy, position: moves[0]!.position }], focus(["sheep", "teddy"]), "wide")).toEqual([]);
  });

  it("does nothing for deliberate hiding or when nothing is hidden", () => {
    const input = { nodes: [sheep, host], movable: [actor("host", host.position)], occupants: [occupant(sheep), occupant(host)], preset: "wide" as const };
    expect(resolveSightlines({ ...input, focus: { subjects: ["sheep"], counted: [], deliberateHiding: true } })).toEqual([]);
    expect(resolveSightlines({ ...input, nodes: [sheep, { ...host, position: SPOTS.farRight }], focus: focus(["sheep"]) })).toEqual([]);
  });

  it("is deterministic", () => {
    const input = { nodes: [sheep, host], movable: [actor("host", host.position)], occupants: [occupant(sheep), occupant(host)], focus: focus(["sheep"]), preset: "wide" as const };
    expect(resolveSightlines(input)).toEqual(resolveSightlines(input));
  });
});

describe("beat focus", () => {
  it("collects named, tap, pointed-at and counted subjects, and honours deliberate hiding", () => {
    const story = { numberConcept: { countedObjectIds: ["a", "b", "c"] } } as unknown as StorySpec;
    const beat = {
      id: "x",
      kind: "model",
      stage: [{ do: "face", actor: "momo", toward: "cup" }],
      lines: [],
      words: [{ wordId: "three", objectId: "a" }],
      input: { type: "tap", targets: ["ball"] }
    } as unknown as BeatSpec;
    expect(beatFocus(story, beat)).toEqual({ subjects: ["a", "b", "ball", "c", "cup"], counted: ["a", "b", "c"], deliberateHiding: false });
    expect(beatFocus(story, { ...beat, deliberateHiding: true } as BeatSpec)).toEqual({ subjects: [], counted: [], deliberateHiding: true });
  });
});

describe("Three Sleepy Sheep regression (the dino hid a sheep)", () => {
  it("keeps all three sheep visible on desktop and phone while the line counts them", async () => {
    const story = storyById("three-sleepy-sheep")!;
    const run = async (sightlines: boolean) => {
      const stage = await createStage({ target: null, reducedMotion: false, mountTimeoutMs: 50, sightlines });
      try {
        await stage.load(story);
        // Play the story's beats in order up to the counting line, as the director does.
        const beats = story.kind === "episode" ? story.beats : [];
        for (const beat of beats.slice(0, beats.findIndex((b) => b.id === "count-three") + 1)) {
          stage.apply(beat.stage);
          stage.setFocus(focusForSnapshot(story, { beatId: beat.id, round: 0 }));
          for (let i = 0; i < 80; i += 1) stage.update(0.05);
        }
        return stage.sightlineViolations();
      } finally {
        stage.dispose();
      }
    };
    const before = await run(false);
    expect(before.some((v) => v.kind === "covered" && v.by === "lulu")).toBe(true);
    expect(await run(true)).toEqual([]);
  }, 60_000);
});
