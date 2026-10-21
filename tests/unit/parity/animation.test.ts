import { describe, expect, test } from "vitest";
import { PropertyBinding as ThreePropertyBinding } from "three";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  AnimationObjectGroup,
  AnimationTrack,
  AnimationUtils,
  BooleanKeyframeTrack,
  ColorKeyframeTrack,
  NumberKeyframeTrack,
  PropertyBinding,
  QuaternionKeyframeTrack,
  SceneAnimationBridge,
  StringKeyframeTrack,
  VectorKeyframeTrack,
  findNode,
  isClipAdditive,
  makeClipAdditive,
  merge,
  optimize,
  parseTrackName,
  sanitizeNodeName,
  subclip,
  type AnimationMixerLoopEvent,
  type AnimationMixerFinishedEvent,
  type SceneAnimationNode
} from "@aura3d/animation";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { AURA_UNCLAMPED_MORPH_WEIGHTS_TAG } from "../../../packages/engine/src/agent-api/runtimeEvidence.js";

/**
 * Lane L8 parity suite — SA-01 mixer depth, SA-02 AnimationObjectGroup,
 * SA-03 PropertyBinding, SA-05 morph dictionary/unclamped weights, SA-06
 * AnimationUtils, SM-03 color + typed tracks.
 */

function scalarClip(name: string, duration = 1): AnimationClip {
  return new AnimationClip({
    name,
    duration,
    tracks: [
      new AnimationTrack({
        target: "node.value",
        valueType: "scalar",
        keyframes: [
          { time: 0, value: 0 },
          { time: duration, value: 1 }
        ]
      })
    ]
  });
}

describe("SA-01 AnimationAction loop depth", () => {
  test("once finishes at the end boundary and stops", () => {
    const action = new AnimationAction(scalarClip("once", 1)).setLoop("once").play();
    action.update(1.2);
    expect(action.time).toBe(1);
    expect(action.playing).toBe(false);
    expect(action.paused).toBe(false);
    expect(action.consumePlaybackSignals().finishedDirection).toBe(1);
  });

  test("clampWhenFinished pauses clamped at the end instead of stopping", () => {
    const action = new AnimationAction(scalarClip("clamp", 1)).setLoop("once").play();
    action.clampWhenFinished = true;
    action.update(2);
    expect(action.time).toBe(1);
    expect(action.playing).toBe(true);
    expect(action.paused).toBe(true);
  });

  test("negative timeScale reverses once-mode playback and finishes at 0 with direction -1", () => {
    const action = new AnimationAction(scalarClip("reverse", 1)).setLoop("once").setTimeScale(-1).play();
    action.seek(0.75);
    action.update(0.5);
    expect(action.time).toBeCloseTo(0.25);
    action.update(0.5);
    expect(action.time).toBe(0);
    expect(action.playing).toBe(false);
    const signals = action.consumePlaybackSignals();
    expect(signals.finishedDirection).toBe(-1);
  });

  test("repeat wraps both directions and counts loops", () => {
    const forward = new AnimationAction(scalarClip("fwd", 1)).setLoop("repeat").play();
    forward.update(2.5);
    expect(forward.time).toBeCloseTo(0.5);
    expect(forward.consumePlaybackSignals().loopDelta).toBe(2);

    const backward = new AnimationAction(scalarClip("bwd", 1)).setLoop("repeat").setTimeScale(-1).play();
    backward.update(0.5);
    expect(backward.time).toBeCloseTo(0.5);
    expect(backward.consumePlaybackSignals().loopDelta).toBe(-1);
  });

  test("repetitions finishes a repeat action after the configured wrap count", () => {
    const action = new AnimationAction(scalarClip("reps", 1)).setLoop("repeat", 2).play();
    action.update(1.2); // first wrap
    expect(action.playing).toBe(true);
    action.update(1.2); // second wrap → finished
    expect(action.playing).toBe(false);
    expect(action.time).toBe(1);
    const signals = action.consumePlaybackSignals();
    expect(signals.finishedDirection).toBe(1);
  });

  test("pingpong bounces at both ends and respects repetitions", () => {
    const action = new AnimationAction(scalarClip("pong", 1)).setLoop("pingpong").play();
    action.update(1.5);
    expect(action.time).toBeCloseTo(0.5); // bounced off the end
    action.update(1.2);
    expect(action.time).toBeCloseTo(0.7); // bounced off the start
    expect(action.playing).toBe(true);

    const limited = new AnimationAction(scalarClip("pong2", 1)).setLoop("pingpong", 2).play();
    limited.update(2.2); // wrap at end (1) then at start (2) → exhausted
    expect(limited.playing).toBe(false);
    expect(limited.consumePlaybackSignals().finishedDirection).toBe(1);
  });
});

