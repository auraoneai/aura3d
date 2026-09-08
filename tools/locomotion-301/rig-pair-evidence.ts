import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createHumanoidRetargetingMap, inferHumanoidRigDetailed, retargetHumanoidPose,
  extractRootMotion, type AnimationClip, type AnimationPose, type AnimationPoseTransform, type HumanoidBoneName, type HumanoidRigDefinition,
  type InferHumanoidRigOptions } from "../../packages/animation/src/index.js";
import { invertMat4 } from "../../packages/scene/src/index.js";
import { GLTFLoader, LoadContext, createGLTFSceneAnimationRuntime, type GLTFAsset } from "../../packages/assets/src/index.js";

const runtimeAssets = new WeakMap<HumanoidRigDefinition, GLTFAsset>();

export const CERTIFIED_RIG_ROSTER = [
  { rigId: "showcaseWalkAnimatedGirl", file: "public/aura-assets/showcaseWalkAnimatedGirl.93872fc2.glb" },
  { rigId: "showcaseAnimatedRunnerHero", file: "public/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb" },
  { rigId: "showcaseRunnerRobot", file: "public/aura-assets/showcaseRunnerRobot.252b3a16.glb", options: { extraAliases: { spine: ["body"], leftFoot: ["feet"], rightFoot: ["feet"] } } },
  { rigId: "showcaseKenneyOobiPlatformerHero", file: "tests/fixtures/locomotion-301/kenney-articulated-candidate.glb", sourceFile: "public/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb", admission: "candidate-articulated-derivative-awaiting-rendered-quality" }
] as const;
export const TRANSLATED_LOCOMOTION_SOURCE = {
  rigId: "rivalTranslatedWalk",
  file: "tests/fixtures/locomotion-301/rival-translated-walk.glb",
  clip: "Aura301_Translated_Walk",
  provenanceFile: "tests/fixtures/locomotion-301/rival-translated-walk.glb.provenance.json",
} as const;
/** Clip-local stance windows measured from the first complete uncorrected GPU
 * sole capture (GitHub run 34020779184). These are explicit pair corrections,
 * not inferred from the corrected output under test. */
export const PAIR_CONTACT_PROFILES = {
  showcaseWalkAnimatedGirl: {left:[[2,7]],right:[[1,9],[30,39]]},
  showcaseAnimatedRunnerHero: {left:[[23,35]],right:[[57,60],[0,9]]},
  showcaseRunnerRobot: {left:[[23,31]],right:[[10,14]]},
  showcaseKenneyOobiPlatformerHero: {left:[[16,35]],right:[[14,35]]},
} as const;
const CHILD: Partial<Record<HumanoidBoneName, HumanoidBoneName>> = {
  hips: "spine", spine: "chest", chest: "upperChest", upperChest: "neck", neck: "head",
  leftShoulder: "leftUpperArm", leftUpperArm: "leftLowerArm", leftLowerArm: "leftHand",
  rightShoulder: "rightUpperArm", rightUpperArm: "rightLowerArm", rightLowerArm: "rightHand",
  leftUpperLeg: "leftLowerLeg", leftLowerLeg: "leftFoot", leftFoot: "leftToes",
  rightUpperLeg: "rightLowerLeg", rightLowerLeg: "rightFoot", rightFoot: "rightToes"
};
const PARENT = Object.fromEntries(Object.entries(CHILD).map(([a,b]) => [b,a])) as Partial<Record<HumanoidBoneName, HumanoidBoneName>>;
type Point = readonly [number, number, number];
const distance = (a: Point, b: Point) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

