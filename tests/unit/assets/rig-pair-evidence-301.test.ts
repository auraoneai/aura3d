import { describe, expect, it } from "vitest";
import { createHumanoidRetargetingMap, REQUIRED_HUMANOID_BONES, retargetHumanoidPose, type HumanoidRigDefinition } from "../../../packages/animation/src/index.js";
import { compareMappedPose, CERTIFIED_RIG_ROSTER, PAIR_CONTACT_PROFILES, TRANSLATED_LOCOMOTION_SOURCE } from "../../../tools/locomotion-301/rig-pair-evidence.js";
const rig: HumanoidRigDefinition = {id:"test",bones:Object.fromEntries(REQUIRED_HUMANOID_BONES.map(name=>[name,{name,length:1}]))};
const pose = {bones:Object.fromEntries(REQUIRED_HUMANOID_BONES.map(name=>[name,{position:{x:0,y:1,z:0},rotation:{x:0,y:0,z:0,w:1}}]))};
describe("measured rig pair evidence",()=>{
  it("retains four certified targets and a distinct translated donor",()=>{expect(CERTIFIED_RIG_ROSTER).toHaveLength(4);expect(TRANSLATED_LOCOMOTION_SOURCE.rigId).toBe("rivalTranslatedWalk");expect(CERTIFIED_RIG_ROSTER.some(row=>String(row.rigId)===TRANSLATED_LOCOMOTION_SOURCE.rigId)).toBe(false);});
  it("binds every target to measured nonempty contact windows",()=>{expect(Object.keys(PAIR_CONTACT_PROFILES).sort()).toEqual(CERTIFIED_RIG_ROSTER.map(row=>row.rigId).sort());for(const profile of Object.values(PAIR_CONTACT_PROFILES))for(const side of ['left','right'] as const)expect(profile[side].length).toBeGreaterThan(0);});
  it("admits same-rig sampled local identity with measured values",()=>{
    const map=createHumanoidRetargetingMap(rig,rig);
    const result=compareMappedPose(pose,retargetHumanoidPose(pose,map),map);
    expect(result.identityPreserved).toBe(true);
    expect(result.comparedBones).toBe(REQUIRED_HUMANOID_BONES.length);
  });
  it("never claims cross-rig visual quality from numerically equal poses",()=>{
    const map=createHumanoidRetargetingMap(rig,{...rig,id:"different"});
    expect(compareMappedPose(pose,pose,map).identityPreserved).toBe(false);
  });
  it("rejects missing pose, changed position, invalid quaternion and NaN",()=>{
    const map=createHumanoidRetargetingMap(rig,rig);
    expect(compareMappedPose({bones:{}},{bones:{}},map).identityPreserved).toBe(false);
    for(const transform of [{position:{x:3,y:1,z:0},rotation:{x:0,y:0,z:0,w:1}},
      {position:{x:0,y:1,z:0},rotation:{x:0,y:0,z:0,w:0}},
      {position:{x:NaN,y:1,z:0},rotation:{x:0,y:0,z:0,w:1}}]) {
      expect(compareMappedPose(pose,{bones:{...pose.bones,hips:transform}},map).identityPreserved).toBe(false);
    }
  });
});

import { measureWorldGeometry } from "../../../tools/locomotion-301/rig-pair-evidence.js";
describe("world geometry diagnostics",()=>{
  it("measures actual segment stretch and joint penetration without asserting contact",()=>{
    const simple: HumanoidRigDefinition={id:"measurement",bones:{leftUpperLeg:{name:"hip"},leftLowerLeg:{name:"knee"},leftFoot:{name:"foot"}}};
    const bind={hip:[0,2,0],knee:[0,1,0],foot:[0,0,0]} as const;
    const pose={hip:[0,2,0],knee:[0,1,0],foot:[0,-0.5,0]} as const;
    const result=measureWorldGeometry(simple,bind,pose);
    expect(result.maxRelativeSegmentLengthChange).toBe(0.5);
    expect(result.contactGeometry.feet[0]?.heightAboveBindPlane).toBe(-0.5);
    expect(result.complete).toBe(false);
  });
  it("retains missing segments and cannot manufacture a plane from missing feet",()=>{
    const result=measureWorldGeometry({id:"empty",bones:{}},{},{});
    expect(result.segments).toHaveLength(0);
    expect(result.missingSegments.length).toBeGreaterThan(0);
    expect(result.contactGeometry.supportY).toBeNull();
    expect(result.maxRelativeSegmentLengthChange).toBeNull();
  });
});

