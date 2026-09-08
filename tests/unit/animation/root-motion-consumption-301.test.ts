import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationMixer, AnimationTrack, consumeRootMotion, createFootIkRig, createHeightFieldGround } from "@aura3d/animation";
const clip = (distance = 2) => new AnimationClip({ name: `walk-${distance}`, duration: 1, tracks: [new AnimationTrack({target: "root.translation", valueType: "vector3", keyframes: [{time:0,value:[0,0,0]},{time:1,value:[0,0,distance]}]})] });
const options = {applyRootMotion:true, rootMotionTrack:"root.translation", consumeRootMotionTrack:true};
describe("3.0.1 consumed root motion", () => {
  it("retains multiple complete cycles and removes extracted pose motion", () => {
    const samples: number[]=[]; const values: unknown[]=[];
    const target={position:[0,0,0] as [number,number,number], consumeRootMotion:(sample: {delta:readonly number[]})=>samples.push(sample.delta[2]!), setAnimationValue:(_key:string,value:unknown)=>values.push(value)};
    const mixer=new AnimationMixer(target,options);mixer.play(clip());mixer.update(3.25);
    expect(samples).toEqual([6.5]);expect(values).toEqual([[0,0,0]]);expect(target.position).toEqual([0,0,0]);
    mixer.update(0.75);expect(samples).toEqual([6.5,1.5]);
  });
  it("blends deltas once with the same normalized base weights as poses",()=>{
    const received:number[]=[];const mixer=new AnimationMixer({consumeRootMotion:s=>received.push(s.delta[2])},options);
    mixer.play(clip(2));mixer.play(clip(4));mixer.update(0.5);expect(received).toEqual([1.5]);
  });
  it("does not emit travel when paused and applies scale to authority",()=>{
    const received:number[]=[];const mixer=new AnimationMixer({consumeRootMotion:s=>received.push(s.delta[2])},{...options,rootMotionScale:0.01});
    const action=mixer.play(clip(100));mixer.update(0.5);action.pause();mixer.update(2);expect(received).toEqual([0.5,0]);
  });
  it("turns imported displacement into world units and reports collision rejection without carry",()=>{
    const matrix=[0,0,-0.01,0, 0,0.01,0,0, 0.01,0,0,0, 50,0,80,1];
    const sample={target:"root.translation",fromTime:0,toTime:1,looped:false,delta:[0,0,100] as const};
    const result=consumeRootMotion(sample,matrix,requested=>[requested[0]*0.25,0,0]);
    expect(result).toEqual({requested:[1,0,0],accepted:[0.25,0,0],rejected:[0.75,0,0]});
  });
  it("holds authored stance against horizontal moving support and releases on swing",()=>{
    const ground=createHeightFieldGround(()=>({height:0}));
    const leg={side:"left" as const,hip:[0,1,0] as const,knee:[0,0.5,0.2] as const,ankle:[0,0.035,0] as const,contact:true,support:{id:"platform",delta:[0,0,0] as const}};
    const rig=createFootIkRig({legs:[leg],raycaster:ground});
    const initial=rig.solveFootPlacement().feet[0]!;expect(initial.locked).toBe(true);
    const moved=rig.solveFootPlacement({legs:[{...leg,hip:[0.1,1,0],knee:[0.1,0.5,0.2],ankle:[0.2,0.035,0],support:{id:"platform",delta:[0.1,0,0]}}]}).feet[0]!;
    expect(moved.sample.plantedFoot[0]).toBeCloseTo(0.1);expect(moved.sample.targetError).toBeLessThan(0.001);
    expect(rig.solveFootPlacement({legs:[{...leg,contact:false}]}).feet[0]!.locked).toBe(false);
  });
});