export async function measureCertifiedRig(rigId: string, file: string, options: InferHumanoidRigOptions = {}) {
  const bytes = readFileSync(file);
  const asset = await new GLTFLoader().load({ url: `data:model/gltf-binary;base64,${bytes.toString("base64")}`, type: "gltf" }, new LoadContext());
  const scene = asset.createScene();
  scene.updateWorldTransforms();
  const positions: Record<string, Point> = {};
  const local: Record<string, AnimationPoseTransform> = {};
  const parentWorldMatrices:Record<string,number[]>={};
  const duplicateNames: string[] = [];
  const nodeIdentities: Record<string, { index:number; path:string; skinJoint:boolean; parentName:string|null }> = {};
  const skinJoints = new Set(asset.skins.flatMap(skin => skin.jointNames));
  scene.traverse(node => {
    // Exclude runtime containers and generated primitive nodes from authored rig inference.
    const index = node.userData.gltfNodeIndex;
    if (typeof index !== "number") return;
    const path: number[] = [];
    for (let cursor: typeof node | null = node; cursor; cursor = cursor.parent) {
      if (typeof cursor.userData.gltfNodeIndex === "number") path.unshift(cursor.userData.gltfNodeIndex);
    }
    nodeIdentities[node.name] = { index, path: path.map(value => `nodes[${value}]`).join("/"), skinJoint:skinJoints.has(node.name), parentName:node.parent?.name ?? null };
    if (positions[node.name]) duplicateNames.push(node.name);
    const m = node.transform.worldMatrix;
    positions[node.name] = [m[12]!,m[13]!,m[14]!];
    parentWorldMatrices[node.name]=Array.from(node.parent?.transform.worldMatrix ?? [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
    const p = node.transform.position, q = node.transform.rotation, scale = node.transform.scale;
    local[node.name] = { position: {x:p[0]!,y:p[1]!,z:p[2]!}, rotation: {x:q[0]!,y:q[1]!,z:q[2]!,w:q[3]!}, scale:{x:scale[0]!,y:scale[1]!,z:scale[2]!} };
  });
  const inference = inferHumanoidRigDetailed(Object.keys(positions).filter(name => nodeIdentities[name]!.skinJoint), { ...options, id: rigId });
  const bones: HumanoidRigDefinition["bones"] = {};
  const restPose: NonNullable<HumanoidRigDefinition["restPose"]> = {};
  for (const [name, binding] of Object.entries(inference.rig.bones)) {
    const slot = name as HumanoidBoneName;
    const child = CHILD[slot], parent = PARENT[slot];
    const neighbor = (child && inference.rig.bones[child]) || (parent && inference.rig.bones[parent]);
    const length = neighbor ? distance(positions[binding.name]!, positions[neighbor.name]!) : undefined;
    bones[slot] = { name: binding.name, ...(length && Number.isFinite(length) ? {length} : {}), rotation: local[binding.name]!.rotation };
    restPose[slot] = local[binding.name]!;
  }
  const ys = Object.values(positions).map(p=>p[1]);
  const height = Math.max(...ys)-Math.min(...ys);
  // Measure the authored bind mesh, not just the skeleton joint origins.
  let meshMinY=Infinity, meshMaxY=-Infinity, measuredVertices=0;
  const meshBindTransforms:Record<string,number[]>={};
  const meshSkinBindings:Record<string,{jointNames:readonly string[];bindMatrices:number[][];hierarchyEdges:{parent:string;child:string;bindLength:number}[]}>={};
  const meshesByName=new Map(asset.meshes.map(mesh=>[mesh.name,mesh]));
  for(const {node,renderable} of scene.collectRenderables()) {
    const mesh=meshesByName.get(renderable.geometry);if(!mesh)continue;
    const matrix=node.transform.worldMatrix;
    const meshId=`${node.userData.gltfNodeIndex ?? node.name}:${mesh.name}`;
    meshBindTransforms[meshId]=Array.from(matrix);
    const skin=mesh.skinIndex===undefined?undefined:asset.skins[mesh.skinIndex];
    if(skin){
      const jointNames=new Set(skin.jointNames);
      const hierarchyEdges=skin.jointNames.flatMap(child=>{const parent=nodeIdentities[child]?.parentName;return parent&&jointNames.has(parent)&&positions[parent]&&positions[child]?[{parent,child,bindLength:distance(positions[parent]!,positions[child]!)}]:[];});
      if(!hierarchyEdges.length)throw new Error(`Skin has no measurable direct hierarchy edges: ${rigId}:${meshId}`);
      meshSkinBindings[meshId]={jointNames:skin.jointNames,bindMatrices:skin.inverseBindMatrices.map(m=>Array.from(invertMat4([...m]))),hierarchyEdges};
    }
    for(const point of mesh.positions){const y=matrix[1]!*point[0]+matrix[5]!*point[1]+matrix[9]!*point[2]+matrix[13]!;meshMinY=Math.min(meshMinY,y);meshMaxY=Math.max(meshMaxY,y);measuredVertices++;}
  }
  const meshBindHeight=meshMaxY-meshMinY;
  if(!Number.isFinite(meshBindHeight)||meshBindHeight<=0||!measuredVertices)throw new Error(`No measurable bind mesh: ${rigId}`);
  if (!Number.isFinite(height) || height <= 0) throw new Error(`Invalid measured height: ${rigId}`);
  const rig: HumanoidRigDefinition = { id:rigId, units:"unknown", bones, restPose };
  runtimeAssets.set(rig, asset);
  return { rig, file, assetSha256:hash(bytes), units:"asset-native; meters conversion not certified", height,
    heightDefinition:"world-space bind-node Y extent; not mesh or certified standing height",
    meshBindHeight,meshBindTransforms,meshSkinBindings,parentWorldMatrices,meshBindBounds:{minY:meshMinY,maxY:meshMaxY,measuredVertices},
    positions, nodeIdentities, bindPose:{bones:local} as AnimationPose, duplicateNames,
    nativeJointCoverage: { available: [...skinJoints], mapped: Object.values(bones).map(binding=>binding.name),
      unmapped: [...skinJoints].filter(name=>!Object.values(bones).some(binding=>binding.name===name)),
      missingHumanoidNodes: inference.missingRequired,
      limitation: inference.missingRequired.length ? "Authored sparse rig: absent joints cannot be repaired by aliases or correction profiles." : null },
    missingRequired:inference.missingRequired, inferenceOptions:options,
    clips:asset.animations };
}

/** Separate authored ancestor translation from the sampled skeletal pose. Source
 * units are transformed through the observed parent matrix and scaled by measured
 * mesh height. An in-place clip is explicitly retained as a zero-travel control. */
/** Retargeting may scale animated local translations, but rendered humanoid
 * certification requires the target skeleton's authored segment lengths. Keep
 * retargeted rotations while rebasing every mapped node on the target bind
 * translation/scale; actor root travel is applied separately by physics. */
export function preserveTargetBindShape(pose: AnimationPose, targetBindPose: AnimationPose): AnimationPose {
  const bones: Record<string, AnimationPoseTransform> = {};
  for (const [name, transform] of Object.entries(pose.bones)) {
    const bind = targetBindPose.bones[name];
    bones[name] = {
      ...(bind?.position ? { position: { ...bind.position } } : {}),
      ...(transform.rotation ? { rotation: { ...transform.rotation } } : bind?.rotation ? { rotation: { ...bind.rotation } } : {}),
      ...(bind?.scale ? { scale: { ...bind.scale } } : {})
    };
  }
  return { ...pose, bones };
}

export function consumePairRootTranslation(pose:AnimationPose,map:ReturnType<typeof createHumanoidRetargetingMap>,source:Pick<Awaited<ReturnType<typeof measureCertifiedRig>>, "rig"|"nodeIdentities"|"parentWorldMatrices"|"meshBindHeight"|"bindPose">,target:Pick<Awaited<ReturnType<typeof measureCertifiedRig>>, "meshBindHeight">,clip:AnimationClip,time:number) {
  const hips=source.rig.bones.hips?.name,hipsPath=hips?source.nodeIdentities[hips]?.path:undefined;
  const candidates=clip.tracks.filter(track=>{
    if(!track.target.endsWith('.translation')||track.valueType!=='vector3')return false;
    const name=track.target.slice(0,-12),path=source.nodeIdentities[name]?.path;
    if(!hipsPath||!path||!(hipsPath===path||hipsPath.startsWith(path+'/')))return false;
    const delta=extractRootMotion(clip,{target:track.target,fromTime:0,toTime:clip.duration}).delta;
    return Math.hypot(...delta)>source.meshBindHeight*1e-6;
  }).sort((a,b)=>(source.nodeIdentities[a.target.slice(0,-12)]?.path.length??Infinity)-(source.nodeIdentities[b.target.slice(0,-12)]?.path.length??Infinity));
  if(candidates.length>1)throw new Error(`Multiple translating root ancestors require an explicit owner: ${source.rig.id}:${clip.name}`);
  const track=candidates[0],output=structuredClone(pose);
  if(!track)return {pose:output,target:null,classification:'in-place-zero-travel-control',cumulative:[0,0,0] as Point,cycleDelta:[0,0,0] as Point,consumedBone:null,consumedLocal:[0,0,0] as Point};
  const name=track.target.slice(0,-12),parent=source.parentWorldMatrices[name]!;
  const rootPath=source.nodeIdentities[name]!.path;
  for(const ancestorTrack of clip.tracks){
    const dot=ancestorTrack.target.lastIndexOf('.'),nodeName=ancestorTrack.target.slice(0,dot),channel=ancestorTrack.target.slice(dot+1),nodePath=source.nodeIdentities[nodeName]?.path;
    if(!nodePath||!rootPath.startsWith(nodePath+'/')||!['translation','rotation','scale'].includes(channel))continue;
    const rest=source.bindPose.bones[nodeName];
    const expected=channel==='rotation'&&rest?.rotation?[rest.rotation.x,rest.rotation.y,rest.rotation.z,rest.rotation.w]:channel==='translation'&&rest?.position?[rest.position.x,rest.position.y,rest.position.z]:channel==='scale'&&rest?.scale?[rest.scale.x,rest.scale.y,rest.scale.z]:undefined;
    // A constant track is safe only if it is the observed bind transform. Equal
    // CUBICSPLINE endpoints alone are insufficient: nonzero tangents can move the
    // parent between keys. Missing tangents follow the runtime's zero default.
    const matches=expected&&ancestorTrack.keyframes.every(key=>Array.isArray(key.value)&&key.value.length===expected.length&&key.value.every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v-expected[i]!)<=1e-7*Math.max(1,Math.abs(expected[i]!)))&&[key.inTangent,key.outTangent].every(t=>t===undefined||(Array.isArray(t)&&t.length===expected.length&&t.every(v=>v===0))));
    if(!matches)throw new Error(`Unsupported animated root parent transform: ${source.rig.id}:${clip.name}:${ancestorTrack.target}`);
  }
  if(!parent||parent.length!==16||parent.some(v=>!Number.isFinite(v)))throw new Error('Missing finite observed root parent matrix');
  const delta=extractRootMotion(clip,{target:track.target,fromTime:0,toTime:time}).delta;
  const cycle=extractRootMotion(clip,{target:track.target,fromTime:0,toTime:clip.duration}).delta;
  const scale=target.meshBindHeight/source.meshBindHeight;
  const world=(d:readonly number[]):Point=>[0,1,2].map(i=>(parent[i]!*d[0]!+parent[i+4]!*d[1]!+parent[i+8]!*d[2]!)*scale) as unknown as Point;
  const binding=Object.values(map.bindings).find(b=>b?.source.name===name);
  let consumedBone:string|null=null;let consumedLocal:Point=[0,0,0];
  if(binding){const transform=output.bones[binding.target.name];if(!transform?.position)throw new Error('Mapped root translation has no target position');consumedBone=binding.target.name;consumedLocal=delta.map(v=>v*binding.scale) as unknown as Point;output.bones[consumedBone]={...transform,position:{x:transform.position.x-consumedLocal[0],y:transform.position.y-consumedLocal[1],z:transform.position.z-consumedLocal[2]}};}
  return {pose:output,target:track.target,classification:'authored-root-translation-consumed-once',cumulative:world(delta),cycleDelta:world(cycle),consumedBone,consumedLocal};
}

