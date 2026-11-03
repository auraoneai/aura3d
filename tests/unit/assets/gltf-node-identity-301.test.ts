import { describe, expect, it } from "vitest";
import { AnimationClip } from "@aura3d/animation";
import { GLTFLoader, LoadContext } from "../../../packages/assets/src";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
async function fixture() {
  const data=new Float32Array([0,1, 0,0,0, 0,0,1]);
  const json={asset:{version:"2.0"},scene:0,scenes:[{nodes:[0,1,2,3]}],nodes:[{name:"root"},{name:"root"},{name:"root_1"},{name:"_root"}],
    buffers:[{byteLength:data.byteLength,uri:`data:application/octet-stream;base64,${Buffer.from(data.buffer).toString("base64")}`}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:8},{buffer:0,byteOffset:8,byteLength:24}],
    accessors:[{bufferView:0,componentType:5126,count:2,type:"SCALAR",min:[0],max:[1]},{bufferView:1,componentType:5126,count:2,type:"VEC3"}],
    animations:[{name:"travel",samplers:[{input:0,output:1}],channels:[{sampler:0,target:{node:0,path:"translation"}}]}]};
  return new GLTFLoader().load({url:`data:model/gltf+json;base64,${Buffer.from(JSON.stringify(json)).toString("base64")}`,type:"gltf"},new LoadContext());
}
describe("GLTF authored node identities",()=>{
  it("separates duplicate and suffixed authored names from the synthetic scene root",async()=>{
    const asset=await fixture();const scene=asset.createScene();const names:string[]=[];
    scene.traverse(node=>names.push(node.name));expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(["root","root_2","root_1","_root","__root"]));
    const runtime=createGLTFSceneAnimationRuntime({scene,clips:asset.animations,asset});runtime.applyClipByName("travel",1);
    expect(scene.root.transform.position).toEqual([0,0,0]);
    scene.traverse(node=>{if(node.userData.gltfNodeIndex===0)expect(node.transform.position).toEqual([0,0,1]);});
  });
});

async function duplicateAnimationFixture() {
  const data = new Float32Array([
    0, 1,
    0, 0, 0, 4, 0, 0,
    0, 0, 0, 8, 0, 0,
    0.2, 0.9
  ]);
  const document = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer"],
    buffers: [{ byteLength: data.byteLength, uri: `data:application/octet-stream;base64,${Buffer.from(data.buffer).toString("base64")}` }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 24 },
      { buffer: 0, byteOffset: 32, byteLength: 24 },
      { buffer: 0, byteOffset: 56, byteLength: 8 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 3, componentType: 5126, count: 2, type: "SCALAR" }
    ],
    materials: [{ name: "paint", pbrMetallicRoughness: { metallicFactor: 0.2 } }],
    scenes: [{ nodes: [0, 1] }],
    scene: 0,
    nodes: [{ name: "duplicate" }, { name: "duplicate" }],
    animations: [
      {
        name: "same-name",
        samplers: [{ input: 0, output: 1 }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      },
      {
        name: "same-name",
        samplers: [{ input: 0, output: 2 }],
        channels: [{ sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer: "/nodes/1/translation" } } } }]
      },
      {
        name: "material",
        samplers: [{ input: 0, output: 3 }],
        channels: [{ sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer: "/materials/0/pbrMetallicRoughness/metallicFactor" } } } }]
      }
    ]
  };
  const url = `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;
  return new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
}

describe("glTF animation track source identity", () => {
  it("addresses ordinary and node-pointer channels by track object, not duplicate clip names or target text", async () => {
    const asset = await duplicateAnimationFixture();
    const otherAsset = await duplicateAnimationFixture();
    const [first, second, material] = asset.animations;
    expect([first!.name, second!.name]).toEqual(["same-name", "same-name"]);
    expect(asset.nodeIndexForTrack?.(first!.tracks[0]!)).toBe(0);
    expect(asset.nodeIndexForTrack?.(second!.tracks[0]!)).toBe(1);
    expect(asset.nodeIndexForTrack?.(material!.tracks[0]!)).toBeUndefined();
    expect(asset.nodeIndexForTrack?.(otherAsset.animations[0]!.tracks[0]!)).toBeUndefined();
    expect(asset.nodeIndexForTrack?.(AnimationClip.fromJSON(first!.toJSON()).tracks[0]!)).toBeUndefined();
    // The public animation targets and serialized clip shape remain unchanged.
    expect(first!.tracks[0]!.target).toBe("duplicate.translation");
    expect(second!.tracks[0]!.target).toBe("duplicate_1.translation");
    expect(first!.toJSON().tracks[0]).not.toHaveProperty("gltfNodeIndex");
  });

  it.each([true, false])("lets the runtime animate renamed duplicate-name clips with explicit track lookup=%s", async (explicitLookup) => {
    const asset = await duplicateAnimationFixture();
    const scene = asset.createScene();
    const nodes = [...scene.root.children];
    nodes.forEach((node) => { node.name = "renamed"; });
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: asset.animations, asset,
      ...(explicitLookup ? { nodeIndexForTrack: asset.nodeIndexForTrack } : {})
    });
    try {
      expect(runtime.applyClip(asset.animations[0]!, 1)).toMatchObject({ transformTracksApplied: 1, missingTargets: [] });
      expect(nodes.map((node) => node.transform.position[0])).toEqual([4, 0]);
      expect(runtime.applyClip(asset.animations[1]!, 1)).toMatchObject({ transformTracksApplied: 1, missingTargets: [] });
      expect(nodes.map((node) => node.transform.position[0])).toEqual([4, 8]);
    } finally {
      runtime.dispose();
    }
  });
});
