import { camera, createAuraApp, effects, lights, material, model, primitives, scene, type AuraAssetRef } from "@aura3d/engine";

declare global { interface Window { __PULSE_COMBAT_FINISH_V7__?: { ready:boolean; backend:string|undefined; drawCalls:number; renderSize:readonly number[]; errors:readonly string[] }; __PULSE_COMBAT_FINISH_V7_ERROR__?:string } }

const ref = <T extends string>(file:string,name:T,hash:string,bounds:readonly[number,number,number],sizeBytes:number):AuraAssetRef<"model",T> => ({
  type:"model",format:"glb",url:new URL(`./assets/combat-finish-v7/${file}`,import.meta.url).href,hash:`sha256-${hash}`,bounds,sizeBytes,
  metadata:{license:"CC0-1.0",author:"Aura3D route-local synthesis",sourcePath:"apps/showcase-pulse-tunnel/scripts/build-combat-finish-v7.py",role:"unregistered isolated art candidate"}
});
const runner=ref("pulsePhaseMantaV7.candidate.glb","pulsePhaseMantaV7Candidate","d33f6418e9cb44f560f09750cf1acf8f51985556f9ab616e6e1d0c5e65dd5ce5",[4.288,1.04,3.73],963232);
const sentinel=ref("pulseCathedralSentinelV7.candidate.glb","pulseCathedralSentinelV7Candidate","d4920ac4db53594560efb42dd98df7adbb0fe5193c712df52f4324bb77d6b4af",[5.502,3.418,1.645],1601400);
const world=ref("pulseBraidedReactorWorldV7.candidate.glb","pulseBraidedReactorWorldV7Candidate","0714c8f14011b29d92f2035ae8aaee5e3579be5b74d43697b4384a5bbed5219e",[9.398,4.742,14.8],1852564);
const cyan=material.emissive({name:"V7 player bolts",color:"#d9fdff",emissive:"#00bfd8",emissiveIntensity:1.8});
const red=material.emissive({name:"V7 sentinel blades",color:"#ff978e",emissive:"#f02c20",emissiveIntensity:1.9});
const impact=material.emissive({name:"V7 shield break",color:"#ffffff",emissive:"#5deeff",emissiveIntensity:1.45,opacity:.9});
const contact=material.pbr({name:"V7 runner contact shadow",color:"#010305",roughness:.95,metallic:0,opacity:.76});
const bolts=Array.from({length:5},(_,i)=>{const t=(i+1)/6;return primitives.sphere({name:`V7 heavy cyan bolt ${i+1}`,material:cyan}).position(-1.35+t*1.72,.72+Math.sin(t*Math.PI)*.46,-.25-t*5.5).scale(.13+i*.012)});
const cutters=Array.from({length:4},(_,i)=>{const t=(i+1)/5;return primitives.torus({name:`V7 red cutting wave ${i+1}`,material:red}).position(.95-t*1.68,1.72-t*.72,-6.25+t*4.75).rotate(0,-.08,0).scale([.22+t*.09,.22+t*.09,.055])});
const app=createAuraApp("#stage",{pixelRatio:1,resize:true,renderer:{mode:"safe-basic",qualityProfile:"safe-basic"},scene:scene().background("#02070c").camera(camera.perspective({position:[.30,2.24,8.8],target:[0,1.13,-4.15],fov:43})).addMany([
  model(world,{name:"V7 high-contrast reactor tunnel",role:"primaryWorld",targetMaxDimension:14.8}),
  primitives.plane({name:"V7 grounded runner contact",material:contact}).position(-1.42,.035,.15).rotate(-Math.PI/2,0,0).scale([2.0,1.25,1]),
  model(runner,{name:"V7 Pulse phase manta",role:"primarySubject",targetMaxDimension:4.288}).position(-1.42,.26,.08).rotate(0,-.035,-.012).scale(.90),
  model(sentinel,{name:"V7 Pulse cathedral sentinel",role:"primarySubject",targetMaxDimension:5.502}).position(.92,.12,-6.45).rotate(0,Math.PI,0).scale(.96),
  primitives.torus({name:"V7 shield fracture ring",material:impact}).position(-1.02,.83,-1.08).rotate(.08,-.10,.04).scale([.69,.69,.06]),
  primitives.torus({name:"V7 sentinel target lock",material:red}).position(.92,1.72,-5.95).scale([.82,.82,.06]),...bolts,...cutters,
  effects.neonBloom({intensity:.38,threshold:.78,maxIntensity:.86,antiBlowout:true}),effects.fog({name:"V7 reactor depth",density:.003,color:"#02070c"}),
  lights.ambient({name:"V7 cool ambient",color:"#395d68",intensity:.40}),lights.directional({name:"V7 white hero key",color:"#e9fbff",intensity:2.6}).position(-5.8,8.8,6.8),
  lights.directional({name:"V7 red boss rim",color:"#ff3b2f",intensity:1.4}).position(5.4,6,-5.5),lights.point({name:"V7 cyan runner pool",color:"#27ebfa",intensity:2.8}).position(-2.1,1.5,1.5),
  lights.point({name:"V7 red sentinel pool",color:"#ff2d21",intensity:3.8}).position(1.1,2.3,-5.9),lights.point({name:"V7 exchange lane light",color:"#75f4ff",intensity:1.25}).position(0,.65,-3.0)
]),diagnostics:false,autoStart:true});

void ready().catch((error:unknown)=>{window.__PULSE_COMBAT_FINISH_V7_ERROR__=error instanceof Error?`${error.name}: ${error.message}`:String(error)});
async function ready(){const start=performance.now();while(performance.now()-start<30000){const d=app.diagnostics();if(d.drawCalls>0&&d.renderSize[0]>0&&d.errors.length===0){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const s=app.diagnostics();window.__PULSE_COMBAT_FINISH_V7__={ready:true,backend:s.renderer?.runtime.backend,drawCalls:s.drawCalls,renderSize:s.renderSize,errors:s.errors};return}await new Promise(r=>setTimeout(r,50))}throw new Error("V7 candidate pixel timeout")}