/** Algebraic identity is narrower than visual/contact quality; cross-rig decisions stay open. */
export function compareMappedPose(source: AnimationPose, output: AnimationPose, map: ReturnType<typeof createHumanoidRetargetingMap>) {
  let maxPositionError = 0, maxRotationErrorRadians = 0, maxScaleError = 0, comparedBones = 0;
  const missing: string[] = [];
  for (const binding of Object.values(map.bindings)) {
    if (!binding) continue;
    const a = source.bones[binding.source.name], b = output.bones[binding.target.name];
    if (!a || !b) { missing.push(binding.bone); continue; }
    comparedBones++;
    if (a.position && b.position) maxPositionError = Math.max(maxPositionError, Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z));
    else if (a.position || b.position) missing.push(`${binding.bone}.position`);
    if (a.scale && b.scale) maxScaleError=Math.max(maxScaleError, Math.hypot(a.scale.x-b.scale.x,a.scale.y-b.scale.y,a.scale.z-b.scale.z));
    else if(a.scale || b.scale) missing.push(`${binding.bone}.scale`);
    if (a.rotation && b.rotation) {
      const qa=a.rotation,qb=b.rotation;
      const norm=Math.hypot(qa.x,qa.y,qa.z,qa.w)*Math.hypot(qb.x,qb.y,qb.z,qb.w);
      maxRotationErrorRadians=Math.max(maxRotationErrorRadians, norm>0 ? 2*Math.acos(Math.min(1,Math.abs((qa.x*qb.x+qa.y*qb.y+qa.z*qb.z+qa.w*qb.w)/norm))) : Infinity);
    } else if(a.rotation || b.rotation) missing.push(`${binding.bone}.rotation`);
  }
  const finite = Number.isFinite(maxPositionError) && Number.isFinite(maxRotationErrorRadians) && Number.isFinite(maxScaleError);
  return { comparedBones, missing, maxPositionError, maxRotationErrorRadians, maxScaleError,
    identityPreserved: map.sourceRigId===map.targetRigId && map.ok && map.requiredCoverage===1 && comparedBones>0 && missing.length===0 && finite && maxPositionError<=1e-6 && maxRotationErrorRadians<=1e-6 && maxScaleError<=1e-6 };
}

