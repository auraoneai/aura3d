import { type AuraAssetRef, camera, createAuraApp, game, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "../../src/aura-assets";
import { assets as candidates } from "../fixtures/locomotion-301/src/aura-assets";
import type { AnimationPose, HumanoidRigDefinition } from "@aura3d/animation";
import { runSkinningOracle, type SkinningOracleInput } from './locomotion-skinning-oracle';
import { installRootSkinPaletteWitness301, type RootSkinPaletteFrame301 } from './root-skin-palette-witness-301';
import { paletteJointPositions301,measureRenderedSegments301,type SkinBinding301,type Point301 } from './rig-palette-world-301';
import type { PairQualityFrame, PairSurface } from '../../tools/locomotion-301/pair-quality';
type RigId='showcaseWalkAnimatedGirl'|'showcaseAnimatedRunnerHero'|'showcaseRunnerRobot'|'showcaseKenneyOobiPlatformerHero';
const roster:Record<RigId,AuraAssetRef<'model'>> = {showcaseWalkAnimatedGirl:assets.showcaseWalkAnimatedGirl,showcaseAnimatedRunnerHero:assets.showcaseAnimatedRunnerHero,showcaseRunnerRobot:assets.showcaseRunnerRobot,showcaseKenneyOobiPlatformerHero:candidates.kenneyArticulatedCandidate};
export interface Pair {source:string;target:RigId;map:{ok:boolean;coverage:number;requiredCoverage:number};clip:string|null;duration:number;clipSha256:string|null;clipSelection:string;sourceAssetSha256:string;targetAssetSha256:string;correctionValues:{schema:string;sourceRun:number;samplesPerCycle:number;contactWindows:{left:readonly (readonly [number,number])[];right:readonly (readonly [number,number])[]};ankleHeight:string;ground:string;lock:string};samples:{time:number;targetPose:AnimationPose;worldGeometry:{maxRelativeSegmentLengthChange:number|null};rootMotion:{target:string|null;classification:string;cumulative:Point301;cycleDelta:Point301;consumedBone:string|null;consumedLocal:Point301}}[];}
export interface Fixture {translatedSource:{rigId:string;file:string;assetSha256:string;clip:string;duration:number;clipSha256:string;provenance:unknown};unsupportedSourceClips:{source:string;clips:string[];namedLocomotionClips:string[]}[];pairs:Pair[];rigs:{rigId:RigId;file:string;bindPose:AnimationPose;rig:HumanoidRigDefinition;assetSha256:string;meshBindHeight:number;meshBindTransforms:Record<string,number[]>;meshSkinBindings:Record<string,SkinBinding301>}[];}
interface Surface extends PairSurface {skinningProbe?:SkinningOracleInput}
interface Imported {lastFootPlantingSurfaces?:readonly Surface[];skinnedRenderItemCount?:number;lastFootPlantingMissingLegs?:readonly string[];}
interface RenderedFrame extends PairQualityFrame {nativePalette:RootSkinPaletteFrame301;worldGeometry:ReturnType<typeof measureRenderedSegments301>;motion:{requested:Point301;accepted:Point301;rejected:Point301;cumulative:Point301;target:Point301;classification:string;consumedBone:string|null;consumedLocal:Point301};colored:number;changed:number;imported:Imported;gpuOracle:{probes:number;maximumError:number;minimumNegativeDelta:number}}
const state:{status:string;error?:string;frames:RenderedFrame[];wrapPrime?:{cycle:number;sample:number;actorPosition:Point301;surfaceCount:number};renderer?:unknown;rigHeight?:number;supportY?:number;bindSurfaces?:readonly Surface[];physics?:unknown;rootNegativeControl?:{changedPixels:number;paletteChanged:number}}={status:'ready',frames:[]};
declare global {interface Window {__AURA301_PAIR__:typeof state;runAura301Pair:(fixture:Fixture,index:number)=>Promise<void>;sampleAura301Pair:(sample:number,cycle?:number,record?:boolean)=>Promise<void>;disposeAura301Pair:()=>void;}}
window.__AURA301_PAIR__=state;
window.runAura301Pair=async(fixture,index)=>{
  try {
    const pair=fixture.pairs[index];if(!pair)throw new Error('Missing ordered pair');
    const target=fixture.rigs.find(rig=>rig.rigId===pair.target);if(!target)throw new Error('Missing target rig');
    if(target.assetSha256!==pair.targetAssetSha256)throw new Error('Target asset hash mismatch');
    const legs=(['left','right'] as const).map(side=>{
      const hip=target.rig.bones[`${side}UpperLeg`]?.name,knee=target.rig.bones[`${side}LowerLeg`]?.name,ankle=target.rig.bones[`${side}Foot`]?.name;
      if(!hip||!knee||!ankle)throw new Error(`Unsupported required pair: missing ${side} leg chain`);
      return {side,hip,knee,ankle,contact:false};
    });
    if(new Set(legs.flatMap(leg=>[leg.hip,leg.knee,leg.ankle])).size!==6)throw new Error('Unsupported required pair: both legs must have distinct authored hip/knee/ankle joints');
    const app=createAuraApp(document.querySelector<HTMLElement>('#stage')!,{autoStart:false,resize:false,pixelRatio:1,physics:{gravity:[0,0,0],seed:301},renderer:{mode:'production',qualityProfile:'production',fallback:'safe-basic'},scene:scene().background('#10131b').camera(camera.perspective({position:[3,2,4],target:[0,.75,0],fov:40})).add(model(roster[pair.target],{name:pair.target}).runtime(game.runtimeNode('target'))).add(primitives.box({name:'pose reference ground',material:material.pbr({color:'#777f8a',roughness:.9})}).position(0,-.05,0).scale([5,.1,5]).runtime(game.runtimeNode('ground'))).add(lights.studio())});
    const rootCanvas=app.canvas;if(!rootCanvas)throw new Error('Root canvas missing');const rootGl=rootCanvas.getContext('webgl2');if(!rootGl)throw new Error('Root WebGL2 context missing');
    const witness=installRootSkinPaletteWitness301(rootGl);
    // Pair certification measures unobstructed authored displacement. A Rapier
    // position-kinematic body owns that exact motion; the separate five-scenario
    // locomotion suite retains the dynamic wall/slope rejection proof.
    const body=app.physics.createBody({name:'pair-root-motion-owner',type:'kinematic',shape:'sphere',radius:.01,position:[0,0,0]});
    const oracleCanvas=document.createElement('canvas'),oracleGL=oracleCanvas.getContext('webgl2');if(!oracleGL)throw new Error('Independent GPU skinning oracle unavailable');
    window.disposeAura301Pair=()=>{witness.dispose();app.dispose();oracleGL.getExtension('WEBGL_lose_context')?.loseContext();};
    const node=app.nodes.require('target');
    // Establish the uncorrected renderer bind frame before enabling the
    // pair-specific correction profile derived from the retained raw run.
    node.setAnimationBinding({kind:'aura-runtime-node-animation-binding',footPlanting:{legs,ground:{raycastDown:()=>undefined},hipDropFactor:0}});
    node.setAnimationPose(target.bindPose,{kind:'aura-runtime-node-animation-pose',boneCount:Object.keys(target.bindPose.bones).length,morphTargetCount:0,localTime:0});
    let bind:readonly Surface[]=[];
    const deadline=performance.now()+90_000;
    while(performance.now()<deadline){witness.reset('bind');await app.stepAsync(0);bind=(node.snapshot().importedAssetEvidence as Imported|undefined)?.lastFootPlantingSurfaces??[];if(bind.length)break;await new Promise(r=>setTimeout(r,50));}
    if(!bind.length)throw new Error('No native skinned sole geometry for target rig');
    function observedJoints(surfaces:readonly Surface[],native:RootSkinPaletteFrame301){
      if(native.errors.length||!native.draws.length)throw new Error(`Root draw palette witness failed: ${native.errors.join('; ')}`);
      const positions:Record<string,Point301>={};
      for(const surface of surfaces)if(surface.skinningProbe){
        const probe=surface.skinningProbe;
        const draw=native.draws.find(d=>d.jointMatrices.length===probe.matrices.length&&d.modelMatrix?.length===probe.modelMatrix.length&&d.jointMatrices.every((v,i)=>Math.abs(v-probe.matrices[i]!)<1e-5)&&d.modelMatrix.every((v,i)=>Math.abs(v-probe.modelMatrix[i]!)<1e-5));
        if(!draw)throw new Error(`Actual root GPU palette/model differs from observed skeleton: ${surface.mesh}`);
        const binding=target!.meshSkinBindings[surface.mesh];if(!binding)throw new Error(`Missing actual skin inverse binds: ${surface.mesh}`);
        const measured=paletteJointPositions301(draw,binding);
        for(const [name,point]of Object.entries(measured)){const previous=positions[name];if(previous&&Math.hypot(...point.map((v,i)=>v-previous[i]!))>1e-4)throw new Error(`Root joint disagreement across meshes: ${name}`);positions[name]=point;}
      }
      if(!Object.keys(positions).length)throw new Error('No draw-bound joint world state');return positions;
    }
    const bindJoints=observedJoints(bind,witness.read());

    const bindProbe=bind.find(p=>p.skinningProbe),matrix=bindProbe?.skinningProbe?.modelMatrix;if(!matrix||!bindProbe)throw new Error('Missing submitted palette/model oracle');
    const authoredMatrix=target.meshBindTransforms[bindProbe.mesh];if(!authoredMatrix)throw new Error('Missing measured bind mesh transform');
    const scales=[0,4,8].map(i=>Math.hypot(matrix[i]!,matrix[i+1]!,matrix[i+2]!)/Math.hypot(authoredMatrix[i]!,authoredMatrix[i+1]!,authoredMatrix[i+2]!));
    if(scales.some(v=>!Number.isFinite(v)||v<=0)||Math.max(...scales)-Math.min(...scales)>1e-5)throw new Error('Pair height requires a uniform measured renderer normalization');
    const rigHeight=target.meshBindHeight*scales[1]!;
    const supportY=Math.min(...bind.map(p=>p.worldPosition[1]));
    const ankleHeight=legs.reduce((sum,leg)=>sum+(bindJoints[leg.ankle]?.[1]??NaN)-supportY,0)/legs.length;
    if(!Number.isFinite(ankleHeight)||ankleHeight<0||ankleHeight>rigHeight)throw new Error('Invalid measured renderer ankle-to-sole height');
    const profile=pair.correctionValues;if(profile?.sourceRun!==34023999653||profile.samplesPerCycle!==60)throw new Error('Missing source-bound pair correction profile');
    const inWindow=(side:'left'|'right',time:number)=>{const sample=((time/pair.duration)*profile.samplesPerCycle)%profile.samplesPerCycle;return profile.contactWindows[side].some(([start,end])=>sample>=start&&sample<=end);};
    const ground={raycastDown:(origin:readonly[number,number,number],maxDistance:number)=>{const distance=origin[1]-supportY;return distance<0||distance>maxDistance?undefined:{point:[origin[0],supportY,origin[2]] as const,normal:[0,1,0] as const,distance};}};
    if(!(rigHeight>0)||!Number.isFinite(rigHeight))throw new Error('Invalid rendered bind-mesh height');
    app.nodes.require('ground').setPosition(0,supportY-.05,0);state.rigHeight=rigHeight;state.supportY=supportY;state.bindSurfaces=bind;
    const canvas=app.canvas!;const gl=canvas.getContext('webgl2');if(!gl)throw new Error('Native WebGL2 required');
    let first:Uint8Array|undefined;
    window.sampleAura301Pair=async(sampleIndex,cycle=0,record=true)=>{
      const sample=pair.samples[sampleIndex];if(!sample)throw new Error('Missing dense pair sample');
      node.setAnimationBinding({kind:'aura-runtime-node-animation-binding',localTime:sample.time,footPlanting:{legs:legs.map(leg=>({...leg,contactPhase:(time:number)=>inWindow(leg.side,time)})),ground,ankleHeight,rayStartHeight:rigHeight,maxRayDistance:rigHeight*3,plantThreshold:rigHeight*.01,hipDropFactor:1,lockFootRotation:true}});
      node.setAnimationPose({bones:{...target.bindPose.bones,...sample.targetPose.bones}},{kind:'aura-runtime-node-animation-pose',boneCount:Object.keys(sample.targetPose.bones).length,morphTargetCount:0,localTime:sample.time});
      const cumulative=sample.rootMotion.cumulative.map((v,i)=>(v+cycle*sample.rootMotion.cycleDelta[i]!)*scales[1]!) as unknown as Point301;
      const before=body.position();const requested=cumulative.map((v,i)=>v-before[i]!) as unknown as Point301;
      // This matrix certifies unobstructed target-rig retargeting. The public
      // kinematic handle is the immediate authoritative owner; collision and
      // rejection are exercised by the separate five-scenario dynamic suite.
      body.setPosition(cumulative);body.setVelocity([0,0,0]);body.setAngularVelocity([0,0,0]);
      const after=body.position();const accepted=after.map((v,i)=>v-before[i]!) as unknown as Point301,rejected=requested.map((v,i)=>v-accepted[i]!) as unknown as Point301;
      node.setPosition(after[0],after[1],after[2]);
      witness.reset(`cycle${cycle}:sample${sampleIndex}`);
      await app.stepAsync(0);
      const nativePalette=witness.read();
      const imported=node.snapshot().importedAssetEvidence as Imported|undefined;if(!imported)throw new Error('Root imported-asset evidence missing');
      const surfaces=imported.lastFootPlantingSurfaces??[];
      const mappedJoints=new Set(Object.values(target.rig.bones).flatMap(binding=>binding?[binding.name]:[]));
      const worldGeometry=measureRenderedSegments301(target.meshSkinBindings,bindJoints,observedJoints(surfaces,nativePalette),mappedJoints);
      const gpuOracle={probes:0,maximumError:0,minimumNegativeDelta:Infinity};
      if(sampleIndex%15===0)for(const p of surfaces)if(p.skinningProbe){const result=runSkinningOracle(oracleGL,p.skinningProbe);gpuOracle.probes++;gpuOracle.maximumError=Math.max(gpuOracle.maximumError,result.maxAbsoluteError);gpuOracle.minimumNegativeDelta=Math.min(gpuOracle.minimumNegativeDelta,result.changedPaletteDelta);}
      const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let colored=0,changed=0;for(let i=0;i<pixels.length;i+=4){if(Math.max(pixels[i]!,pixels[i+1]!,pixels[i+2]!)-Math.min(pixels[i]!,pixels[i+1]!,pixels[i+2]!)>25)colored++;if(first&&Math.abs(pixels[i]!-first[i]!)+Math.abs(pixels[i+1]!-first[i+1]!)+Math.abs(pixels[i+2]!-first[i+2]!)>15)changed++;}first??=pixels;
      const rotations=Object.values(sample.targetPose.bones).flatMap(b=>b.rotation?[b.rotation]:[]);
      const maxQuaternionNormError=rotations.length?Math.max(...rotations.map(q=>Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1))):Infinity;
      const renderedFrame:RenderedFrame={time:cycle*pair.duration+sample.time,cycle,sample:sampleIndex,actorPosition:[...after],colored,changed,surfaces:surfaces.map(({skinningProbe,...p})=>p),imported:{skinnedRenderItemCount:imported.skinnedRenderItemCount,lastFootPlantingMissingLegs:imported.lastFootPlantingMissingLegs},maxRelativeSegmentLengthChange:worldGeometry.maxRelativeSegmentLengthChange,nativePalette,worldGeometry,motion:{requested,accepted,rejected,cumulative:[...after],target:cumulative,classification:sample.rootMotion.classification,consumedBone:sample.rootMotion.consumedBone,consumedLocal:sample.rootMotion.consumedLocal},maxQuaternionNormError,gpuOracle};
      if(record)state.frames.push(renderedFrame);else state.wrapPrime={cycle,sample:sampleIndex,actorPosition:[...after],surfaceCount:surfaces.length};
      state.renderer=app.diagnostics().renderer;state.physics={backend:app.physics.backend()};
      if(cycle===0&&sampleIndex===0){
        // Rotate a required, visibly weighted leg bone in the actual root pose.
        // A shader/upload path that ignores skeletal changes must fail this pixel control.
        const controlBone=target.rig.bones.leftUpperLeg?.name;
        if(!controlBone)throw new Error('Root negative control needs a mapped upper leg');
        const pose=structuredClone({bones:{...target.bindPose.bones,...sample.targetPose.bones}}),bone=pose.bones[controlBone];
        if(!bone?.rotation)throw new Error('Root negative control needs a mapped bone rotation');
        const q=bone.rotation,s=Math.sin(.25),c=Math.cos(.25);
        pose.bones[controlBone]={...bone,rotation:{x:q.x*c+q.y*s,y:q.y*c-q.x*s,z:q.z*c+q.w*s,w:q.w*c-q.z*s}};
        node.setAnimationPose(pose,{kind:'aura-runtime-node-animation-pose',boneCount:Object.keys(pose.bones).length,morphTargetCount:0,localTime:sample.time});witness.reset('root-bone-negative-control');await app.stepAsync(0);
        const mutated=witness.read();if(mutated.errors.length)throw new Error(mutated.errors.join('; '));
        const changed=new Uint8Array(pixels.length);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,changed);let changedPixels=0;
        for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]!-changed[i]!)+Math.abs(pixels[i+1]!-changed[i+1]!)+Math.abs(pixels[i+2]!-changed[i+2]!)>15)changedPixels++;
        let paletteChanged=0;for(let i=0;i<Math.min(nativePalette.draws.length,mutated.draws.length);i++)for(let j=0;j<nativePalette.draws[i]!.jointMatrices.length;j++)if(Math.abs(nativePalette.draws[i]!.jointMatrices[j]!-mutated.draws[i]!.jointMatrices[j]!)>1e-5)paletteChanged++;
        state.rootNegativeControl={changedPixels,paletteChanged};
        node.setAnimationPose({bones:{...target.bindPose.bones,...sample.targetPose.bones}},{kind:'aura-runtime-node-animation-pose',boneCount:Object.keys(sample.targetPose.bones).length,morphTargetCount:0,localTime:sample.time});await app.stepAsync(0);
      }
    };
    state.status='loaded';
  }catch(error){state.status='error';state.error=String(error);throw error;}
};
