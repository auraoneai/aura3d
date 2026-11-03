import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { Scene } from "@aura3d/scene";
import {
  createGLTFSceneAnimationRuntime,
  type GLTFSceneAnimationMaterialSink
} from "../../../packages/assets/src";

/**
 * M1 box 1: `KHR_animation_pointer` `material:*` / `light:*` tracks drive live runtime
 * targets instead of being diagnosed and dropped. Synthetic clips straight into
 * `GLTFSceneAnimationRuntime` (no GLB needed — the loader binding is proven separately).
 */
function buildScene() {
  const scene = new Scene();
  const point = scene.createLight("point", "KeyLight");
  const directional = scene.createLight("directional", "SunLight");
  // Mirror loaded GLB scenes: the loader attaches every node (light nodes included) to the graph.
  scene.root.addChild(point);
  scene.root.addChild(directional);
  return { scene, point, directional };
}

function buildSink(name: string, calls: { parameter: string; value: number | readonly number[] }[]): GLTFSceneAnimationMaterialSink {
  return {
    name,
    setAnimationParameter: (parameter, value) => {
      calls.push({ parameter, value });
    }
  };
}

function scalarClip(name: string, target: string, from: number, to: number): AnimationClip {
  return new AnimationClip({
    name,
    tracks: [
      new AnimationTrack({
        target,
        valueType: "scalar",
        keyframes: [
          { time: 0, value: from },
          { time: 1, value: to }
        ]
      })
    ]
  });
}

type TextureStatus = ReturnType<NonNullable<GLTFSceneAnimationMaterialSink["animationParameterStatus"]>>;

function textureSink(name: string) {
  const statuses: Record<string, TextureStatus> = { u_normalScale: "available", u_occlusionStrength: "available" };
  const writes: { parameter: string; value: number | readonly number[] }[] = [];
  const sink: GLTFSceneAnimationMaterialSink = {
    name,
    setAnimationParameter(parameter, value) { writes.push({ parameter, value }); },
    animationParameterStatus(parameter) { return statuses[parameter] ?? "unsupported"; },
    applyAnimationParameter(parameter, value) {
      const status = statuses[parameter] ?? "unsupported";
      if (status !== "available") return status;
      writes.push({ parameter, value });
      return "applied";
    }
  };
  return { sink, statuses, writes };
}