/** Geometry diagnostics are not stance/contact certification: no support motion is inferred. */
export function measureWorldGeometry(rig: HumanoidRigDefinition, bind: Record<string, Point>, posed: Record<string, Point>) {
  const segments = [];
  const missing = [];
  for (const [parent, child] of Object.entries(CHILD)) {
    const a = rig.bones[parent as HumanoidBoneName]?.name;
    const b = rig.bones[child]?.name;
    if (!a || !b || !bind[a] || !bind[b] || !posed[a] || !posed[b]) { missing.push(`${parent}:${child}`); continue; }
    const bindLength = distance(bind[a], bind[b]);
    const posedLength = distance(posed[a], posed[b]);
    segments.push({ parent, child, bindLength, posedLength,
      relativeLengthChange: bindLength > 1e-12 ? Math.abs(posedLength-bindLength)/bindLength : null,
      from: posed[a], to: posed[b] });
  }
  const feet = (["leftFoot", "leftToes", "rightFoot", "rightToes"] as const)
    .flatMap(slot => { const name=rig.bones[slot]?.name; return name && bind[name] && posed[name] ? [{slot,name,bind:bind[name],posed:posed[name]}] : []; });
  const supportY = feet.length ? Math.min(...feet.map(foot=>foot.bind[1])) : null;
  return { positions:posed, segments, missingSegments:missing,
    maxRelativeSegmentLengthChange:segments.length ? Math.max(...segments.map(row=>row.relativeLengthChange ?? 0)) : null,
    contactGeometry:{ definition:"Joint heights relative to minimum bind foot/toe joint plane; not mesh contact or stance evidence", supportY,
      feet:feet.map(foot=>({...foot,heightAboveBindPlane:foot.posed[1]-supportY!, displacementFromBind:distance(foot.bind,foot.posed)})) },
    complete:false };
}

