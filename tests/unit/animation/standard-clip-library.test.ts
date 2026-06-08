import { describe, expect, it } from "vitest";
import {
  HUMANOID_BONES,
  PERFORMANCE_GRAPH_PARAMETERS,
  STANDARD_CLIP_IDS,
  STANDARD_LIBRARY_RIG,
  STANDARD_LOCOMOTION_CLIP_IDS,
  createPerformanceStateGraph,
  createStandardHumanoidClipRegistry,
  validateAnimationClipMap,
  validateAnimationStudioClipMap
} from "../../../packages/animation/src";

describe("createStandardHumanoidClipRegistry", () => {
  it("registers all 8 standard vocabulary clips with non-empty humanoid tracks", () => {
    const registry = createStandardHumanoidClipRegistry();
    const humanoidBones = new Set<string>(HUMANOID_BONES);

    expect([...registry.ids()].sort()).toEqual([...STANDARD_CLIP_IDS].sort());

    for (const id of STANDARD_CLIP_IDS) {
      const clip = registry.require(id);
      expect(clip.duration).toBeGreaterThan(0);
      expect(clip.tracks.length).toBeGreaterThan(0);
      for (const track of clip.tracks) {
        // Tracks target real humanoid bones (e.g. "head.rotation").
        const bone = track.target.split(".")[0]!;
        expect(humanoidBones.has(bone)).toBe(true);
        expect((track.keyframes ?? []).length).toBeGreaterThan(0);
      }
    }
  });

  it("emits no error-severity diagnostics (real samplable data, not placeholders)", () => {
    const registry = createStandardHumanoidClipRegistry();
    expect(registry.diagnose().some((d) => d.severity === "error")).toBe(false);
  });

  it("targets the rig-neutral standard humanoid rig (identity bone bindings)", () => {
    expect(STANDARD_LIBRARY_RIG.id).toBe("aura3d.standard-humanoid");
    for (const bone of HUMANOID_BONES) {
      expect(STANDARD_LIBRARY_RIG.bones[bone]?.name).toBe(bone);
    }
  });
});

/**
 * Largest local rotation EXCURSION on a track, in radians: the max geodesic angle between any two
 * of the track's quaternion keyframes. This is the honest "how far does this bone visibly swing"
 * metric — it rejects clips whose keys barely differ (the old invisible ±2° idle).
 */
function trackRotationRange(track: { valueType: string; keyframes: readonly { value: unknown }[] }): number {
  if (track.valueType !== "quaternion") return 0;
  const quats = track.keyframes.map((k) => k.value as readonly [number, number, number, number]);
  let max = 0;
  for (let i = 0; i < quats.length; i += 1) {
    for (let j = i + 1; j < quats.length; j += 1) {
      const a = quats[i]!;
      const b = quats[j]!;
      // |dot| -> angle between orientations; 2*acos(|dot|) is the rotation that maps a onto b.
      const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
      const angle = 2 * Math.acos(Math.min(1, dot));
      if (angle > max) max = angle;
    }
  }
  return max;
}

/** Max rotation range (rad) across every track whose bone is in `bones`, for a given clip id. */
function maxRangeForBones(
  registry: ReturnType<typeof createStandardHumanoidClipRegistry>,
  clipId: (typeof STANDARD_CLIP_IDS)[number],
  bones: readonly string[]
): number {
  const clip = registry.require(clipId);
  const boneSet = new Set(bones);
  let max = 0;
  for (const track of clip.tracks) {
    const bone = track.target.split(".")[0]!;
    if (!boneSet.has(bone)) continue;
    const range = trackRotationRange(track as unknown as { valueType: string; keyframes: readonly { value: unknown }[] });
    if (range > max) max = range;
  }
  return max;
}

