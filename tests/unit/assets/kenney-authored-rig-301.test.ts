import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext, type GLTFAsset } from "../../../packages/assets/src";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
import { multiplyMat4, transformPoint } from "@aura3d/scene";
import { measureCertifiedRig } from "../../../tools/locomotion-301/rig-pair-evidence";
import { createHumanoidRetargetingMap } from "@aura3d/animation";
const source="public/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb";
const candidate="tests/fixtures/locomotion-301/kenney-articulated-candidate.glb";
async function load(file:string){return new GLTFLoader().load({url:`data:model/gltf-binary;base64,${readFileSync(file).toString("base64")}`,type:"gltf"},new LoadContext());}
function vertices(asset:GLTFAsset, angle=0, clipTime?:number){
  const scene=asset.createScene();
  if(clipTime!==undefined)createGLTFSceneAnimationRuntime({scene,clips:asset.animations,asset}).applyClipByName("walk",clipTime);scene.traverse(node=>{if(node.name==="leftLowerLeg")node.transform.setRotation(Math.sin(angle/2),0,0,Math.cos(angle/2));});scene.updateWorldTransforms();
  const mesh=asset.meshes[0]!,skin=asset.skins[0]!;
  const matrices=skin.jointNames.map((name,index)=>{let matrix=skin.jointBindMatrices[index]!;scene.traverse(node=>{if(node.name===name)matrix=node.transform.worldMatrix;});return multiplyMat4([...matrix],[...skin.inverseBindMatrices[index]!]);});
  return mesh.positions.map((point,i)=>{const result=[0,0,0];for(let influence=0;influence<4;influence++){const weight=mesh.weights[i]![influence]!;const position=transformPoint(matrices[mesh.joints[i]![influence]!]!,[...point]);for(let axis=0;axis<3;axis++)result[axis]!+=position[axis]!*weight;}return result;});
}
describe("authored Kenney articulated candidate",()=>{
 it("retains mesh attributes and bind shape while actual new knee weights deform vertices",async()=>{
  const [a,b]=await Promise.all([load(source),load(candidate)]);
  for(const key of ["positions","normals","indices","texcoords"]as const)expect(b.meshes[0]![key]).toEqual(a.meshes[0]![key]);
  const before=vertices(a),after=vertices(b),bent=vertices(b,0.5);
  const maxError=Math.max(...before.map((v,i)=>Math.hypot(...v.map((x,j)=>x-after[i]![j]!))));
  expect(maxError).toBeLessThan(1e-6);
  // New chains inherit source motion until retargeted: source walking geometry stays identical.
  for(const time of [0,0.17,0.34,0.5]){
    const original=vertices(a,0,time),derived=vertices(b,0,time);
    expect(Math.max(...original.map((v,i)=>Math.hypot(...v.map((x,j)=>x-derived[i]![j]!))))).toBeLessThan(1e-6);
  }
  expect(bent.filter((v,i)=>Math.hypot(...v.map((x,j)=>x-after[i]![j]!))>0.001).length).toBeGreaterThan(10);
  const weighted=new Set<number>();b.meshes[0]!.weights.forEach((weights,i)=>weights.forEach((weight,j)=>{if(weight>0)weighted.add(b.meshes[0]!.joints[i]![j]!);}));
  for(let index=6;index<b.skins[0]!.joints.length;index++)expect(weighted.has(index),b.skins[0]!.jointNames[index]).toBe(true);
 });
 it("provides real required humanoid chain bindings without aliases",async()=>{
  const rig=await measureCertifiedRig("kenney-articulated-candidate",candidate);
  expect(rig.missingRequired).toEqual([]);expect(createHumanoidRetargetingMap(rig.rig,rig.rig).ok).toBe(true);
 });
});