describe("GLTFSceneAnimationRuntime material pointer tracks", () => {
  it("writes a sampled emissiveStrength scalar onto the resolved material sink", () => {
    const { scene } = buildScene();
    const calls: { parameter: string; value: number | readonly number[] }[] = [];
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [scalarClip("glow", "material:TestMat.emissiveStrength", 0.5, 2)],
      resolveAnimationMaterial: (name) => (name === "TestMat" ? buildSink(name, calls) : undefined)
    });

    const result = runtime.applyClipByName("glow", 1);

    expect(result.materialTracksApplied).toBe(1);
    expect(result.lightTracksApplied).toBe(0);
    expect(result.tracksApplied).toBe(1);
    expect(result.missingTargets).toEqual([]);
    expect(calls).toEqual([{ parameter: "u_emissiveStrength", value: 2 }]);
  });

  it("fans a baseColorFactor vec4 onto both base-color uniforms, including dotted leaf paths", () => {
    const { scene } = buildScene();
    const calls: { parameter: string; value: number | readonly number[] }[] = [];
    const clip = new AnimationClip({
      name: "fade",
      tracks: [
        new AnimationTrack({
          target: "material:TestMat.pbrMetallicRoughness.baseColorFactor",
          valueType: "number-array",
          keyframes: [
            { time: 0, value: [1, 1, 1, 1] },
            { time: 1, value: [0, 0, 0, 1] }
          ]
        })
      ]
    });
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [clip],
      resolveAnimationMaterial: (name) => (name === "TestMat" ? buildSink(name, calls) : undefined)
    });

    const result = runtime.applyClipByName("fade", 1);

    expect(result.materialTracksApplied).toBe(1);
    expect(calls).toEqual([
      { parameter: "u_baseColorFactor", value: [0, 0, 0, 1] },
      { parameter: "u_baseColor", value: [0, 0, 0, 1] }
    ]);
  });

  it("reports unmapped leaves, unknown materials, and a missing resolver as missing targets", () => {
    const { scene } = buildScene();
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [
        scalarClip("odd-leaf", "material:TestMat.iridescenceFactor", 0, 1),
        scalarClip("odd-mat", "material:Nope.emissiveStrength", 0, 1)
      ],
      resolveAnimationMaterial: () => undefined
    });

    const leafResult = runtime.applyClipByName("odd-leaf", 1);
    expect(leafResult.materialTracksApplied).toBe(0);
    expect(leafResult.missingTargets).toEqual(["material:TestMat.iridescenceFactor"]);

    const matResult = runtime.applyClipByName("odd-mat", 1);
    expect(matResult.materialTracksApplied).toBe(0);
    expect(matResult.missingTargets).toEqual(["material:Nope.emissiveStrength"]);

    const noResolver = createGLTFSceneAnimationRuntime({
      scene,
      clips: [scalarClip("glow", "material:TestMat.emissiveStrength", 0, 1)]
    });
    const missing = noResolver.applyClipByName("glow", 1);
    expect(missing.materialTracksApplied).toBe(0);
    expect(missing.missingTargets).toEqual(["material:TestMat.emissiveStrength"]);
  });

  it("applies material tracks even when a bone mask excludes every node", () => {
    const { scene } = buildScene();
    const calls: { parameter: string; value: number | readonly number[] }[] = [];
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [scalarClip("glow", "material:TestMat.emissiveStrength", 0.5, 2)],
      resolveAnimationMaterial: (name) => (name === "TestMat" ? buildSink(name, calls) : undefined)
    });

    const result = runtime.applyClips([{ clipName: "glow", time: 1, mask: { exclude: [""] } }]);
    expect(result.materialTracksApplied).toBe(1);
    expect(calls).toEqual([{ parameter: "u_emissiveStrength", value: 2 }]);
  });

  it("throws on a non-finite sampled material value instead of writing garbage", () => {
    const { scene } = buildScene();
    const calls: { parameter: string; value: number | readonly number[] }[] = [];
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] ,
      resolveAnimationMaterial: (name) => (name === "TestMat" ? buildSink(name, calls) : undefined)
    });
    expect(() =>
      runtime.applyAnimationValues("probe", 0, new Map([["material:TestMat.emissiveStrength", Number.NaN]]))
    ).toThrow(/invalid scalar/);
    expect(calls).toEqual([]);
  });
});

