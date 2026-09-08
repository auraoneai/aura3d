import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { camera, createAuraApp, effects, instances, lights, material, primitives, scene } from "@aura3d/engine";
import { Geometry, Renderer, UnlitMaterial, VertexBuffer, VertexFormat, ParticleSystem, createParticle, computePlanarViewMatrix, createPlanarProjectionMatrix, multiplyPlanarMatrices } from "@aura3d/rendering";

export type Workload = "bloomChain" | "instance4k" | "light64" | "particle10k";
export type Engine = "aura" | "three";
const W = 640, H = 360, DT = 1 / 60;
export const corners = [[-.012,-.012],[.012,-.012],[.012,.012],[-.012,-.012],[.012,.012],[-.012,.012]] as const;
const grid = (i: number): [number,number,number] => [(i % 80 - 39.5)*.045,(Math.floor(i/80)-24.5)*.045,0];
const lamp = (i: number): [number,number,number] => [(i%8-3.5)*.3,(Math.floor(i/8)-3.5)*.3,1];
interface NativeFrame { drawCalls:number; triangles:number; instancedObjects:number; maxDrawInstances:number; viewportDraws:Array<readonly[number,number]>; }
interface Mounted { entryPoint:string; render():Promise<void>; diagnostics():unknown; bloomObservation?():unknown; liveParticles():number; dispose():Promise<void>; lightMask?(omitted:number):Promise<void>; }
export interface EnginePerfResult { engine:Engine; workload:Workload; entryPoint:string; backend:string; hardware:string; revision:string; quality:Record<string,unknown>; qualityFingerprint:string; trials:Array<{samples:Array<{cpuSubmissionMs:number;engineCallAwaitMs:number;gpuCompletionMs:number;gpuCompleted:true;readbackMs:number;completedFrameMs:number;rafPacingMs:number;native:NativeFrame;renderSize:readonly[number,number];liveParticles:number;textureStorageBytes:number; bloomObservation:unknown;textureAllocations:Array<{width:number;height:number;bytes:number;halfFloat:boolean}>}>;summary:Record<string,unknown>}>; effectiveLights:number|null; diagnostics:unknown; adaptation:string[];trialMedianStatistics:ReturnType<typeof samplesSummary>|null; }
declare global { interface Window { __AURA301_ENGINE_PERF__?: { run(engine:Engine,workload:Workload):Promise<EnginePerfResult>;captureBloom(engine:Engine,enabled:boolean):Promise<{pixels:number[];png:string;observation:unknown}> }; } }

