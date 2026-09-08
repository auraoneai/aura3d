import { describe, expect, it } from "vitest";
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