describe("SA-01 AnimationMixer finished/loop events", () => {
  test("finished fires exactly once through the mixer", () => {
    const mixer = new AnimationMixer();
    const action = mixer.play(scalarClip("done", 1));
    action.setLoop("once");
    const finished: AnimationMixerFinishedEvent[] = [];
    mixer.addEventListener("finished", (event) => finished.push(event));
    mixer.update(0.6);
    mixer.update(0.6);
    mixer.update(0.6);
    expect(finished).toHaveLength(1);
    expect(finished[0]!.action).toBe(action);
    expect(finished[0]!.direction).toBe(1);
  });

  test("loop fires once per wrap with the signed delta", () => {
    const mixer = new AnimationMixer();
    const action = mixer.play(scalarClip("loops", 1));
    action.setLoop("repeat");
    const loops: AnimationMixerLoopEvent[] = [];
    mixer.addEventListener("loop", (event) => loops.push(event));
    mixer.update(1.1);
    mixer.update(1.1);
    expect(loops).toHaveLength(2);
    expect(loops.every((event) => event.loopDelta === 1)).toBe(true);

    action.setTimeScale(-1);
    loops.length = 0;
    mixer.update(1.1);
    expect(loops).toHaveLength(1);
    expect(loops[0]!.loopDelta).toBe(-1);
  });

  test("finished reports direction -1 when the playhead exits the start boundary", () => {
    const mixer = new AnimationMixer();
    const action = mixer.play(scalarClip("exit-start", 1));
    action.setLoop("once");
    action.setTimeScale(-1);
    action.seek(0.2);
    const finished: AnimationMixerFinishedEvent[] = [];
    mixer.addEventListener("finished", (event) => finished.push(event));
    mixer.update(0.5);
    expect(finished).toHaveLength(1);
    expect(finished[0]!.direction).toBe(-1);
    expect(action.time).toBe(0);
  });

  test("repetitions through the mixer finish after the count, then loop events stop", () => {
    const mixer = new AnimationMixer();
    const action = mixer.play(scalarClip("rep-mixer", 1));
    action.setLoop("repeat", 2);
    const loops: AnimationMixerLoopEvent[] = [];
    const finished: AnimationMixerFinishedEvent[] = [];
    mixer.addEventListener("loop", (event) => loops.push(event));
    mixer.addEventListener("finished", (event) => finished.push(event));
    mixer.update(1.1);
    mixer.update(1.1);
    mixer.update(1.1);
    expect(finished).toHaveLength(1);
    // three fires `finished` instead of `loop` on the exhausting wrap.
    expect(loops).toHaveLength(1);
  });
});