export async function produceRigPairEvidence() {
  const rigs = [];
  for (const entry of CERTIFIED_RIG_ROSTER) {
    const measured = await measureCertifiedRig(entry.rigId,entry.file,"options" in entry ? entry.options : {});
    rigs.push({ ...measured, sourceLineage: "sourceFile" in entry ? { sourceFile:entry.sourceFile,
      sourceSha256:hash(readFileSync(entry.sourceFile)), admission:entry.admission,
      derivation:JSON.parse(readFileSync(`${entry.file}.provenance.json`,"utf8")) } : null });
  }
  const donor = await measureCertifiedRig(TRANSLATED_LOCOMOTION_SOURCE.rigId, TRANSLATED_LOCOMOTION_SOURCE.file);
  const donorClip = donor.clips.find(clip => clip.name === TRANSLATED_LOCOMOTION_SOURCE.clip);
  if (!donorClip) throw new Error(`Missing translated locomotion clip: ${TRANSLATED_LOCOMOTION_SOURCE.clip}`);
  const unsupportedSourceClips = rigs.map(source => ({
    source: source.rig.id,
    clips: source.clips.map(clip => clip.name),
    namedLocomotionClips: source.clips.filter(clip => /walk|run|locomotion/i.test(clip.name)).map(clip => clip.name),
  }));
  const pairs = [];
  for (const source of rigs) for (const target of rigs) {
    const donorToSource=createHumanoidRetargetingMap(donor.rig,source.rig);
    const sourceToTarget=createHumanoidRetargetingMap(source.rig,target.rig);
    const donorToTarget=createHumanoidRetargetingMap(donor.rig,target.rig);
    const samples=[];
    const targetAsset=runtimeAssets.get(target.rig)!;
    const targetScene=targetAsset.createScene();
    const runtime=createGLTFSceneAnimationRuntime({scene:targetScene,clips:targetAsset.animations,asset:targetAsset});
    for (let index=0,subdivisions=60;index<=subdivisions;index++) {
      const time=donorClip.duration*index/subdivisions;
      const donorPose: AnimationPose=structuredClone(donor.bindPose);
      const unsampledTracks: string[] = [];
      for (const track of donorClip.tracks) {
        const dot=track.target.lastIndexOf("."), name=track.target.slice(0,dot), channel=track.target.slice(dot+1);
        const value=track.sample(time);
        if (!Array.isArray(value) && !ArrayBuffer.isView(value)) { unsampledTracks.push(track.target); continue; }
        const values=Array.from(value as ArrayLike<number>),original=donorPose.bones[name] ?? {};
        if(channel==="translation") donorPose.bones[name]={...original,position:{x:values[0]!,y:values[1]!,z:values[2]!}};
        if(channel==="scale") donorPose.bones[name]={...original,scale:{x:values[0]!,y:values[1]!,z:values[2]!}};
        if(!["translation","rotation","scale"].includes(channel)) unsampledTracks.push(track.target);
        if(channel==="rotation") donorPose.bones[name]={...original,rotation:{x:values[0]!,y:values[1]!,z:values[2]!,w:values[3]!}};
      }
      // The provenance-backed donor supplies one translated clip to every
      // certified source rig. Each measured source pose is then retargeted to
      // every certified target rig, producing the required 4x4 ordered matrix.
      const sourcePose=retargetHumanoidPose(donorPose,donorToSource);
      const rawOutput=retargetHumanoidPose(sourcePose,sourceToTarget);
      // Displacement remains owned by the original authored donor track and is
      // scaled directly into target space. This prevents chained retargeting
      // from consuming or applying root travel twice.
      const rootMotion=consumePairRootTranslation(rawOutput,donorToTarget,donor,target,donorClip,time);
      const output=preserveTargetBindShape(rootMotion.pose,target.bindPose);
      runtime.applyPose(target.bindPose,"restore-bind",0);
      const applied=runtime.applyPose(output,`pair:${source.rig.id}:${target.rig.id}`,time);
      targetScene.updateWorldTransforms();
      const posed: Record<string, Point> = {};
      targetScene.traverse(node=>{if(typeof node.userData.gltfNodeIndex!=="number")return;const matrix=node.transform.worldMatrix;posed[node.name]=[matrix[12]!,matrix[13]!,matrix[14]!];});
      samples.push({applied,worldGeometry:measureWorldGeometry(target.rig,target.positions,posed),unsampledTracks,clip:donorClip.name,clipSha256:hash(JSON.stringify(donorClip.toJSON())),time,sourcePose,targetPose:output,rootMotion:{...rootMotion,pose:undefined},identityMetrics:compareMappedPose(sourcePose,rawOutput,sourceToTarget)});
    }
    pairs.push({source:source.rig.id,target:target.rig.id,sourceAssetSha256:source.assetSha256,targetAssetSha256:target.assetSha256,map:sourceToTarget,samples,
      donorLineage:{rigId:donor.rig.id,assetSha256:donor.assetSha256,clip:donorClip.name,clipSha256:hash(JSON.stringify(donorClip.toJSON())),sourceMap:donorToSource},
      correctionValues:{schema:"aura3d-rig-pair-correction/v1",sourceRun:34023999653,samplesPerCycle:60,
        contactWindows:PAIR_CONTACT_PROFILES[target.rig.id as keyof typeof PAIR_CONTACT_PROFILES],
        ankleHeight:"measured-renderer-bind-ankle-to-lowest-sole",ground:"fixed-renderer-bind-sole-plane",lock:"root-runtime-foot-ik"},
      candidateDerivation:source.sourceLineage!==null||target.sourceLineage!==null,
      decision:sourceToTarget.ok?"measured-pair-correction-requires-rendered-revalidation":"unsupported-required-pair-open",
      supportedLocomotionClips:[donorClip.name],remaining:["world-space rendered pose quality","certified metric units and standing height","translated stance/contact/seam evidence"]});
  }
  return {schema:"aura3d-rig-pair-evidence/v1",createdAt:new Date().toISOString(),cwd:process.cwd(),command:process.argv,
    complete:false,
    translatedSource:{rigId:donor.rig.id,file:donor.file,assetSha256:donor.assetSha256,clip:donorClip.name,duration:donorClip.duration,clipSha256:hash(JSON.stringify(donorClip.toJSON())),provenance:JSON.parse(readFileSync(TRANSLATED_LOCOMOTION_SOURCE.provenanceFile,"utf8"))},
    unsupportedSourceClips,
    rigs:rigs.map(({clips,...rig})=>({...rig,clips:clips.map(c=>({name:c.name,duration:c.duration,sha256:hash(JSON.stringify(c.toJSON()))}))})),pairs};
}
export interface PairCorrectionDisposition {
  readonly status: "explicit-no-pair-map-correction" | "measured-pair-correction-applied" | "open";
  readonly rationale: string;
  readonly source: string;
  readonly target: string;
  readonly mapCoverage: number;
  readonly requiredCoverage: number;
  readonly correctionSchema: string | null;
}