describe("GLTFSceneAnimationRuntime texture scalar pointer tracks", () => {
  const normal = "material:Car.body.normalTexture.scale";
  const occlusion = "material:Car.body.occlusionTexture.strength";

  it("binds both exact paths to a dotted material name and applies sampled scalar values", () => {
    const { scene } = buildScene();
    const material = textureSink("Car.body");
    const requested: string[] = [];
    const clip = new AnimationClip({ name: "surface", tracks: [
      new AnimationTrack({ target: normal, valueType: "scalar", keyframes: [
        { time: 0, value: 0.2 }, { time: 1, value: 0.8 }
      ] }),
      new AnimationTrack({ target: occlusion, valueType: "scalar", keyframes: [
        { time: 0, value: 0.1 }, { time: 1, value: 0.9 }
      ] })
    ] });
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: [clip], resolveAnimationMaterial: (name) => {
        requested.push(name);
        return name === "Car.body" ? material.sink : undefined;
      }
    });
    const [binding] = runtime.inspectClipBindings("surface");
    expect(binding).toMatchObject({ supportedTrackCount: 2, boundTrackCount: 2, materialTrackCount: 2, missingTargetCount: 0, unsupportedTrackCount: 0, boundMaterialNames: ["Car.body"] });
    const result = runtime.applyClipByName("surface", 0.5);
    expect(result).toMatchObject({ tracksApplied: 2, materialTracksApplied: 2, missingTargets: [], unsupportedTracks: [] });
    expect(material.writes).toHaveLength(2);
    expect(material.writes[0]?.parameter).toBe("u_normalScale");
    expect(material.writes[0]?.value).toBeCloseTo(0.5);
    expect(material.writes[1]?.parameter).toBe("u_occlusionStrength");
    expect(material.writes[1]?.value).toBeCloseTo(0.5);
    expect(requested.every((name) => name === "Car.body")).toBe(true);
  });

  it("blends texture scalars and drives them through the pose mixer", () => {
    const { scene } = buildScene();
    const material = textureSink("Car.body");
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [
        scalarClip("normal-low", normal, 0.2, 0.6),
        scalarClip("normal-high", normal, 0.8, 1),
        scalarClip("occlusion", occlusion, 0.1, 0.9)
      ],
      resolveAnimationMaterial: (name) => name === "Car.body" ? material.sink : undefined
    });
    const blended = runtime.applyClips([
      { clipName: "normal-low", time: 1, weight: 1 },
      { clipName: "normal-high", time: 1, weight: 3 },
      { clipName: "occlusion", time: 0.5 }
    ]);
    expect(blended.materialTracksApplied).toBe(2);
    expect(blended.missingTargets).toEqual([]);
    expect(material.writes.find((entry) => entry.parameter === "u_normalScale")?.value).toBeCloseTo(0.9);
    expect(material.writes.find((entry) => entry.parameter === "u_occlusionStrength")?.value).toBeCloseTo(0.5);

    material.writes.length = 0;
    runtime.mixer().play("normal-low");
    runtime.mixer().play("occlusion");
    const mixed = runtime.applyPoseMixer(0.5, { restPoseReset: false });
    expect(mixed.materialTracksApplied).toBe(2);
    expect(mixed.missingTargets).toEqual([]);
    expect(material.writes.find((entry) => entry.parameter === "u_normalScale")?.value).toBeCloseTo(0.4);
    expect(material.writes.find((entry) => entry.parameter === "u_occlusionStrength")?.value).toBeCloseTo(0.5);
  });

  it.each(["missing-map", "disposed", "ambiguous", "unsupported"] as const)(
    "reports a %s binding in inspection, direct, blend, and pose-mixer application",
    (reason) => {
      const { scene } = buildScene();
      const material = textureSink("Car.body");
      material.statuses["u_normalScale"] = reason;
      const runtime = createGLTFSceneAnimationRuntime({
        scene, clips: [scalarClip("normal", normal, 0.2, 0.8)], resolveAnimationMaterial: () => material.sink
      });
      const [binding] = runtime.inspectClipBindings("normal");
      expect(binding).toMatchObject({
        supportedTrackCount: 1, boundTrackCount: 0, materialTrackCount: 1, missingTargetCount: 1,
        unsupportedTrackCount: 0, boundMaterialNames: [], missingTargets: [normal], materialBindingIssues: [{ target: normal, reason }]
      });
      const direct = runtime.applyClipByName("normal", 0.5);
      const blend = runtime.applyClips([{ clipName: "normal", time: 0.5 }]);
      runtime.mixer().play("normal");
      const pose = runtime.applyPoseMixer(0.5, { restPoseReset: false });
      for (const result of [direct, blend, pose]) {
        expect(result).toMatchObject({ materialTracksApplied: 0, missingTargets: [normal], unsupportedTracks: [], materialBindingIssues: [{ target: normal, reason }] });
      }
      expect(material.writes).toEqual([]);
    }
  );

  it("detects a binding that becomes disposed between inspection and atomic application", () => {
    const { scene } = buildScene();
    const writes: string[] = [];
    const sink: GLTFSceneAnimationMaterialSink = {
      name: "Car.body",
      setAnimationParameter: (parameter) => { writes.push(parameter); },
      animationParameterStatus: () => "available",
      applyAnimationParameter: () => "disposed"
    };
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [scalarClip("normal", normal, 0, 1)], resolveAnimationMaterial: () => sink });
    expect(runtime.inspectClipBindings("normal")[0]).toMatchObject({ boundTrackCount: 1, missingTargetCount: 0 });
    expect(runtime.applyClipByName("normal", 0.5)).toMatchObject({
      materialTracksApplied: 0, missingTargets: [normal], materialBindingIssues: [{ target: normal, reason: "disposed" }]
    });
    expect(writes).toEqual([]);
  });

  it("rechecks a missing map that later becomes available and then disposed", () => {
    const { scene } = buildScene();
    const material = textureSink("Car.body");
    material.statuses["u_normalScale"] = "missing-map";
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: [scalarClip("normal", normal, 0, 1)], resolveAnimationMaterial: () => material.sink
    });
    expect(runtime.inspectClipBindings("normal")[0]?.materialBindingIssues).toEqual([{ target: normal, reason: "missing-map" }]);
    material.statuses["u_normalScale"] = "available";
    expect(runtime.applyClipByName("normal", 0.5)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
    expect(runtime.inspectClipBindings("normal")[0]).toMatchObject({ boundTrackCount: 1, missingTargetCount: 0 });
    material.statuses["u_normalScale"] = "disposed";
    expect(runtime.applyClipByName("normal", 0.75)).toMatchObject({ materialTracksApplied: 0, materialBindingIssues: [{ target: normal, reason: "disposed" }] });
    expect(material.writes).toEqual([{ parameter: "u_normalScale", value: 0.5 }]);
  });

  it("fails closed for a legacy sink with no texture capability and for a missing dotted identity", () => {
    const { scene } = buildScene();
    const calls: { parameter: string; value: number | readonly number[] }[] = [];
    const clip = scalarClip("normal", normal, 0, 1);
    const legacy = createGLTFSceneAnimationRuntime({ scene, clips: [clip], resolveAnimationMaterial: () => buildSink("Car.body", calls) });
    expect(legacy.inspectClipBindings("normal")[0]).toMatchObject({
      supportedTrackCount: 1, boundTrackCount: 0, missingTargets: [normal], materialBindingIssues: [{ target: normal, reason: "unsupported" }]
    });
    expect(legacy.applyClipByName("normal", 0.5)).toMatchObject({ materialTracksApplied: 0, materialBindingIssues: [{ target: normal, reason: "unsupported" }] });
    const wrongPrefix = createGLTFSceneAnimationRuntime({
      scene, clips: [clip], resolveAnimationMaterial: (name) => name === "Car" ? buildSink(name, calls) : undefined
    });
    expect(wrongPrefix.applyClipByName("normal", 0.5)).toMatchObject({
      materialTracksApplied: 0, missingTargets: [normal], materialBindingIssues: [{ target: normal, reason: "missing-material" }]
    });
    expect(calls).toEqual([]);
  });

  it("does not mistake an unsupported texture transform or wrong value type for a bound scalar", () => {
    const { scene } = buildScene();
    const material = textureSink("Car");
    const transform = "material:Car.extensions.KHR_materials_clearcoat.clearcoatTexture.extensions.KHR_texture_transform.scale";
    const clip = new AnimationClip({ name: "other", tracks: [
      new AnimationTrack({ target: transform, valueType: "number-array", keyframes: [{ time: 0, value: [1, 1] }, { time: 1, value: [2, 2] }] }),
      new AnimationTrack({ target: "material:Car.normalTexture.scale", valueType: "number-array", keyframes: [{ time: 0, value: [1, 1] }, { time: 1, value: [2, 2] }] })
    ] });
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip], resolveAnimationMaterial: () => material.sink });
    expect(runtime.inspectClipBindings("other")[0]).toMatchObject({ supportedTrackCount: 0, boundTrackCount: 0, unsupportedTrackCount: 2 });
    expect(runtime.applyAnimationValues("other", 0, new Map([[transform, [1, 1]]]))).toMatchObject({
      materialTracksApplied: 0, missingTargets: [transform], unsupportedTracks: [transform], materialBindingIssues: [{ target: transform, reason: "unsupported" }]
    });
    expect(() => runtime.applyAnimationValues("bad-shape", 0, new Map([["material:Car.normalTexture.scale", [1, 1]]]))).toThrow(/invalid scalar/);
    expect(material.writes).toEqual([]);
  });

  it("rejects non-finite and out-of-domain scalars before writing while accepting boundary values", () => {
    const { scene } = buildScene();
    const material = textureSink("Car.body");
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], resolveAnimationMaterial: () => material.sink });
    for (const [target, value] of [[normal, -0.01], [occlusion, -0.01], [occlusion, 1.01]] as const) {
      expect(() => runtime.applyAnimationValues("bad-range", 0, new Map([[target, value]]))).toThrow(/out-of-range/);
    }
    expect(() => runtime.applyAnimationValues("not-finite", 0, new Map([[normal, Number.NaN]]))).toThrow(/invalid scalar/);
    expect(material.writes).toEqual([]);
    expect(runtime.applyAnimationValues("bounds", 0, new Map([[normal, 0], [occlusion, 1]]))).toMatchObject({ materialTracksApplied: 2, missingTargets: [] });
    expect(material.writes).toEqual([{ parameter: "u_normalScale", value: 0 }, { parameter: "u_occlusionStrength", value: 1 }]);
  });

  it("rejects an occlusion cubic that overshoots even when both key values are in range", () => {
    const { scene } = buildScene();
    const material = textureSink("Car.body");
    const clip = new AnimationClip({ name: "overshoot", tracks: [new AnimationTrack({
      target: occlusion, valueType: "scalar", keyframes: [
        { time: 0, value: 0.5, interpolation: "cubicspline", outTangent: 4 },
        { time: 1, value: 0.5, inTangent: -4 }
      ]
    })] });
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip], resolveAnimationMaterial: () => material.sink });
    expect(() => runtime.applyClipByName("overshoot", 0.5)).toThrow(/out-of-range/);
    expect(() => runtime.applyClips([{ clipName: "overshoot", time: 0.5 }])).toThrow(/out-of-range/);
    runtime.mixer().play("overshoot");
    expect(() => runtime.applyPoseMixer(0.5, { restPoseReset: false })).toThrow(/out-of-range/);
    expect(material.writes).toEqual([]);
  });
});