describe("SA-03 PropertyBinding.parseTrackName parity with three", () => {
  const TABLE: readonly string[] = [
    "nodeName.property",
    "nodeName.property[accessor]",
    "nodeName.material.property[accessor]",
    "nodeName.material.opacity",
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890.property[accessor]",
    "uuid.materials[0].opacity",
    "parentName/nodeName.property",
    "parentName/parentName/nodeName.property[index]",
    ".bone[Armature.DEF_cog].position",
    "scene:helium_balloon_model:helium_balloon_model.position",
    "mesh.morphTargetInfluences[smile]",
    ".morphTargetInfluences[run]",
    "node.position[x]",
    "foo.bar.baz",
    "model.materials[2].emissiveMap"
  ];

  for (const trackName of TABLE) {
    test(`"${trackName}" parses identically to three`, () => {
      const theirs = ThreePropertyBinding.parseTrackName(trackName);
      const ours = parseTrackName(trackName);
      expect(ours.nodeName).toBe(theirs.nodeName);
      expect(ours.objectName).toBe(theirs.objectName);
      expect(ours.objectIndex).toBe(theirs.objectIndex);
      expect(ours.propertyName).toBe(theirs.propertyName);
      expect(ours.propertyIndex).toBe(theirs.propertyIndex);
    });
  }

  test("invalid track names throw like three's", () => {
    expect(() => parseTrackName("")).toThrow();
    expect(() => parseTrackName("node")).toThrow();
    expect(() => ThreePropertyBinding.parseTrackName("")).toThrow();
  });

  test("sanitizeNodeName matches three", () => {
    const inputs = ["mixamorig Hips", "Armature|Left Arm", "a.b:c/d[e]f"];
    for (const input of inputs) {
      expect(sanitizeNodeName(input)).toBe(ThreePropertyBinding.sanitizeNodeName(input));
    }
  });

  test("findNode resolves root, children, uuid and skeleton bones like three", () => {
    const bone = { name: "Armature.DEF_cog", uuid: "bone-1" };
    const child = { name: "Hand", uuid: "child-uuid", children: [{ name: "Finger", uuid: "finger-uuid" }] };
    const root = {
      name: "Root",
      uuid: "root-uuid",
      children: [child],
      skeleton: { bones: [bone], getBoneByName: (name: string) => (bone.name === name ? bone : undefined) }
    };
    expect(findNode(root, "Root")).toBe(root);
    expect(findNode(root, "root-uuid")).toBe(root);
    expect(findNode(root, undefined)).toBe(root);
    expect(findNode(root, "Hand")).toBe(child);
    expect(findNode(root, "Finger")).toBe(child.children[0]);
    expect(findNode(root, "Armature.DEF_cog")).toBe(bone);
    expect(findNode(root, "missing")).toBeNull();
  });

  test("PropertyBinding binds direct, array-element, morph-name and material paths", () => {
    const mesh = {
      name: "Mesh",
      morphTargetDictionary: { smile: 0, frown: 1 },
      morphTargetInfluences: [0, 0],
      material: { opacity: 1 },
      position: { x: 0, y: 0, z: 0 }
    };
    const morph = new PropertyBinding(mesh as never, "mesh.morphTargetInfluences[frown]", { propertyName: "morphTargetInfluences", propertyIndex: "frown" });
    morph.bind();
    morph.setValue(0.7);
    expect(mesh.morphTargetInfluences).toEqual([0, 0.7]);
    expect(morph.getValue()).toBe(0.7);

    const material = new PropertyBinding(mesh as never, "mesh.material.opacity", { propertyName: "opacity", objectName: "material" });
    material.bind();
    material.setValue(0.4);
    expect(mesh.material.opacity).toBe(0.4);
  });
});

describe("SA-02 AnimationObjectGroup shared bindings", () => {
  test("a composite binding writes every active object and reads the first", () => {
    const a = { name: "a", opacity: 0 };
    const b = { name: "b", opacity: 0 };
    const group = new AnimationObjectGroup(a, b);
    const binding = PropertyBinding.create(group, ".opacity", { propertyName: "opacity" });
    binding.bind();
    binding.setValue(0.5);
    expect(a.opacity).toBe(0.5);
    expect(b.opacity).toBe(0.5);
    expect(binding.getValue()).toBe(0.5);
    expect(group.stats.objects.total).toBe(2);
    expect(group.stats.objects.inUse).toBe(2);
    expect(group.stats.bindingsPerObject).toBe(1);
  });

  test("remove moves objects to the cached region and stops their writes", () => {
    const a = { name: "a", opacity: 0 };
    const b = { name: "b", opacity: 0 };
    const group = new AnimationObjectGroup(a, b);
    const binding = PropertyBinding.create(group, ".opacity", { propertyName: "opacity" });
    group.remove(b);
    expect(group.stats.objects.inUse).toBe(1);
    binding.setValue(0.9);
    expect(a.opacity).toBe(0.9);
    expect(b.opacity).toBe(0);
    group.add(b);
    binding.setValue(0.3);
    expect(b.opacity).toBe(0.3);
    group.uncache(a, b);
    expect(group.stats.objects.total).toBe(0);
  });
});