/**
 * Convert the measured map/profile plus rendered oracle outcome into an explicit,
 * pair-specific correction disposition. A passing rendered result can close the
 * provisional revalidation state; a failed or unmapped pair always remains open.
 */
export function resolvePairCorrectionDisposition(
  pair: {
    readonly source: string;
    readonly target: string;
    readonly map: { readonly ok: boolean; readonly coverage: number; readonly requiredCoverage: number };
    readonly correctionValues?: { readonly schema?: string };
  },
  renderedQualityPass: boolean
): PairCorrectionDisposition {
  const base = {
    source: pair.source,
    target: pair.target,
    mapCoverage: pair.map.coverage,
    requiredCoverage: pair.map.requiredCoverage,
    correctionSchema: pair.correctionValues?.schema ?? null
  };
  if (!pair.map.ok || !renderedQualityPass) return {
    ...base,
    status: "open",
    rationale: !pair.map.ok
      ? "required source/target mapping is unsupported"
      : "measured rendered pose/contact quality did not pass"
  };
  if (pair.source === pair.target) return {
    ...base,
    status: "explicit-no-pair-map-correction",
    rationale: "same-rig source/target map preserves the measured bind pose; target contact windows and root-runtime foot locking passed the rendered oracle"
  };
  return {
    ...base,
    status: "measured-pair-correction-applied",
    rationale: "measured source/target rest-pose bindings and per-bone scale map plus target contact windows/root-runtime foot locking passed the rendered oracle"
  };
}