describe("GLTFSceneAnimationRuntime light pointer tracks", () => {
  it("drives intensity, color, and range on the name-matched scene light", () => {
    const { scene, point } = buildScene();
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [
        scalarClip("dim", "light:KeyLight.intensity", 3, 0.5),
        scalarClip("widen", "light:KeyLight.range", 10, 25)
      ]
    });

    const dim = runtime.applyClipByName("dim", 1);
    expect(dim.lightTracksApplied).toBe(1);
    expect(point.intensity).toBeCloseTo(0.5, 6);

    const widen = runtime.applyClipByName("widen", 1);
    expect(widen.lightTracksApplied).toBe(1);
    expect(point.range).toBeCloseTo(25, 6);

    const colorRuntime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [
        new AnimationClip({
          name: "tint",
          tracks: [
            new AnimationTrack({
              target: "light:KeyLight.color",
              valueType: "vector3",
              keyframes: [
                { time: 0, value: [1, 1, 1] },
                { time: 1, value: [1, 0.25, 0.1] }
              ]
            })
          ]
        })
      ]
    });
    const tint = colorRuntime.applyClipByName("tint", 1);
    expect(tint.lightTracksApplied).toBe(1);
    const color = point.color as readonly [number, number, number];
    expect([color[0], color[1], color[2]]).toEqual([1, 0.25, 0.1]);
  });

  it("reports unknown lights, range on a rangeless light, and unmapped leaves as missing", () => {
    const { scene } = buildScene();
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [
        scalarClip("ghost", "light:Nope.intensity", 1, 2),
        scalarClip("sun-range", "light:SunLight.range", 10, 20),
        scalarClip("odd-leaf", "light:KeyLight.spotAngle", 0, 1)
      ]
    });

    expect(runtime.applyClipByName("ghost", 1).missingTargets).toEqual(["light:Nope.intensity"]);
    expect(runtime.applyClipByName("sun-range", 1).missingTargets).toEqual(["light:SunLight.range"]);
    expect(runtime.applyClipByName("odd-leaf", 1).missingTargets).toEqual(["light:KeyLight.spotAngle"]);
  });

  it("exposes material/light binding diagnostics through inspectClipBindings", () => {
    const { scene } = buildScene();
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [
        scalarClip("mixed", "material:TestMat.emissiveStrength", 0, 1)
      ],
      resolveAnimationMaterial: (name) => (name === "TestMat" ? buildSink(name, []) : undefined)
    });
    const [diagnostics] = runtime.inspectClipBindings("mixed");
    expect(diagnostics?.materialTrackCount).toBe(1);
    expect(diagnostics?.lightTrackCount).toBe(0);
    expect(diagnostics?.boundMaterialNames).toEqual(["TestMat"]);
    expect(diagnostics?.boundLightNames).toEqual([]);
    expect(diagnostics?.unsupportedTrackCount).toBe(0);
  });
});