describe("standard clip amplitudes are VISIBLE (rejects invisible clips)", () => {
  // Per-clip floors on the bones that carry the read of the motion. Tuned well above the
  // "alive but invisible" range (~0.04 rad / ~2°) so a regression that quietly shrinks a clip
  // back to a twitch fails this test.
  const cases: ReadonlyArray<{
    clip: (typeof STANDARD_CLIP_IDS)[number];
    bones: readonly string[];
    minRange: number;
    label: string;
  }> = [
    { clip: "idle", bones: ["head", "spine", "neck", "chest"], minRange: 0.12, label: "idle head/spine breathing+turn" },
    { clip: "talk", bones: ["leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm"], minRange: 0.4, label: "talk arm gestures" },
    { clip: "gesture", bones: ["leftUpperArm", "rightUpperArm"], minRange: 0.6, label: "gesture big arm" },
    { clip: "point", bones: ["rightUpperArm"], minRange: 0.6, label: "point arm extension" },
    { clip: "nod", bones: ["head"], minRange: 0.3, label: "nod head" },
    { clip: "react", bones: ["spine", "leftUpperArm", "rightUpperArm"], minRange: 0.4, label: "react recoil/pose" },
    { clip: "walk", bones: ["leftUpperLeg", "rightUpperLeg"], minRange: 0.6, label: "walk leg cycle" },
    { clip: "run", bones: ["leftUpperLeg", "rightUpperLeg"], minRange: 0.6, label: "run leg cycle" }
  ];

  for (const { clip, bones, minRange, label } of cases) {
    it(`${clip}: ${label} exceeds ${minRange} rad`, () => {
      const registry = createStandardHumanoidClipRegistry();
      const range = maxRangeForBones(registry, clip, bones);
      expect(range, `${clip} key bones must visibly move (got ${range.toFixed(3)} rad)`).toBeGreaterThan(minRange);
    });
  }

  it("no standard clip is silently invisible (every clip has a >0.12 rad bone somewhere)", () => {
    const registry = createStandardHumanoidClipRegistry();
    for (const id of STANDARD_CLIP_IDS) {
      const clip = registry.require(id);
      const maxAny = Math.max(
        0,
        ...clip.tracks.map((t) =>
          trackRotationRange(t as unknown as { valueType: string; keyframes: readonly { value: unknown }[] })
        )
      );
      expect(maxAny, `${id} has no visibly-moving bone`).toBeGreaterThan(0.12);
    }
  });
});

describe("validation of the standard library clip map", () => {
  it("validateAnimationStudioClipMap accepts the locomotion subset (idle/walk/run)", () => {
    const registry = createStandardHumanoidClipRegistry();
    const readiness = validateAnimationStudioClipMap(registry, {
      requiredActions: [...STANDARD_LOCOMOTION_CLIP_IDS],
      clipMap: { idle: "idle", walk: "walk", run: "run" }
    });
    expect(readiness.ok).toBe(true);
    expect(readiness.missingActions).toEqual([]);
    expect(readiness.missingClipIds).toEqual([]);
  });

  it("validateAnimationClipMap accepts the performance vocabulary mapping", () => {
    const registry = createStandardHumanoidClipRegistry();
    const readiness = validateAnimationClipMap(registry, {
      requiredActions: ["speak", "listen", "gesture", "walk", "action"],
      clipMap: {
        speak: "talk",
        listen: "idle",
        gesture: "gesture",
        walk: "walk",
        action: "react"
      }
    });
    expect(readiness.ok).toBe(true);
    expect(readiness.missingClipIds).toEqual([]);
  });
});

describe("createPerformanceStateGraph", () => {
  it("defaults to idle and transitions idle -> talk -> idle", () => {
    const graph = createPerformanceStateGraph();
    expect(graph.currentState).toBe("idle");
    expect(graph.update(1 / 30)).toBe("idle");

    graph.setParameter(PERFORMANCE_GRAPH_PARAMETERS.talk, true);
    expect(graph.update(1 / 30)).toBe("talk");

    graph.setParameter(PERFORMANCE_GRAPH_PARAMETERS.talk, false);
    expect(graph.update(1 / 30)).toBe("idle");
  });

  it("fires a one-shot gesture and auto-returns to idle on completion", () => {
    const graph = createPerformanceStateGraph({ oneShotDuration: 0.5 });
    graph.setParameter(PERFORMANCE_GRAPH_PARAMETERS.gesture, true);
    expect(graph.update(1 / 30)).toBe("gesture");
    // Trigger param is consumed on entry; advancing past the duration returns to idle.
    expect(graph.update(0.6)).toBe("idle");
  });

  it("drives the locomotion blend idle -> walk -> run -> idle", () => {
    const graph = createPerformanceStateGraph();
    graph.setParameter(PERFORMANCE_GRAPH_PARAMETERS.walk, true);
    expect(graph.update(1 / 30)).toBe("walk");
    graph.setParameter(PERFORMANCE_GRAPH_PARAMETERS.run, true);
    expect(graph.update(1 / 30)).toBe("run");
    graph.setParameter(PERFORMANCE_GRAPH_PARAMETERS.run, false);
    expect(graph.update(1 / 30)).toBe("walk");
    graph.setParameter(PERFORMANCE_GRAPH_PARAMETERS.walk, false);
    expect(graph.update(1 / 30)).toBe("idle");
  });

  it("exposes states covering the full standard vocabulary", () => {
    const graph = createPerformanceStateGraph();
    const stateNames = new Set(graph.graphSnapshot().states.map((s) => s.name));
    for (const id of STANDARD_CLIP_IDS) {
      expect(stateNames.has(id)).toBe(true);
    }
  });
});
