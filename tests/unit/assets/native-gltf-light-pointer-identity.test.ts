import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { PointLight, Scene } from "@aura3d/scene";
import {
  createGLTFSceneAnimationMixer,
  createGLTFSceneAnimationRuntime,
  GLTFLoader,
  LoadContext,
  resolveAnimationPointerBinding,
  type GLTFJson
} from "../../../packages/assets/src";

type LightDefinition = { readonly name?: string; readonly type: "point" | "spot" | "directional"; readonly intensity?: number; readonly range?: number };
type Channel = { readonly pointer: string; readonly values: readonly number[]; readonly type?: "SCALAR" | "VEC3" };
type Clip = { readonly name: string; readonly channels: readonly Channel[] };
type Fixture = { readonly definitions: readonly LightDefinition[]; readonly nodes: readonly { readonly name: string; readonly light: number }[]; readonly clips: readonly Clip[] };

function fixtureUrl(fixture: Fixture): string {
  const chunks: Float32Array[] = [new Float32Array([0, 1])];
  const accessors: { bufferView: number; componentType: number; count: number; type: string }[] = [
    { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" }
  ];
  const animations = fixture.clips.map((clip) => {
    const samplers: { input: number; output: number }[] = [];
    const channels = clip.channels.map((channel) => {
      const bufferView = chunks.length;
      chunks.push(new Float32Array(channel.values));
      const type = channel.type ?? "SCALAR";
      const output = accessors.length;
      accessors.push({ bufferView, componentType: 5126, count: channel.values.length / (type === "VEC3" ? 3 : 1), type });
      const sampler = samplers.length;
      samplers.push({ input: 0, output });
      return { sampler, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer: channel.pointer } } } };
    });
    return { name: clip.name, samplers, channels };
  });
  let byteOffset = 0;
  const bufferViews = chunks.map((chunk) => {
    const view = { buffer: 0, byteOffset, byteLength: chunk.byteLength };
    byteOffset += chunk.byteLength;
    return view;
  });
  const binary = new Uint8Array(byteOffset);
  let cursor = 0;
  for (const chunk of chunks) {
    binary.set(new Uint8Array(chunk.buffer), cursor);
    cursor += chunk.byteLength;
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_lights_punctual", "KHR_animation_pointer"],
    extensions: { KHR_lights_punctual: { lights: fixture.definitions } },
    scene: 0,
    scenes: [{ nodes: fixture.nodes.map((_, index) => index) }],
    nodes: fixture.nodes.map((node) => ({ name: node.name, extensions: { KHR_lights_punctual: { light: node.light } } })),
    animations, accessors, bufferViews, buffers: [{ byteLength: binary.byteLength }]
  }));
  const paddedLength = (jsonBytes.length + 3) & ~3;
  const total = 12 + 8 + paddedLength + 8 + binary.length;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + paddedLength);
  glb.set(jsonBytes, 20);
  const binaryHeader = 20 + paddedLength;
  view.setUint32(binaryHeader, binary.length, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  glb.set(binary, binaryHeader + 8);
  let bytes = "";
  for (const byte of glb) bytes += String.fromCharCode(byte);
  return `data:model/gltf-binary;base64,${btoa(bytes)}`;
}

const pointer = (index: number, leaf: string) => `/extensions/KHR_lights_punctual/lights/${index}/${leaf}`;
const scalar = (index: number, leaf: string, from: number, to: number): Channel => ({ pointer: pointer(index, leaf), values: [from, to] });
const load = (fixture: Fixture) => new GLTFLoader().load({ url: fixtureUrl(fixture) }, new LoadContext());

function point(scene: Scene, name: string): PointLight {
  const light = scene.collectLights().find((candidate) => candidate.name === name);
  expect(light).toBeInstanceOf(PointLight);
  return light as PointLight;
}