import {AnimationClip,AnimationTrack} from '../../../packages/animation/src/index.js';
import {consumePairRootTranslation,createBrowserFixture,preserveTargetBindShape,resolvePairCorrectionDisposition} from '../../../tools/locomotion-301/rig-pair-evidence.js';
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
describe('authored pair root consumption and fixture binding',()=>{
 const source={rig,nodeIdentities:{hips:{index:0,path:'nodes[0]',skinJoint:true,parentName:null}},parentWorldMatrices:{hips:identity},bindPose:pose,meshBindHeight:2};
 const translated=new AnimationClip({name:'translated walk',tracks:[new AnimationTrack({target:'hips.translation',valueType:'vector3',keyframes:[{time:0,value:[0,1,0] as [number,number,number]},{time:1,value:[0,1,2] as [number,number,number]}]})]});
 it('removes mapped root translation exactly once and preserves input pose',()=>{const input={bones:{...pose.bones,hips:{position:{x:0,y:1,z:1},rotation:{x:0,y:0,z:0,w:1}}}};const out=consumePairRootTranslation(input,createHumanoidRetargetingMap(rig,rig),source,{meshBindHeight:2},translated,.5);expect(out.cumulative).toEqual([0,0,1]);expect(out.cycleDelta).toEqual([0,0,2]);expect(out.pose.bones.hips?.position).toEqual({x:0,y:1,z:0});expect(input.bones.hips.position.z).toBe(1);expect(out.consumedBone).toBe('hips');});
 it('scales root travel by measured mesh ratio and transforms source parent axes',()=>{const rotated={...source,parentWorldMatrices:{hips:[0,0,-1,0,0,1,0,0,1,0,0,0,0,0,0,1]}};expect(consumePairRootTranslation(pose,createHumanoidRetargetingMap(rig,rig),rotated,{meshBindHeight:4},translated,.5).cumulative).toEqual([2,0,0]);});
 it('labels zero travel as a negative control instead of translated evidence',()=>{const clip=new AnimationClip({name:'idle',tracks:[]});const out=consumePairRootTranslation(pose,createHumanoidRetargetingMap(rig,rig),source,{meshBindHeight:2},clip,0);expect(out.classification).toBe('in-place-zero-travel-control');expect(out.cumulative).toEqual([0,0,0]);});
 it('preserves target bind translations and scale while retaining retargeted rotation',()=>{const rotation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};const out=preserveTargetBindShape({bones:{hips:{position:{x:9,y:8,z:7},rotation,scale:{x:3,y:3,z:3}}}},{bones:{hips:{position:{x:1,y:2,z:3},rotation:{x:0,y:0,z:0,w:1},scale:{x:2,y:2,z:2}}}});expect(out.bones.hips).toEqual({position:{x:1,y:2,z:3},rotation,scale:{x:2,y:2,z:2}});});
 it('rejects animated ancestor transforms instead of using stale bind axes',()=>{const sourceWithParent={...source,nodeIdentities:{...source.nodeIdentities,hips:{index:1,path:'nodes[0]/nodes[1]',skinJoint:true,parentName:'parent'},parent:{index:0,path:'nodes[0]',skinJoint:false,parentName:null}}};const clip=new AnimationClip({name:'turning parent',tracks:[...translated.tracks,new AnimationTrack({target:'parent.rotation',valueType:'quaternion',keyframes:[{time:0,value:[0,0,0,1] as [number,number,number,number]},{time:1,value:[0,1,0,0] as [number,number,number,number]}]})]});expect(()=>consumePairRootTranslation(pose,createHumanoidRetargetingMap(rig,rig),sourceWithParent,{meshBindHeight:2},clip,.5)).toThrow('Unsupported animated root parent transform');});
 it('permits only bind-equivalent constant ancestor tracks with zero cubic tangents',()=>{
  const sourceWithParent={...source,bindPose:{bones:{...pose.bones,parent:{rotation:{x:0,y:0,z:0,w:1}}}},nodeIdentities:{...source.nodeIdentities,hips:{index:1,path:'nodes[0]/nodes[1]',skinJoint:true,parentName:'parent'},parent:{index:0,path:'nodes[0]',skinJoint:false,parentName:null}}};
  for(const [value,tangent,valid]of [[[0,0,0,1],[0,0,0,0],true],[[0,Math.SQRT1_2,0,Math.SQRT1_2],[0,0,0,0],false],[[0,0,0,1],[0,1,0,0],false]] as const){
   const clip=new AnimationClip({name:'constant parent',tracks:[...translated.tracks,new AnimationTrack({target:'parent.rotation',valueType:'quaternion',keyframes:[{time:0,value,interpolation:'cubicspline',outTangent:tangent},{time:1,value,inTangent:tangent}]})]});
   const run=()=>consumePairRootTranslation(pose,createHumanoidRetargetingMap(rig,rig),sourceWithParent,{meshBindHeight:2},clip,.5);
   if(valid)expect(run().cumulative).toEqual([0,0,1]);else expect(run).toThrow('Unsupported animated root parent transform');
  }
 });
 it('serializes each measured mesh transform from its own rig row',()=>{const evidence={rigs:[{rig,meshBindTransforms:{mesh:identity},meshSkinBindings:{},clips:[]}],pairs:[]} as unknown as Parameters<typeof createBrowserFixture>[0];expect(createBrowserFixture(evidence).rigs[0]?.meshBindTransforms).toEqual({mesh:identity});});
 it('closes only rendered pair-specific correction dispositions',()=>{
  const base={source:'a',target:'b',map:{ok:true,coverage:.8,requiredCoverage:.7},correctionValues:{schema:'aura3d-rig-pair-correction/v1'}};
  expect(resolvePairCorrectionDisposition(base,true).status).toBe('measured-pair-correction-applied');
  expect(resolvePairCorrectionDisposition({...base,target:'a'},true).status).toBe('explicit-no-pair-map-correction');
  expect(resolvePairCorrectionDisposition(base,false).status).toBe('open');
  expect(resolvePairCorrectionDisposition({...base,map:{...base.map,ok:false}},true).status).toBe('open');
 });
 it('serializes translated donor duration even though the donor is outside the target roster',()=>{
   const evidence={translatedSource:{clip:'walk',duration:1.25},unsupportedSourceClips:[],rigs:[{rig,meshBindTransforms:{},meshSkinBindings:{}}],pairs:[{source:'donor',target:rig.id,map:{},sourceAssetSha256:'a',targetAssetSha256:'b',decision:'open',correctionValues:null,samples:[{clip:'walk',clipSha256:'c',time:0,sourcePose:pose,targetPose:pose,worldGeometry:{},rootMotion:{}}]}]} as unknown as Parameters<typeof createBrowserFixture>[0];
   expect(createBrowserFixture(evidence).pairs[0]?.duration).toBe(1.25);
 });
});
