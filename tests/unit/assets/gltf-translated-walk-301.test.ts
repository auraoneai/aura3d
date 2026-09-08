import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { extractRootMotion, measureRootMotionLoopClosure } from "@aura3d/animation";
import { GLTFLoader, LoadContext } from "../../../packages/assets/src";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";

describe("E01 authored translated articulated GLB walk", () => {
  it("retains source joint animation and advances through the authority without double translation", async () => {
    const file = "tests/fixtures/locomotion-301/rival-translated-walk.glb";
    const bytes = readFileSync(file);
    const provenance = JSON.parse(readFileSync(file + ".provenance.json", "utf8"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(provenance.outputSha256);
    expect(createHash("sha256").update(readFileSync(provenance.source)).digest("hex")).toBe(provenance.sourceSha256);
    const asset = await new GLTFLoader().load({url:`data:model/gltf-binary;base64,${bytes.toString("base64")}`,type:"gltf"},new LoadContext());
    const walk = asset.animations.find(clip => clip.name === "Aura301_Translated_Walk")!;
    const original = asset.animations.find(clip => clip.name === "Zombie_Walk_Fwd_Loop")!;
    expect(walk.tracks.length).toBe(original.tracks.length);
    for (const track of original.tracks.filter(track => track.target !== "root.translation")) {
      const derived = walk.tracks.find(candidate => candidate.target === track.target)!;
      for (const time of [0, walk.duration * 0.25, walk.duration * 0.75]) expect(derived.sample(time)).toEqual(track.sample(time));
    }
    expect(extractRootMotion(walk, { target:"root.translation", fromTime:0, toTime:walk.duration * 3, loop:true }).delta[2]).toBeCloseTo(1.5, 5);
    expect(measureRootMotionLoopClosure(walk, "root.translation").loopClosureError).toBeLessThan(1e-5);
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips:asset.animations, asset });
    let travel = 0; let commits = 0;
    for (let i = 1; i <= 180; i++) {
      runtime.applyRootMotionClip(walk.name, { target:"root.translation", fromTime:(i-1)*walk.duration/60, toTime:i*walk.duration/60, loop:true,
        worldFromLocal:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,travel,1], move: delta => { travel += delta[2]; commits++; return delta; } });
      scene.traverse(node => { if (node.name === "root") expect(node.transform.position).toEqual([0,0,0]); });
    }
    expect(commits).toBe(180); expect(travel).toBeCloseTo(1.5, 5);
    // This proves real articulated translated GLB consumption; stance quality is a separate browser gate.
  });
});

describe("E01 translated walk post-writeback contacts", () => {
  it.each([true,false])("measures actual sole surfaces with foot orientation lock=%s", async (lockFootRotation) => {
    const { createHeightFieldGround, measureLocomotionStances } = await import("@aura3d/animation");
    const bytes=readFileSync("tests/fixtures/locomotion-301/rival-translated-walk.glb");
    const asset=await new GLTFLoader().load({url:`data:model/gltf-binary;base64,${bytes.toString("base64")}`,type:"gltf"},new LoadContext());
    const bindScene=asset.createScene();bindScene.updateWorldTransforms();
    const runtime=createGLTFSceneAnimationRuntime({scene:bindScene,clips:asset.animations,asset});
    const walk=asset.animations.find(clip=>clip.name==="Aura301_Translated_Walk")!;
    const legs=[{side:"left" as const,hip:"thigh_l",knee:"calf_l",ankle:"foot_l"},{side:"right" as const,hip:"thigh_r",knee:"calf_r",ankle:"foot_r"}];
    const ground=createHeightFieldGround(()=>({height:0}));
    let z=0; let phase=0;
    const matrix=():[number,number,number,number,number,number,number,number,number,number,number,number,number,number,number,number]=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0.004,z+0.019,1];
    const refresh=()=>runtime.setFootPlanting({lockFootRotation,legs:legs.map(leg=>({...leg,contact:leg.side==="left" ? phase < 0.5 : phase >= 0.5})),ground,ankleHeight:0.0905,plantThreshold:0.025,worldFromLocal:matrix()});
    refresh();
    const samples:import("@aura3d/animation").LocomotionContactSample[]=[];
    const soles:import("@aura3d/animation").LocomotionContactSample[]=[];
    for(let frame=1;frame<=180;frame++){
      phase=((frame/60)%walk.duration)/walk.duration; refresh();
      const result=runtime.applyRootMotionClip(walk.name,{target:"root.translation",fromTime:(frame-1)/60,toTime:frame/60,loop:true,worldFromLocal:matrix(),move:delta=>{z+=delta[2];refresh();return delta;}});
      for(const leg of result.applyResult.footPlanting?.legDeformation??[])expect(leg.maxRelativeLengthChange).toBeLessThan(1e-3);
      for(const point of result.applyResult.footPlanting?.surfaces??[]) soles.push({time:frame/60,side:point.side,pointId:`${point.mesh}:${point.vertex}`,stance:result.applyResult.footPlanting?.lockedSides.includes(point.side)??false,supportId:"floor",supportLocalPosition:point.worldPosition,contactError:Math.abs(point.groundError??Infinity)});
      for(const foot of result.applyResult.footPlanting?.feet??[])samples.push({time:frame/60,side:foot.side,stance:foot.locked,supportId:"floor",supportLocalPosition:foot.worldPosition,contactError:foot.contactError});
    }
    const report=measureLocomotionStances(samples,1.869);
    console.log("E01 translated stance",JSON.stringify(report));
    expect(samples).toHaveLength(360);expect(report.intervals.length).toBeGreaterThan(2);
    expect(report.passed).toBe(true);
    const soleReport=measureLocomotionStances(soles,1.869);
    console.log("E01 sole evidence",JSON.stringify({points:soles.length,maxSlip:soleReport.maxSlip,worstContactError:soleReport.worstContactError,worst:[...soleReport.intervals].sort((a,b)=>b.maxSlip-a.maxSlip).slice(0,2)}));
    expect(soleReport.passed).toBe(lockFootRotation);
    if (lockFootRotation) expect(soleReport.worstContactError).toBeLessThanOrEqual(0.01869);
    else expect(soleReport.maxSlip).toBeGreaterThan(0.01869);
  });
});