describe("SA-06 AnimationUtils", () => {
  const clip = () => new AnimationClip({
    name: "walk",
    duration: 4,
    tracks: [
      new AnimationTrack({
        target: "node.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [1, 0, 0] },
          { time: 2, value: [2, 0, 0] },
          { time: 3, value: [3, 0, 0] },
          { time: 4, value: [4, 0, 0] }
        ]
      })
    ],
    events: [{ name: "step", time: 1.5 }]
  });

  test("subclip slices by frames and shifts to zero like three", () => {
    const sub = subclip(clip(), "walk-part", 30, 90, 30); // [1s, 3s)
    expect(sub.duration).toBeCloseTo(1);
    const times = sub.tracks[0]!.keyframes.map((key) => key.time);
    expect(times).toEqual([0, 1]);
    expect(sub.tracks[0]!.keyframes[0]!.value).toEqual([1, 0, 0]);
    expect(sub.events).toEqual([{ name: "step", time: 0.5 }]);
  });

  test("optimize drops redundant interior keys and keeps cubicspline tangents", () => {
    const redundant = new AnimationClip({
      name: "static",
      duration: 3,
      tracks: [
        new AnimationTrack({
          target: "node.position",
          valueType: "vector3",
          keyframes: [
            { time: 0, value: [1, 0, 0] },
            { time: 1, value: [1, 0, 0] },
            { time: 2, value: [1, 0, 0] },
            { time: 3, value: [2, 0, 0] }
          ]
        })
      ]
    });
    const optimized = optimize(redundant);
    // t=1 is redundant (equals both neighbors); t=2 must stay so the ramp to
    // [2,0,0] still starts at t=2 instead of stretching across [0,3].
    expect(optimized.tracks[0]!.keyframes.map((k) => k.time)).toEqual([0, 2, 3]);

    const spline = new AnimationClip({
      name: "spline",
      duration: 2,
      tracks: [
        new AnimationTrack({
          target: "node.scale",
          valueType: "scalar",
          keyframes: [
            { time: 0, value: 1, interpolation: "cubicspline", outTangent: 0 },
            { time: 1, value: 1, interpolation: "cubicspline", inTangent: 0, outTangent: 0 },
            { time: 2, value: 1, interpolation: "cubicspline", inTangent: 0 }
          ]
        })
      ]
    });
    expect(optimize(spline).tracks[0]!.keyframes).toHaveLength(3);
  });

  test("merge concatenates clips sequentially and joins same-target tracks", () => {
    const a = scalarClip("a", 1);
    const b = new AnimationClip({
      name: "b",
      duration: 2,
      tracks: [
        new AnimationTrack({
          target: "node.value",
          valueType: "scalar",
          keyframes: [
            { time: 0, value: 1 },
            { time: 2, value: 3 }
          ]
        })
      ]
    });
    const merged = merge([a, b], "ab");
    expect(merged.duration).toBe(3);
    expect(merged.tracks).toHaveLength(1);
    const times = merged.tracks[0]!.keyframes.map((key) => key.time);
    // b's boundary key (t=1 → value 1) drops to keep the join continuous.
    expect(times).toEqual([0, 1, 3]);
    expect(merged.tracks[0]!.sample(2.5)).toBeCloseTo(2.5);
  });

  test("makeClipAdditive is re-exported through AnimationUtils and marks the clip", () => {
    const additive = makeClipAdditive(scalarClip("pose", 1));
    expect(isClipAdditive(additive)).toBe(true);
    expect(AnimationUtils.makeClipAdditive).toBe(makeClipAdditive);
    const track = additive.tracks[0]!;
    expect(track.sample(0)).toBeCloseTo(0);
    expect(track.sample(1)).toBeCloseTo(1);
  });
});

