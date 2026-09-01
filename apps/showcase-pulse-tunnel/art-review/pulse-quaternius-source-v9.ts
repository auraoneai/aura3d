/** Isolated licensed-source audition. Never register without independent visual review. */
import { camera, createAuraApp, effects, lights, material, model, primitives, scene, type AuraAssetRef } from "@aura3d/engine";

declare global { interface Window { __PULSE_QUATERNIUS_SOURCE_V9__?: { ready:boolean; backend:string|undefined; drawCalls:number; renderSize:readonly number[]; errors:readonly string[] }; __PULSE_QUATERNIUS_SOURCE_V9_ERROR__?:string } }

const ref = <T extends string>(file:string,name:T,hash:string,bounds:readonly[number,number,number],sizeBytes:number):AuraAssetRef<"model",T> => ({
  type:"model",format:"glb",url:new URL(`./assets/quaternius-v9/${file}`,import.meta.url).href,hash:`sha256-${hash}`,bounds,sizeBytes,
  metadata:{license:"CC0-1.0",author:"Quaternius",sourceUrl:"https://quaternius.com/packs/",role:"unregistered isolated licensed-source candidate"}
});
const runner=ref("pulseQuaterniusEyeRunnerV9.candidate.glb","pulseQuaterniusEyeRunnerV9Candidate","c39a2f5153382b1f4450a546df5112aba6a7ab50b47188bcb394742a654815b6",[.996,.995,.892],4628876);
const warden=ref("pulseQuaterniusScolitexWardenV9.candidate.glb","pulseQuaterniusScolitexWardenV9Candidate","097c16edbc1e76a95aab8318ef2821b46888816733803904a894af351cdbbcf1",[3.432,3.362,3.227],446128);
const world=ref("pulseQuaterniusReactorArenaV9.candidate.glb","pulseQuaterniusReactorArenaV9Candidate","64731eade5c980f7461599b033551f9f59ef2c7ab3dd8579bfedbc9f59f2e9e3",[9.0,4.5,15.4],26654304);
const cyan=material.emissive({name:"V9 player phase lances",color:"#e8feff",emissive:"#00cce5",emissiveIntensity:2.1});
const red=material.emissive({name:"V9 warden plasma lattice",color:"#ffad8e",emissive:"#ff3a19",emissiveIntensity:2.15});
const gold=material.emissive({name:"V9 impact flare",color:"#fff4b0",emissive:"#ffad22",emissiveIntensity:2});
const bolts=Array.from({length:10},(_,i)=>{const t=(i+1)/11;return primitives.sphere({name:`V9 player lance ${i+1}`,material:cyan}).position(-1.35+t*1.95,1.02+Math.sin(t*Math.PI)*.72,-.45-t*6.1).scale(.15+i*.006)});
const barrage=Array.from({length:15},(_,i)=>{const row=Math.floor(i/5),col=i%5;return primitives.sphere({name:`V9 warden plasma ${i+1}`,material:red}).position(.85+(col-2)*(.31+row*.025),2.38-row*.48,-6.35+row*.98).scale(.16+row*.018)});
const app=createAuraApp("#stage",{pixelRatio:1,resize:true,renderer:{mode:"safe-basic",qualityProfile:"safe-basic"},scene:scene().background("#03070a").camera(camera.perspective({position:[.28,3.75,6.45],target:[0,.48,-4.55],fov:46})).addMany([
  model(world,{name:"V9 Quaternius reactor causeway",role:"primaryWorld",targetMaxDimension:15.4}),
  model(runner,{name:"V9 Pulse oculus runner",role:"primarySubject",targetMaxDimension:2.0}).position(-2.05,.58,.52).rotate(0,0,0).scale(1),
  model(warden,{name:"V9 Pulse Scolitex warden",role:"primarySubject",targetHeight:4.4}).position(.82,.08,-7.15).rotate(0,0,0).scale(1),
  primitives.torus({name:"V9 runner phase guard",material:cyan}).position(-1.76,1.18,-.42).rotate(.04,-.08,0).scale([.65,.65,.045]),
  primitives.torus({name:"V9 warden core lock",material:gold}).position(.84,2.03,-6.48).scale([.72,.72,.055]),
  ...bolts,...barrage,
  effects.neonBloom({intensity:.42,threshold:.75,maxIntensity:.9,antiBlowout:true}),effects.fog({name:"V9 reactor depth haze",density:.0024,color:"#03070a"}),
  lights.ambient({name:"V9 steel ambient",color:"#456978",intensity:.48}),lights.directional({name:"V9 runner key",color:"#eaffff",intensity:3}).position(-5.5,8.5,6.5),
  lights.directional({name:"V9 threat rim",color:"#ff4b2e",intensity:1.8}).position(5.5,6.2,-5.8),lights.point({name:"V9 cyan runner pool",color:"#36edff",intensity:3.4}).position(-1.8,1.8,1.1),
  lights.point({name:"V9 red warden pool",color:"#ff391e",intensity:4.6}).position(.9,2.4,-6.3),lights.point({name:"V9 arena fill",color:"#87ecff",intensity:1.4}).position(0,2,-3.1)
]),diagnostics:false,autoStart:true});

void ready().catch((error:unknown)=>{window.__PULSE_QUATERNIUS_SOURCE_V9_ERROR__=error instanceof Error?`${error.name}: ${error.message}`:String(error)});
async function ready(){const start=performance.now();while(performance.now()-start<45000){const d=app.diagnostics();if(d.drawCalls>0&&d.renderSize[0]>0&&d.errors.length===0){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const s=app.diagnostics();window.__PULSE_QUATERNIUS_SOURCE_V9__={ready:true,backend:s.renderer?.runtime.backend,drawCalls:s.drawCalls,renderSize:s.renderSize,errors:s.errors};return}await new Promise(r=>setTimeout(r,50))}throw new Error("V9 candidate pixel timeout")}