export function createBrowserFixture(evidence: Awaited<ReturnType<typeof produceRigPairEvidence>>) {
  return {schema:"aura3d-rig-pair-browser-fixture/v2",complete:false,translatedSource:evidence.translatedSource,unsupportedSourceClips:evidence.unsupportedSourceClips,
    rigs:evidence.rigs.map(row=>({id:row.rig.id,rigId:row.rig.id,height:row.height,meshBindHeight:row.meshBindHeight,meshBindTransforms:row.meshBindTransforms,meshSkinBindings:row.meshSkinBindings,meshBindBounds:row.meshBindBounds,file:row.file,assetSha256:row.assetSha256,rig:row.rig,bindPose:row.bindPose,sourceLineage:row.sourceLineage})),
    pairs:evidence.pairs.map(pair=>{
      const selected=pair.samples[0];
      return {source:pair.source,target:pair.target,map:pair.map,clip:selected?.clip ?? null,duration:selected?.clip===evidence.translatedSource.clip ? evidence.translatedSource.duration : 0,
        sourceAssetSha256:pair.sourceAssetSha256,targetAssetSha256:pair.targetAssetSha256,clipSha256:selected?.clipSha256 ?? null,
        correctionDecision:pair.decision,correctionValues:pair.correctionValues,
        clipSelection:"provenance-backed-translated-locomotion-candidate-unverified",
        samples:pair.samples.filter(sample=>sample.clip===selected?.clip).map(({time,sourcePose,targetPose,worldGeometry,rootMotion})=>({time,sourcePose,targetPose,worldGeometry,rootMotion}))};
    })};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output=process.argv[2];
  if(!output) throw new Error("Usage: tsx --tsconfig tsconfig.base.json tools/locomotion-301/rig-pair-evidence.ts <output.json>");
  const evidence=await produceRigPairEvidence();
  writeFileSync(output,JSON.stringify(evidence,null,2)+"\n");
  if(process.argv[3]) writeFileSync(process.argv[3],JSON.stringify(createBrowserFixture(evidence))+"\n");
}