describe("imported punctual-light animation identity", () => {
  it("binds the source definition, including dotted names, to every referencing node", async () => {
    const asset = await load({
      definitions: [{ name: "Hall.Lamp", type: "point", intensity: 1, range: 10 }],
      nodes: [{ name: "Fixture A", light: 0 }, { name: "Fixture B", light: 0 }],
      clips: [{ name: "animate", channels: [
        scalar(0, "intensity", 1, 4),
        { pointer: pointer(0, "color"), type: "VEC3", values: [1, 1, 1, 0.5, 0.25, 1] },
        scalar(0, "range", 10, 20)
      ] }]
    });
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations });
    expect(asset.animations[0]?.tracks.map((track) => track.target)).toEqual([
      "light:Hall.Lamp.intensity", "light:Hall.Lamp.color", "light:Hall.Lamp.range"
    ]);
    expect(runtime.inspectClipBindings("animate")[0]).toMatchObject({ boundTrackCount: 3, missingTargetCount: 0 });
    expect(runtime.applyClipByName("animate", 1)).toMatchObject({ lightTracksApplied: 3, missingTargets: [] });
    for (const light of [point(scene, "Fixture A"), point(scene, "Fixture B")]) {
      expect(light.intensity).toBe(4);
      expect(light.range).toBe(20);
      expect(light.color).toEqual([0.5, 0.25, 1]);
    }
    expect(point(scene, "Fixture A").color).not.toBe(point(scene, "Fixture B").color);
  });

  it("keeps duplicate definitions distinct through direct, blended and pose-mixer playback", async () => {
    const asset = await load({
      definitions: [{ name: "Shared", type: "point" }, { name: "Shared", type: "point" }],
      nodes: [{ name: "One", light: 0 }, { name: "Two", light: 1 }],
      clips: [{ name: "both", channels: [scalar(0, "intensity", 1, 4), scalar(1, "intensity", 1, 8)] }]
    });
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations });
    expect(asset.animations[0]?.tracks.map((track) => track.target)).toEqual(["light-index:0.intensity", "light-index:1.intensity"]);
    expect(runtime.applyClipByName("both", 1).lightTracksApplied).toBe(2);
    expect([point(scene, "One").intensity, point(scene, "Two").intensity]).toEqual([4, 8]);
    expect(runtime.applyClips([{ clipName: "both", time: 0.5 }]).lightTracksApplied).toBe(2);
    expect([point(scene, "One").intensity, point(scene, "Two").intensity]).toEqual([2.5, 4.5]);
    runtime.mixer().play("both");
    expect(runtime.applyPoseMixer(0.5, { restPoseReset: false }).lightTracksApplied).toBe(2);
    expect([point(scene, "One").intensity, point(scene, "Two").intensity]).toEqual([2.5, 4.5]);
  });

  it("applies a scoped track through the generic animation mixer", async () => {
    const asset = await load({
      definitions: [{ name: "Lamp", type: "point" }], nodes: [{ name: "Fixture", light: 0 }],
      clips: [{ name: "brightness", channels: [scalar(0, "intensity", 1, 5)] }]
    });
    const scene = asset.createScene();
    const mixer = createGLTFSceneAnimationMixer({ scene, clips: asset.animations });
    expect(mixer.update(0.5).applyResult.lightTracksApplied).toBe(1);
    expect(point(scene, "Fixture").intensity).toBe(3);
  });

  it("never applies an imported track to another asset with the same name and index", async () => {
    const fixture: Fixture = {
      definitions: [{ name: "Lamp", type: "point" }], nodes: [{ name: "Lamp", light: 0 }],
      clips: [{ name: "brightness", channels: [scalar(0, "intensity", 1, 9)] }]
    };
    const [source, other] = await Promise.all([load(fixture), load(fixture)]);
    const scene = other.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: source.animations });
    expect(runtime.inspectClipBindings("brightness")[0]).toMatchObject({ boundTrackCount: 0, missingTargets: ["light:Lamp.intensity"] });
    expect(runtime.applyClipByName("brightness", 1).missingTargets).toEqual(["light:Lamp.intensity"]);
    expect(runtime.applyClips([{ clipName: "brightness", time: 1 }]).missingTargets).toEqual(["light:Lamp.intensity"]);
    runtime.mixer().play("brightness");
    expect(runtime.applyPoseMixer(0.5, { restPoseReset: false }).missingTargets).toEqual(["light:Lamp.intensity"]);
    expect(point(scene, "Lamp").intensity).toBe(1);
  });

  it.each(["clip", "blend", "pose-mixer", "action-mixer"] as const)("isolates same-asset light actors through %s", async (mode) => {
    const asset = await load({
      definitions: [{ name: "Lamp", type: "point" }], nodes: [{ name: "Lamp", light: 0 }],
      clips: [{ name: "brightness", channels: [scalar(0, "intensity", 1, 5)] }]
    });
    const scene = new Scene();
    const first = asset.createScene();
    const second = asset.createScene();
    scene.root.addChild(first.root);
    scene.root.addChild(second.root);
    const ambiguous = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations });
    expect(ambiguous.applyClipByName("brightness", 0.5).missingTargets).toContain("light:Lamp.intensity");
    ambiguous.dispose();
    const options = { scene, clips: asset.animations, actorRoot: second.root };
    const mixer = mode === "action-mixer" ? createGLTFSceneAnimationMixer(options) : undefined;
    const runtime = mixer?.runtime ?? createGLTFSceneAnimationRuntime(options);
    try {
      if (mode === "pose-mixer") runtime.mixer().play("brightness");
      const result = mode === "clip" ? runtime.applyClipByName("brightness", 0.5)
        : mode === "blend" ? runtime.applyClips([{ clipName: "brightness", time: 0.5 }])
          : mode === "pose-mixer" ? runtime.applyPoseMixer(0.5)
            : mixer!.update(0.5).applyResult;
      expect(result.missingTargets).toEqual([]);
      expect(point(first, "Lamp").intensity).toBe(1);
      expect(point(second, "Lamp").intensity).toBe(3);
    } finally {
      if (mixer) mixer.dispose();
      else runtime.dispose();
    }
  });

  it("keeps same-name source tracks independent when asset scenes are combined", async () => {
    const make = (name: string, node: string, value: number): Fixture => ({
      definitions: [{ name: "Lamp", type: "point" }], nodes: [{ name: node, light: 0 }],
      clips: [{ name, channels: [scalar(0, "intensity", 1, value)] }]
    });
    const [assetA, assetB] = await Promise.all([load(make("A", "First", 3)), load(make("B", "Second", 7))]);
    const scene = new Scene();
    scene.root.addChild(assetA.createScene().root);
    scene.root.addChild(assetB.createScene().root);
    const clips = [...assetA.animations, ...assetB.animations];
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips });
    expect(runtime.applyClips([{ clipName: "A", time: 1 }, { clipName: "B", time: 1 }]).lightTracksApplied).toBe(2);
    expect([point(scene, "First").intensity, point(scene, "Second").intensity]).toEqual([3, 7]);

    // The generic mixer has already combined colliding public targets before
    // binding; it reports the ambiguity instead of writing either instance.
    point(scene, "First").intensity = 1;
    point(scene, "Second").intensity = 1;
    const mixer = createGLTFSceneAnimationMixer({ scene, clips, autoPlay: false });
    mixer.play("A");
    mixer.play("B");
    expect(mixer.update(0.5).applyResult.missingTargets).toContain("light:Lamp.intensity");
    expect([point(scene, "First").intensity, point(scene, "Second").intensity]).toEqual([1, 1]);
  });

  it("preserves manually authored name tracks and reports unavailable imported bindings", async () => {
    const asset = await load({
      definitions: [{ name: "Sun", type: "directional" }, { name: "Unused", type: "point" }],
      nodes: [{ name: "Sun node", light: 0 }],
      clips: [{ name: "unavailable", channels: [scalar(0, "range", 10, 20), scalar(1, "intensity", 1, 5)] }]
    });
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations });
    expect(runtime.inspectClipBindings("unavailable")[0]?.missingTargets).toEqual(["light:Sun.range", "light:Unused.intensity"]);
    expect(runtime.applyClipByName("unavailable", 1).missingTargets).toEqual(["light:Sun.range", "light:Unused.intensity"]);
    const manual = new AnimationClip({ name: "manual", tracks: [new AnimationTrack({
      target: "light:Sun node.intensity", valueType: "scalar", keyframes: [{ time: 0, value: 1 }, { time: 1, value: 3 }]
    })] });
    expect(runtime.applyClip(manual, 1).lightTracksApplied).toBe(1);
    expect(scene.collectLights()[0]?.intensity).toBe(3);
  });

  it("rejects noncanonical or nested light pointers and distinguishes normalized-name collisions", () => {
    const json = { asset: { version: "2.0" }, extensions: { KHR_lights_punctual: { lights: [
      { name: "light-1", type: "point" }, { type: "point" }
    ] } } } as unknown as GLTFJson;
    expect(resolveAnimationPointerBinding(json, "/lights/0/intensity")?.target).toBe("light-index:0.intensity");
    expect(resolveAnimationPointerBinding(json, "/lights/1/intensity")?.target).toBe("light-index:1.intensity");
    for (const invalid of ["/lights/00/intensity", "/lights/0/spot/intensity", "/lights/0/intensity\n", "/lights/0/intensity/unused"]) {
      expect(resolveAnimationPointerBinding(json, invalid)).toBeUndefined();
    }
  });

  it("does not guess an indexed definition after the track identity is serialized away", async () => {
    const asset = await load({
      definitions: [{ name: "Duplicate", type: "point" }, { name: "Duplicate", type: "point" }],
      nodes: [{ name: "A", light: 0 }, { name: "B", light: 1 }],
      clips: [{ name: "original", channels: [scalar(0, "intensity", 1, 5)] }]
    });
    const original = asset.animations[0]!;
    const reconstructed = AnimationClip.fromJSON(original.toJSON());
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [reconstructed] });
    expect(runtime.applyClipByName("original", 1).missingTargets).toEqual(["light-index:0.intensity"]);
    expect([point(scene, "A").intensity, point(scene, "B").intensity]).toEqual([1, 1]);
  });

  it("rejects invalid intensity before updating any shared instance", async () => {
    const asset = await load({
      definitions: [{ name: "Lamp", type: "point" }], nodes: [{ name: "A", light: 0 }, { name: "B", light: 0 }],
      clips: [{ name: "invalid", channels: [scalar(0, "intensity", 1, -1)] }]
    });
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations });
    expect(() => runtime.applyClipByName("invalid", 1)).toThrow();
    expect([point(scene, "A").intensity, point(scene, "B").intensity]).toEqual([1, 1]);
  });
});