/** Observe commands issued by the real engine. This observer never submits workload draws. */
function observe(gl:WebGL2RenderingContext) {
  let frame:NativeFrame={drawCalls:0,triangles:0,instancedObjects:0,maxDrawInstances:0,viewportDraws:[]};
  let viewport=gl.getParameter(gl.VIEWPORT) as Int32Array;
  const original = new Map<string, (...args:any[])=>any>();
  const patch=(name:string,observeCall:(args:any[])=>void)=>{
    const object=gl as unknown as Record<string,(...args:any[])=>any>;
    const fn=object[name]!.bind(gl); original.set(name,fn);
    object[name]=(...args:any[])=>{observeCall(args);return fn(...args);};
  };
  patch("viewport",args=>{viewport=new Int32Array(args);});
  for(const name of ["drawArrays","drawElements","drawArraysInstanced","drawElementsInstanced"]) patch(name,args=>{
    const instanced=name.endsWith("Instanced"), count=name.startsWith("drawArrays")?args[2]:args[1];
    const n=instanced?args[name==="drawArraysInstanced"?3:4]:1;
    frame.drawCalls++;frame.viewportDraws.push([viewport[2]!,viewport[3]!]); if(args[0]===gl.TRIANGLES) frame.triangles+=count*n/3;
    if(instanced){frame.instancedObjects+=n;frame.maxDrawInstances=Math.max(frame.maxDrawInstances,n);}
  });
  // Render target storage is measured at allocation, including bloom and composer ping-pong.
  const textures=new Map<WebGLTexture,{bytes:number;width:number;height:number;format:number}>(); let bound:WebGLTexture|null=null;
  patch("bindTexture",args=>{if(args[0]===gl.TEXTURE_2D)bound=args[1];});
  const bytes=(format:number)=>format===gl.RGBA16F?8:format===gl.RGBA32F?16:format===gl.RGB16F?6:4;
  patch("texImage2D",args=>{if(bound&&args.length>=9&&args[1]===0)textures.set(bound,{bytes:args[3]*args[4]*bytes(args[2]),width:args[3],height:args[4],format:args[2]});});
  patch("texStorage2D",args=>{if(bound)textures.set(bound,{bytes:args[3]*args[4]*bytes(args[2])*(args[1]>1?4/3:1),width:args[3],height:args[4],format:args[2]});});
  patch("deleteTexture",args=>{textures.delete(args[0]);});
  return { reset(){frame={drawCalls:0,triangles:0,instancedObjects:0,maxDrawInstances:0,viewportDraws:[]};}, snapshot(){return {...frame};}, textureStorageBytes(){return [...textures.values()].reduce((a,b)=>a+b.bytes,0);}, textures(){return [...textures.values()].map(t=>({...t,halfFloat:t.format===gl.RGBA16F}));}, restore(){for(const[name,fn]of original)(gl as any)[name]=fn;} };
}
function samplesSummary(values:number[]) {const v=[...values].sort((a,b)=>a-b);const mean=v.reduce((a,b)=>a+b,0)/v.length;return {p50:v[Math.ceil(v.length*.5)-1],p95:v[Math.ceil(v.length*.95)-1],p99:v[Math.ceil(v.length*.99)-1],mean,variance:v.reduce((s,x)=>s+(x-mean)**2,0)/v.length};}
const raf=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
async function complete(gl:WebGL2RenderingContext) {
  if(gl.getError()!==gl.NO_ERROR)throw new Error("Engine submitted invalid WebGL commands");
  const start=performance.now(), sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
  if(!sync)throw new Error("GPU fence unavailable");gl.flush();
  try{for(;;){const status=gl.clientWaitSync(sync,0,0);if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)break;if(status===gl.WAIT_FAILED||performance.now()-start>10000)throw new Error("GPU completion failed or timed out");await new Promise(resolve=>setTimeout(resolve,0));}}finally{gl.deleteSync(sync);}
  const completed=performance.now();const pixel=new Uint8Array(4);gl.readPixels(W/2,H/2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  if(gl.getError()!==gl.NO_ERROR)throw new Error("GPU readback failed");
  return {gpuCompleted:true as const,gpuCompletionMs:completed-start,readbackMs:performance.now()-completed};
}
function readFrame(gl:WebGL2RenderingContext){const p=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,p);if(gl.getError()!==gl.NO_ERROR)throw new Error("Frame capture error");return p;}
function lightScene(omitted=-1){const s=scene().background("#000000").camera(camera.perspective({position:[0,0,4],target:[0,0,0],fov:45,near:.1,far:100})).add(primitives.box({scale:[3,2,.1],material:material.pbr({color:"#808080",roughness:1,metallic:0})}));for(let i=0;i<64;i++)if(i!==omitted)s.add(lights.point({name:`perf-light-${i}`,position:lamp(i),intensity:.08,color:"#ffffff"}));return s;}
function rootScene(workload:Workload,enabled=true){
  if(workload==="light64")return lightScene();
  const s=scene().background("#000000").camera(camera.perspective({position:[0,0,4],target:[0,0,0],fov:45,near:.1,far:100}));
  if(workload==="instance4k")return s.add(instances.box({transforms:Array.from({length:4000},(_,i)=>({position:grid(i),scale:.025})),material:material.emissive({color:"#000000",emissive:"#ffaa44",emissiveIntensity:1})}));
  s.add(primitives.box({scale:[1,.15,.15],material:material.emissive({color:"#000000",emissive:"#ffffff",emissiveIntensity:6})}));if(enabled)s.add(effects.bloom({quality:"cinematic",threshold:1,intensity:1,maxIntensity:1,radius:1,softKnee:0,shoulder:0}));return s;
}
export async function mountRoot(canvas:HTMLCanvasElement,workload:Workload,enabled=true):Promise<Mounted>{
 const app=createAuraApp(canvas,{autoStart:false,resize:false,pixelRatio:1,scene:rootScene(workload,enabled),renderer:{mode:"production",qualityProfile:"production",fallback:"safe-basic"}});await app.ready();
 return {entryPoint:"@aura3d/engine:createAuraApp.stepAsync",async render(){await app.stepAsync(DT);const d=app.diagnostics();if(d.errors.length||(!d.renderer?.runtime.mounted||d.renderer.runtime.backend!=="production-runtime"))throw new Error(JSON.stringify(d));if(workload==="bloomChain"&&enabled&&(!d.renderer.runtime.bloom?.halfFloat||d.renderer.runtime.bloom.mipCount<5))throw new Error("Requested full half-float bloom chain did not execute");},diagnostics:()=>app.diagnostics(),bloomObservation:()=>({native:app.diagnostics().renderer?.runtime.bloom,passes:app.diagnostics().renderer?.postprocess?.actualPasses,algorithm:"five mip separable Gaussian",kernelRadii:[6,10,14,16,16],compositeWeights:[.4,.25,.16,.11,.08],toneMapping:"aces",exposure:1,outputColorSpace:"srgb"}),liveParticles:()=>0,dispose:()=>app.disposeAsync(),async lightMask(i){app.setScene(lightScene(i));await app.ready();}};
}
export function particleInitial(i:number){return {id:i,lifetime:10000,position:{x:(i%100-49.5)*.025,y:(Math.floor(i/100)-49.5)*.02,z:0},velocity:{x:0,y:0,z:.001},size:.024};}
export async function mountParticles(canvas:HTMLCanvasElement, enabled=true, offsetX=0):Promise<Mounted>{
 const renderer=await Renderer.create({backend:"webgl2",canvas,width:W,height:H,antialias:false,clearColor:[0,0,0,1]});
 const viewProjectionMatrix=multiplyPlanarMatrices(createPlanarProjectionMatrix(Math.PI/4,W/H,.1,100),computePlanarViewMatrix([0,0,4],[0,0,0],[0,1,0]));
 const system=new ParticleSystem({maxParticles:10000});for(let i=0;i<10000;i++)system.particles.push(createParticle(particleInitial(i)));
 const vertices=new VertexBuffer(new VertexFormat([{semantic:"position",components:3,offset:0}],12),60000);
 const geometry=new Geometry(vertices,null,"triangles",{min:[-2,-2,-1],max:[2,2,2]});const mat=new UnlitMaterial({color:[1,.667,.267,1],renderState:{cullMode:"none"}});
 return {entryPoint:"@aura3d/rendering:ParticleSystem.update + Renderer.renderAsync",async render(){system.update(DT);let vertex=0;for(const p of system.particles)for(const corner of corners)vertices.setAttribute(vertex++,"position",[p.position.x+corner[0]+offsetX,p.position.y+corner[1],p.position.z]);await renderer.renderAsync({renderItems:enabled?[{label:"10000-live-particle-quads",geometry,material:mat}]:[],cameraPolicy:"require",cameraPosition:[0,0,4],postprocess:false,shadow:false,environmentLighting:false},{viewProjectionMatrix});},diagnostics:()=>renderer.device.getDiagnostics(),liveParticles:()=>system.particles.filter(p=>p.alive&&p.age<p.lifetime).length,async dispose(){geometry.dispose();mat.dispose();renderer.dispose();}};
}
export async function mountThree(canvas:HTMLCanvasElement,workload:Workload,enabled=true, offsetX=0):Promise<Mounted>{
 if(THREE.REVISION!=="185")throw new Error(`Opponent revision ${THREE.REVISION} is not r185`);
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H,false);renderer.setClearColor(0);renderer.toneMapping=workload==="particle10k"?THREE.NoToneMapping:THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.SRGBColorSpace;
 const s=new THREE.Scene(), c=new THREE.PerspectiveCamera(45,W/H,.1,100);c.position.set(0,0,4);c.lookAt(0,0,0);
 const lampNodes:THREE.PointLight[]=[];let composer:EffectComposer|undefined;let bloomPass:UnrealBloomPass|undefined;let positions:Float32Array|undefined;let particles:ReturnType<typeof particleInitial>[]=[];let particleGeometry:THREE.BufferGeometry|undefined;
 if(workload==="instance4k"){const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:"#ffaa44"}),4000);const m=new THREE.Matrix4();for(let i=0;i<4000;i++){m.makeScale(.025,.025,.025);m.setPosition(...grid(i));mesh.setMatrixAt(i,m);}mesh.instanceMatrix.needsUpdate=true;s.add(mesh);}
 if(workload==="light64"){const mesh=new THREE.Mesh(new THREE.BoxGeometry(3,2,.1),new THREE.MeshStandardMaterial({color:"#808080",roughness:1,metalness:0}));s.add(mesh);for(let i=0;i<64;i++){const light=new THREE.PointLight(0xffffff,.08,10,2);light.position.set(...lamp(i));lampNodes.push(light);s.add(light);}}
 if(workload==="bloomChain"){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,.15,.15),new THREE.MeshBasicMaterial({color:new THREE.Color(6,6,6)}));s.add(mesh);composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(W,H,{type:THREE.HalfFloatType}));composer.addPass(new RenderPass(s,c));bloomPass=new UnrealBloomPass(new THREE.Vector2(W,H),1,1,1);bloomPass.enabled=enabled;composer.addPass(bloomPass);composer.addPass(new OutputPass());}
 if(workload==="particle10k"){particles=Array.from({length:10000},(_,i)=>particleInitial(i));positions=new Float32Array(180000);particleGeometry=new THREE.BufferGeometry();particleGeometry.setAttribute("position",new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));const mesh=new THREE.Mesh(particleGeometry,new THREE.MeshBasicMaterial({color:new THREE.Color(1,.667,.267),side:THREE.DoubleSide}));mesh.frustumCulled=false;if(enabled)s.add(mesh);}
 return {entryPoint:"three@0.185.1:WebGLRenderer.render"+(composer?" + EffectComposer/UnrealBloomPass":""),async render(){if(positions&&particleGeometry){let k=0;for(const p of particles){p.position.x+=p.velocity.x*DT;p.position.y+=p.velocity.y*DT;p.position.z+=p.velocity.z*DT;for(const v of corners){positions[k++]=p.position.x+v[0]+offsetX;positions[k++]=p.position.y+v[1];positions[k++]=p.position.z;}}particleGeometry.getAttribute("position").needsUpdate=true;}renderer.info.reset();if(composer)composer.render(DT);else renderer.render(s,c);},bloomObservation:()=>bloomPass?{native:{mipCount:(bloomPass as any).nMips,halfFloat:[...(bloomPass as any).renderTargetsHorizontal,...(bloomPass as any).renderTargetsVertical].every((t:any)=>t.texture.type===THREE.HalfFloatType),threshold:bloomPass.threshold,intensity:bloomPass.strength,targets:[...(bloomPass as any).renderTargetsHorizontal,...(bloomPass as any).renderTargetsVertical].map((t:any)=>({width:t.width,height:t.height}))},algorithm:"five mip separable Gaussian",kernelRadii:[6,10,14,18,22],radius:bloomPass.radius,compositeFactors:[1,.8,.6,.4,.2],toneMapping:renderer.toneMapping===THREE.ACESFilmicToneMapping?"aces":"other",exposure:renderer.toneMappingExposure,outputColorSpace:renderer.outputColorSpace}:null,diagnostics:()=>({render:{...renderer.info.render},memory:{...renderer.info.memory}}),liveParticles:()=>particles.length,async lightMask(i){lampNodes.forEach((l,n)=>l.visible=n!==i);},async dispose(){s.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});for(const pass of composer?.passes??[])pass.dispose();composer?.dispose();renderer.dispose();}};
}

