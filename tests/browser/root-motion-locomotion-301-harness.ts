import { runSkinningOracle, type SkinningOracleInput } from "./locomotion-skinning-oracle";
import { camera, createAnimationController, createAuraApp, game, lights, material, model, navigation, primitives, scene } from "@aura3d/engine";
import { assets } from "../fixtures/locomotion-301/src/aura-assets";

type Vec = readonly [number, number, number];
interface Frame { heading: number; deformation: readonly {side:"left"|"right";upperBefore:number;upperAfter:number;lowerBefore:number;lowerAfter:number;maxRelativeLengthChange:number}[]; surfaces: readonly {side:"left"|"right";mesh:string;vertex:number;worldPosition:Vec;groundError:number|null}[]; time: number; position: Vec; requested: Vec; accepted: Vec; rejected: Vec; feet: readonly { side: "left" | "right"; worldPosition: Vec; locked: boolean; contactError: number }[]; }
interface Evidence { status: string; scenario: string; frames: Frame[]; error?: string; backend?: unknown; navigation?: unknown; renderer?: unknown; gpuOracle?: {maximumError:number;minimumNegativeDelta:number;probes:number}; pixels?: { changed: number; colored: number }; rigHeight: number; }
declare global { interface Window { __AURA301_LOCOMOTION__?: Evidence; } }
const scenario = new URLSearchParams(location.search).get("scenario") ?? "straight";
const evidence: Evidence = { status:"loading", scenario, frames:[], rigHeight:1.869 };
window.__AURA301_LOCOMOTION__ = evidence;
void run().catch(error => { evidence.status="error"; evidence.error=String(error); });
async function run(): Promise<void> {
  const dt=1/60; const duration=1.3333333730697632;
  const slope = scenario === "slope" ? 0.08 : 0;
  const app = createAuraApp(document.querySelector<HTMLElement>("#stage")!, {
    autoStart:false, resize:false, pixelRatio:1, physics:{gravity:[0,-9.81,0],seed:301},
    renderer:{mode:"production",qualityProfile:"production",fallback:"safe-basic"},
    scene:scene().background("#10131b").camera(camera.perspective({position:[4,3,5],target:[0,0.8,1],fov:45})).add(
      model(assets.rivalTranslatedWalk,{name:"translated walker"}).scale(1.869 / 1.55).animate({clip:"Aura301_Translated_Walk",loop:true,captureTime:0,speed:1}).runtime(game.runtimeNode("walker"))
    ).add(
      primitives.box({name:"ground",material:material.pbr({color:"#777f8a",roughness:0.9})}).position(0,2*slope-0.05*Math.sqrt(1+slope*slope),2).rotate(-Math.atan(slope),0,0).scale([8,0.1,8])
    ).add(lights.studio())
  });
  await app.stepAsync(0);
  const node=app.nodes.require("walker");
  const body=app.physics.createBody({name:"physical-walker",shape:"sphere",radius:0.16,mass:1,position:[0,0.16,0]});
  app.physics.createBody({name:"physical-ground",type:"static",shape:"convexHull",vertices:[
    [-4,-1,-4],[4,-1,-4],[-4,-1,4],[4,-1,4],
    [-4,-4*slope,-4],[4,-4*slope,-4],[-4,4*slope,4],[4,4*slope,4]
  ],indices:[0,1,3,0,3,2,4,6,7,4,7,5,0,4,5,0,5,1,2,3,7,2,7,6,0,2,6,0,6,4,1,5,7,1,7,3]});
  if(scenario==="blocked")app.physics.createBody({name:"blocking-wall",type:"static",shape:"box",halfExtents:[2,1,0.08],position:[0,0.5,0.65]});
  const mesh=await navigation.bake({positions:[-4,0,-4,4,0,-4,4,0,4,-4,0,4],indices:[0,2,1,0,3,2]});
  const goal:Vec=scenario==="turn"?[4,0,4]:[0,0,2];
  const path=navigation.path(mesh,[0,0,0],[...goal]);
  if(!path.success||path.points.length<2)throw new Error("Recast path query did not produce a route");
  evidence.navigation={success:path.success,points:path.points};
  let last:{requested:Vec;accepted:Vec;rejected:Vec}={requested:[0,0,0],accepted:[0,0,0],rejected:[0,0,0]};
  const controller=createAnimationController({id:"walk-301",clips:[{id:"walk",name:"Aura301_Translated_Walk",duration,loop:true},{id:"in-place",name:"Zombie_Walk_Fwd_Loop",duration,loop:true}]});
  controller.bindRuntimeNode(node,{applyPose:false,applyMorphTargets:false,syncCaptureTime:true,
    rootMotion:{target:"root.translation",move:requested=>{
      const before=body.position();
      body.setVelocity([requested[0]/dt,requested[1]/dt,requested[2]/dt]);
      body.setAngularVelocity([0,0,0]);
      app.physics.step(dt);
      const after=body.position();
      node.setPosition(after[0],after[1]-0.16,after[2]);
      return [after[0]-before[0],after[1]-before[1],after[2]-before[2]];
    },onSample:sample=>{last=sample;}},
    footPlanting:{legs:[{side:"left",hip:"thigh_l",knee:"calf_l",ankle:"foot_l",contactPhase:time=>(time%duration)/duration<0.5},{side:"right",hip:"thigh_r",knee:"calf_r",ankle:"foot_r",contactPhase:time=>(time%duration)/duration>=0.5}],ground:{heightAt:(_x,z)=>({height:slope*z,normal:[0,1,-slope]})},ankleHeight:0.0905,plantThreshold:0.025}
  });
  controller.play("walk",{loop:"loop"});
  let firstPixels: Uint8Array | undefined;
  const oracleCanvas=document.createElement("canvas");const oracleGL=oracleCanvas.getContext("webgl2")!;
  evidence.gpuOracle={maximumError:0,minimumNegativeDelta:Infinity,probes:0};
  const capture = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#stage canvas")!;
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("Root locomotion requires native WebGL2 pixel evidence");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  for(let frame=1;frame<=360;frame++){
    const current=body.position();
    const target=path.points.at(-1)!;
    const heading=scenario==="turn"?Math.atan2(target[0],target[2])*Math.min(1,frame/120):0;
    if(scenario==="turn")node.setRotation(0,heading,0);
    if(scenario === "crossfade" && frame === 120) controller.crossFade("in-place",0.5);
    if(scenario === "crossfade" && frame === 240) controller.crossFade("walk",0.5);
    controller.update(dt);
    // Physics, root motion, foot planting and runtime evidence advance on all
    // 360 samples. A native presentation is required only for the first/last
    // pixel controls and each 60-frame GPU skinning oracle. Submitting 360
    // identical-cost SwiftShader frames made one scenario exceed its timeout
    // without increasing temporal evidence coverage.
    const evidenceFrame = frame === 1 || frame === 360 || frame % 60 === 0;
    if (evidenceFrame) await app.stepAsync(0);
    else app.advance(0);
    if (frame === 1) firstPixels = capture();
    if (frame === 360) {
      const pixels = capture(); let changed = 0; let colored = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i]! - firstPixels![i]!) + Math.abs(pixels[i+1]! - firstPixels![i+1]!) + Math.abs(pixels[i+2]! - firstPixels![i+2]!) > 15) changed++;
        if (Math.max(pixels[i]!,pixels[i+1]!,pixels[i+2]!) - Math.min(pixels[i]!,pixels[i+1]!,pixels[i+2]!) > 20) colored++;
      }
      evidence.pixels = {changed,colored};
    }
    const imported=node.snapshot().importedAssetEvidence;
    if(frame % 60 === 0) for(const surface of imported?.lastFootPlantingSurfaces??[]) {
      const probe=surface.skinningProbe;
      if(!probe)continue;
      const result=runSkinningOracle(oracleGL,probe as SkinningOracleInput);
      evidence.gpuOracle.maximumError=Math.max(evidence.gpuOracle.maximumError,result.maxAbsoluteError);
      evidence.gpuOracle.minimumNegativeDelta=Math.min(evidence.gpuOracle.minimumNegativeDelta,result.changedPaletteDelta);
      evidence.gpuOracle.probes++;
    }
    evidence.frames.push({heading,deformation:imported?.lastFootPlantingDeformation??[],time:frame*dt,position:[...body.position()],...last,feet:imported?.lastFootPlantingFeet??[],surfaces:(imported?.lastFootPlantingSurfaces??[]).map(({skinningProbe,...surface})=>frame%60===0?{...surface,skinningProbe}:surface)});
  }
  evidence.backend=app.physics.backend();evidence.renderer=app.diagnostics().renderer;
  evidence.status="complete";
}