describe("SM-03 color values and typed track factories", () => {
  test("color tracks interpolate rgb tuples", () => {
    const track = ColorKeyframeTrack("mesh.material.color", [0, 1], [1, 0, 0, 0, 0, 1]);
    expect(track.valueType).toBe("color");
    expect(track.sample(0.5)).toEqual([0.5, 0, 0.5]);
  });

  test("typed factories build three-shaped tracks", () => {
    const scalar = NumberKeyframeTrack("node.opacity", [0, 1], [0, 1]);
    expect(scalar.valueType).toBe("scalar");
    expect(scalar.sample(0.5)).toBeCloseTo(0.5);

    const vec = VectorKeyframeTrack("node.position", [0, 1], [[0, 0, 0], [1, 2, 3]]);
    expect(vec.sample(0.5)).toEqual([0.5, 1, 1.5]);

    const quat = QuaternionKeyframeTrack("node.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
    expect(quat.valueType).toBe("quaternion");

    const flag = BooleanKeyframeTrack("node.visible", [0, 1], [true, false]);
    expect(flag.sample(0.9)).toBe(true);

    const word = StringKeyframeTrack("node.state", [0, 1], ["idle", "run"]);
    expect(word.sample(1)).toBe("run");
  });
});

describe("SA-03 SceneAnimationBridge track-name routing", () => {
  test("morphTargetInfluences[name] resolves through the dictionary and respects the unclamped opt-in", () => {
    const bridge = new SceneAnimationBridge();
    const node: SceneAnimationNode = {
      name: "face",
      morphTargetDictionary: { smile: 0, frown: 1 },
      morphTargetInfluences: [0, 0]
    };
    bridge.register("face", node);
    bridge.setAnimationValue("face.morphTargetInfluences[frown]", 0.8);
    expect(node.morphTargetInfluences).toEqual([0, 0.8]);
    // default path clamps out-of-range weights
    bridge.setAnimationValue("face.morphTargetInfluences[smile]", 1.7);
    expect(node.morphTargetInfluences![0]).toBe(1);
    node.unclampedMorphWeights = true;
    bridge.setAnimationValue("face.morphTargetInfluences[smile]", 1.7);
    expect(node.morphTargetInfluences![0]).toBe(1.7);
    bridge.setAnimationValue("face.morphTargetInfluences[frown]", -0.5);
    expect(node.morphTargetInfluences![1]).toBe(-0.5);
  });

  test("material and element paths route through PropertyBinding grammar", () => {
    const bridge = new SceneAnimationBridge();
    const node: SceneAnimationNode = {
      name: "mesh",
      position: [0, 0, 0],
      material: { opacity: 1 } as never
    };
    bridge.register("mesh", node);
    bridge.setAnimationValue("mesh.material.opacity", 0.25);
    expect((node.material as { opacity: number }).opacity).toBe(0.25);
    bridge.setAnimationValue("mesh.position[y]", 2);
    expect(node.position).toEqual([0, 2, 0]);
  });
});

describe("SA-05 runtime morphTargetDictionary and unclamped weights", () => {
  test("morphTargetDictionary maps evidence names to indices and stays mutable-free", () => {
    const handle = createRuntimeNodeHandle(
      { kind: "model", position: [0, 0, 0] } as never,
      { id: "morph-node" }
    );
    handle.setImportedAssetEvidence({
      kind: "aura-runtime-node-imported-asset-evidence",
      assetId: "face",
      clips: [],
      morphTargets: ["smile", "frown", "smile"],
      activeMorphTargets: {},
      missingMorphTargets: [],
      bounds: {
        kind: "aura-runtime-node-bounds",
        center: [0, 0, 0],
        size: [1, 1, 1],
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5]
      },
      diagnostics: [],
      renderItemCount: 0,
      skinnedRenderItemCount: 0,
      morphRenderItemCount: 0,
      lastMaterialTracksApplied: 0,
      lastLightTracksApplied: 0
    } as never);
    expect(handle.morphTargetDictionary?.()).toEqual({ smile: 0, frown: 1 });
  });

  test("default morph writes clamp to [0,1]; the opt-in tag passes through", () => {
    const clamped = createRuntimeNodeHandle({ kind: "model", position: [0, 0, 0] } as never, { id: "c" });
    clamped.setMorphTarget("smile", 1.7);
    clamped.setMorphTarget("frown", -0.4);
    expect(clamped.morphTargets()).toEqual({ smile: 1, frown: 0 });

    const free = createRuntimeNodeHandle(
      { kind: "model", position: [0, 0, 0] } as never,
      { id: "u", tags: [AURA_UNCLAMPED_MORPH_WEIGHTS_TAG] }
    );
    free.setMorphTarget("smile", 1.7);
    free.setMorphTarget("frown", -0.4);
    free.morphInfluence("blink", 2.5);
    expect(free.morphTargets()).toEqual({ smile: 1.7, frown: -0.4, blink: 2.5 });
  });
});