window.__AURA301_ENGINE_PERF__={async captureBloom(engine,enabled){
 const canvas=document.querySelector<HTMLCanvasElement>("#engine")!;
 const mounted=engine==="aura"?await mountRoot(canvas,"bloomChain",enabled):await mountThree(canvas,"bloomChain",enabled);
 try{for(let i=0;i<3;i++)await mounted.render();const gl=canvas.getContext("webgl2")!;await complete(gl);return {pixels:Array.from(readFrame(gl)),png:canvas.toDataURL("image/png"),observation:mounted.bloomObservation?.()};}finally{await mounted.dispose();}
},async run(engine,workload){
 const canvas=document.querySelector<HTMLCanvasElement>("#engine")!;const gl=canvas.getContext("webgl2",{antialias:false,preserveDrawingBuffer:true});if(!gl)throw new Error("WebGL2 unavailable");const observer=observe(gl);
 const mounted=engine==="three"?await mountThree(canvas,workload):workload==="particle10k"?await mountParticles(canvas):await mountRoot(canvas,workload);
 try{
 const dbg=gl.getExtension("WEBGL_debug_renderer_info");const hardware=dbg?String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)):String(gl.getParameter(gl.RENDERER));
 let effectiveLights:number|null=null;
 if(workload==="light64") {await mounted.render();await complete(gl);const baseline=readFrame(gl);effectiveLights=0;for(let i=0;i<64;i++){await mounted.lightMask!(i);await mounted.render();await complete(gl);const pixels=readFrame(gl);let delta=0;for(let j=0;j<pixels.length;j+=4)delta+=Math.abs(pixels[j]!-baseline[j]!)+Math.abs(pixels[j+1]!-baseline[j+1]!)+Math.abs(pixels[j+2]!-baseline[j+2]!);if(delta>0)effectiveLights++;}await mounted.lightMask!(-1);if(effectiveLights!==64)throw new Error(`${engine}: only ${effectiveLights}/64 lights change rendered pixels`);}
 const quality={resolution:[W,H],pixelRatio:1,antialias:false,adaptive:false,camera:{position:[0,0,4],fov:45,near:.1,far:100},workload,instances:workload==="instance4k"?4000:0,lights:workload==="light64"?64:0,particles:workload==="particle10k"?10000:0,particleGeometry:workload==="particle10k"?"60000 vertices / 20000 triangles, CPU linear integration dt=1/60":null,bloom:workload==="bloomChain"?{mips:5,format:"half-float",threshold:1,strength:1,radius:1}:null};
 const result:EnginePerfResult={engine,workload,entryPoint:mounted.entryPoint,backend:"webgl2",hardware,revision:engine==="three"?THREE.REVISION:"workspace",quality,qualityFingerprint:JSON.stringify(quality),trials:[],effectiveLights,diagnostics:null,adaptation:[],trialMedianStatistics:null};
 for(let trial=0;trial<3;trial++){console.log(`V02_STAGE ${workload}/${engine}/trial-${trial + 1}/warmup`);for(let i=0;i<30;i++){await mounted.render();await complete(gl);}const samples:EnginePerfResult["trials"][number]["samples"]=[];let previous=await raf();for(let i=0;i<60;i++){const tick=await raf(),rafPacingMs=tick-previous;previous=tick;observer.reset();const start=performance.now();const pending=mounted.render();const submitted=performance.now();await pending;const engineReturned=performance.now();const completion=await complete(gl);const native=observer.snapshot(), liveParticles=mounted.liveParticles();if(canvas.width!==W||canvas.height!==H||native.drawCalls===0||native.triangles===0)throw new Error("Missing workload or adaptive resolution change");if(workload==="instance4k"&&native.maxDrawInstances!==4000)throw new Error("4000 native rendered instances missing");if(workload==="particle10k"&&(liveParticles!==10000||native.triangles!==20000))throw new Error("10000 live rendered particle quads missing");samples.push({cpuSubmissionMs:submitted-start,engineCallAwaitMs:engineReturned-start,...completion,completedFrameMs:performance.now()-start,rafPacingMs,native,renderSize:[canvas.width,canvas.height],liveParticles,textureStorageBytes:observer.textureStorageBytes(),bloomObservation:workload==="bloomChain"?mounted.bloomObservation?.():null,textureAllocations:observer.textures()});}result.trials.push({samples,summary:{completedFrameMs:samplesSummary(samples.map(s=>s.completedFrameMs)),cpuSubmissionMs:samplesSummary(samples.map(s=>s.cpuSubmissionMs)),engineCallAwaitMs:samplesSummary(samples.map(s=>s.engineCallAwaitMs)),gpuCompletionMs:samplesSummary(samples.map(s=>s.gpuCompletionMs)),readbackMs:samplesSummary(samples.map(s=>s.readbackMs)),rafPacingMs:samplesSummary(samples.map(s=>s.rafPacingMs))}});}
 result.trialMedianStatistics=samplesSummary(result.trials.map(t=>Number((t.summary.completedFrameMs as any).p50)));result.diagnostics=mounted.diagnostics();return result;
 }finally{await mounted.dispose();observer.restore();}
}};
