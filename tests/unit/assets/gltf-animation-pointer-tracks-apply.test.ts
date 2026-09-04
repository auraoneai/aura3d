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
