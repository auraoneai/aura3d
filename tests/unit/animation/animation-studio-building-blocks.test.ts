import { describe, expect, it } from "vitest";
import {
  AnimationTrack,
  createAnimationClipRegistry,
  createLocomotionAnimationStateGraph,
  createLocomotionKit,
  validateAnimationClipMap
} from "../../../packages/animation/src";

function clipDef(id: string) {
  return {
    id,
    duration: 1,
    tracks: [new AnimationTrack({ target: `${id}.translation`, valueType: "vector3", keyframes: [{ time: 0, value: [0, 0, 0] }] })]
  };
}

describe("createLocomotionAnimationStateGraph", () => {
  it("transitions idle -> walk -> run -> idle deterministically from movement parameters", () => {
    const graph = createLocomotionAnimationStateGraph();
    expect(graph.update(1 / 30)).toBe("idle");

    graph.setParameter("isMoving", true);
    expect(graph.update(1 / 30)).toBe("walk");

    graph.setParameter("isRunning", true);
    expect(graph.update(1 / 30)).toBe("run");

    graph.setParameter("isRunning", false);
    expect(graph.update(1 / 30)).toBe("walk");

    graph.setParameter("isMoving", false);
    expect(graph.update(1 / 30)).toBe("idle");
  });

  it("is deterministic across identical runs", () => {
    const run = () => {
      const graph = createLocomotionAnimationStateGraph();
      const states: string[] = [];
      const inputs = [{}, { isMoving: true }, { isRunning: true }, { isRunning: false }, { isMoving: false }];
      for (const input of inputs) {
        for (const [key, value] of Object.entries(input)) graph.setParameter(key, value);
        states.push(graph.update(1 / 30));
      }
      return states;
    };
    expect(run()).toEqual(run());
    expect(run()).toEqual(["idle", "walk", "run", "walk", "idle"]);
  });
});

describe("createLocomotionKit", () => {
  const kit = () => createLocomotionKit({ idleClip: "Idle", walkClip: "Walk", runClip: "Run", walkSpeed: 1, runSpeed: 4 });

  it("returns a single full-weight idle clip at zero speed", () => {
    const sample = kit().sample(0);
    expect(sample.state).toBe("idle");
    expect(sample.moving).toBe(false);
    expect(sample.clipWeights).toEqual([{ clip: "Idle", weight: 1 }]);
  });

  it("blends idle->walk between thresholds with weights summing to 1", () => {
    const weights = kit().blendWeights(0.5);
    expect(weights.map((w) => w.value)).toEqual(["Idle", "Walk"]);
    const sum = weights.reduce((acc, w) => acc + w.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(weights[1]!.weight).toBeCloseTo(0.5, 6);
  });

  it("reaches full run weight and run state at/above runSpeed", () => {
    const sample = kit().sample(4);
    expect(sample.running).toBe(true);
    expect(sample.state).toBe("run");
    expect(sample.clipWeights).toEqual([{ clip: "Run", weight: 1 }]);
  });

  it("is deterministic for identical speed sequences", () => {
    const run = () => {
      const k = kit();
      return [0, 0.5, 1, 4, 1, 0].map((s) => k.sample(s).state);
    };
    expect(run()).toEqual(run());
    expect(run()).toEqual(["idle", "walk", "walk", "run", "walk", "idle"]);
  });
});

describe("validateAnimationClipMap", () => {
  it("passes when all required locomotion clips are present", () => {
    const registry = createAnimationClipRegistry([
      clipDef("Idle"),
      clipDef("Walk"),
      clipDef("Run")
    ]);
    const readiness = validateAnimationClipMap(registry, {
      clipMap: { idle: "Idle", walk: "Walk", run: "Run" }
    });
    expect(readiness.ok).toBe(true);
    expect(readiness.missingActions).toEqual([]);
    expect(readiness.missingClipIds).toEqual([]);
  });

  it("fails with an error when a required action is unmapped", () => {
    const registry = createAnimationClipRegistry([
      clipDef("Idle"),
      clipDef("Walk")
    ]);
    const readiness = validateAnimationClipMap(registry, {
      clipMap: { idle: "Idle", walk: "Walk" }
    });
    expect(readiness.ok).toBe(false);
    expect(readiness.missingActions).toContain("run");
    expect(readiness.diagnostics.some((d) => d.severity === "error" && d.code === "ANIMATION_CLIP_ACTION_MISSING")).toBe(true);
  });

  it("fails when a mapped clip is not registered", () => {
    const registry = createAnimationClipRegistry([clipDef("Idle")]);
    const readiness = validateAnimationClipMap(registry, {
      requiredActions: ["idle", "walk"],
      clipMap: { idle: "Idle", walk: "Walk" }
    });
    expect(readiness.ok).toBe(false);
    expect(readiness.missingClipIds).toContain("Walk");
    expect(readiness.diagnostics.some((d) => d.code === "ANIMATION_CLIP_ID_MISSING")).toBe(true);
  });

  it("downgrades to warnings (ok) when segmented fallback is declared and clips are mapped", () => {
    const registry = createAnimationClipRegistry([clipDef("Idle")]);
    const readiness = validateAnimationClipMap(registry, {
      requiredActions: ["idle", "walk"],
      clipMap: { idle: "Idle", walk: "Walk" },
      segmentedFallbackDeclared: true
    });
    // all actions are mapped (walk -> "Walk"), clip just isn't registered -> warning, still ok under fallback
    expect(readiness.missingActions).toEqual([]);
    expect(readiness.ok).toBe(true);
    expect(readiness.diagnostics.every((d) => d.severity !== "error")).toBe(true);
  });
});
