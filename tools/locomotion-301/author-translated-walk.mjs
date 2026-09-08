#!/usr/bin/env node
/** Deterministic derivative of the admitted Rival walk; preserves the authored articulated walk. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const source = 'public/aura-assets/auraClashRivalRig.c8d844dc.glb';
const output = process.argv[2] ?? 'tests/fixtures/locomotion-301/rival-translated-walk.glb';
const bytes = readFileSync(source);
const jsonLength = bytes.readUInt32LE(12);
const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binaryOffset = 20 + jsonLength;
const originalBinary = bytes.subarray(binaryOffset + 8, binaryOffset + 8 + bytes.readUInt32LE(binaryOffset));
const sourceClip = document.animations.find(clip => clip.name === 'Zombie_Walk_Fwd_Loop');
if (!sourceClip) throw new Error('Required authored walk missing');
const manifest = JSON.parse(readFileSync('apps/aura-clash-showcase/aura.assets.json', 'utf8'));
const assets = Array.isArray(manifest.assets) ? manifest.assets : Object.values(manifest.assets);
const admission = assets.find(asset => asset.id === 'auraClashRivalRig');
if (!admission?.provenance) throw new Error('Required source provenance missing');
const root = document.nodes.findIndex(node => node.name === 'root');
const sourceChannel = sourceClip.channels.find(channel => channel.target.node === root && channel.target.path === 'translation');
if (!sourceChannel) throw new Error('Required source root track missing');
const sourceSampler = sourceClip.samplers[sourceChannel.sampler];
const timeAccessor = document.accessors[sourceSampler.input];
const timeView = document.bufferViews[timeAccessor.bufferView];
const timeOffset = (timeView.byteOffset ?? 0) + (timeAccessor.byteOffset ?? 0);
const times = Array.from({ length: timeAccessor.count }, (_, index) => originalBinary.readFloatLE(timeOffset + index * (timeView.byteStride ?? 4)));
const duration = times.at(-1);
if (!(duration > 0)) throw new Error('Walk must have positive duration');
// Authored travel is a declared parameter, not a measured passing result. Stance/slip are
// measured independently after rendering this derivative through root + physical movement.
const cycleTravelMetres = 0.5;
const translations = Buffer.alloc(times.length * 12);
times.forEach((time, index) => translations.writeFloatLE(cycleTravelMetres * time / duration, index * 12 + 8));
const alignedLength = Math.ceil(originalBinary.length / 4) * 4;
let binary = Buffer.concat([originalBinary, Buffer.alloc(alignedLength - originalBinary.length), translations]);
const viewIndex = document.bufferViews.length;
document.bufferViews.push({ buffer: 0, byteOffset: alignedLength, byteLength: translations.length });
const accessorIndex = document.accessors.length;
document.accessors.push({ bufferView: viewIndex, componentType: 5126, count: times.length, type: 'VEC3', min: [0,0,0], max: [0,0,cycleTravelMetres] });
const translated = structuredClone(sourceClip);
translated.name = 'Aura301_Translated_Walk';
translated.samplers[sourceChannel.sampler].output = accessorIndex;
translated.extras = { sourceClip: sourceClip.name, authoredCycleTravelMetres: cycleTravelMetres, stanceQuality: 'requires-measurement', contactPhases: { left: [[0,0.5]], right: [[0.5,1]] }, contactPhaseUnits: 'normalized-cycle', ankleHeightMetres: 0.0905, ankleHeightBasis: 'bind ankle Y 0.08649997305652918 minus admitted mesh minY -0.004', authoringTool: 'tools/locomotion-301/author-translated-walk.mjs' };
document.animations.push(translated);
// The original boot sole shares calf influences. During planted-foot IK that bends the
// sole even with a fixed ankle. Author this derivative's fixed sole strip to the actual
// foot/toe chain; preserve all positions/indices and all other vertex weights.
const soleReweights = [];
const components = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4 };
function readAccessor(index) {
  const accessor=document.accessors[index], view=document.bufferViews[accessor.bufferView];
  const count=components[accessor.type], bytesPer=accessor.componentType===5126?4:accessor.componentType===5123?2:1;
  const start=(view.byteOffset??0)+(accessor.byteOffset??0), stride=view.byteStride??count*bytesPer;
  return Array.from({length:accessor.count},(_,row)=>Array.from({length:count},(_,lane)=>{
    const at=start+row*stride+lane*bytesPer;
    return accessor.componentType===5126?binary.readFloatLE(at):accessor.componentType===5123?binary.readUInt16LE(at):binary.readUInt8(at);
  }));
}
for(const node of document.nodes.filter(node=>node.mesh!==undefined&&node.skin!==undefined)) {
  const skin=document.skins[node.skin];
  for(const primitive of document.meshes[node.mesh].primitives) {
    if(primitive.attributes.JOINTS_0===undefined)continue;
    const positions=readAccessor(primitive.attributes.POSITION), joints=readAccessor(primitive.attributes.JOINTS_0), weights=readAccessor(primitive.attributes.WEIGHTS_0);
    let changed=0;
    for(const side of ['l','r']) {
      const footNode=document.nodes.findIndex(candidate=>candidate.name===`foot_${side}`);
      const family=new Set(); const collect=index=>{family.add(index);(document.nodes[index].children??[]).forEach(collect);};collect(footNode);
      const candidates=positions.map((point,index)=>({point,index,weight:weights[index].reduce((sum,value,lane)=>sum+(family.has(skin.joints[joints[index][lane]])?value:0),0)})).filter(row=>row.weight>=0.5);
      if(!candidates.length)continue;
      const min=Math.min(...candidates.map(row=>row.point[1])), max=Math.max(...candidates.map(row=>row.point[1]));
      for(const row of candidates.filter(row=>row.point[1]<=min+Math.max(1e-6,(max-min)*0.1))) {
        const original=[...weights[row.index]];
        weights[row.index]=original.map((value,lane)=>family.has(skin.joints[joints[row.index][lane]])?value/row.weight:0);
        if(original.some((value,lane)=>Math.abs(value-weights[row.index][lane])>1e-7)) {changed++;soleReweights.push({mesh:document.meshes[node.mesh].name,vertex:row.index,side,original,authored:weights[row.index]});}
      }
    }
    if(!changed)continue;
    const offset=binary.length, data=Buffer.alloc(weights.length*16);weights.forEach((row,index)=>row.forEach((value,lane)=>data.writeFloatLE(value,index*16+lane*4)));binary=Buffer.concat([binary,data]);
    const view=document.bufferViews.length;document.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});
    primitive.attributes.WEIGHTS_0=document.accessors.length;document.accessors.push({bufferView:view,componentType:5126,count:weights.length,type:'VEC4'});
  }
}
translated.extras.soleReweighting = { vertices:soleReweights.length, method:'Original foot-family weight >= 0.5; lowest 10% bind-height strip; renormalize existing foot/toe influences only.' };
document.buffers[0].byteLength = binary.length;
const jsonBytes = Buffer.from(JSON.stringify(document));
const json = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 32)]);
const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length + 8 + binary.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(binary.length, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
const result = Buffer.concat([header, json, binaryHeader, binary]);
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, result);
const sha256 = value => createHash('sha256').update(value).digest('hex');
writeFileSync(output + '.provenance.json', JSON.stringify({ schema: 'aura3d-authored-locomotion/v1', source, sourceSha256: sha256(bytes), sourceProvenance: admission.provenance, outputSha256: sha256(result), tool: 'tools/locomotion-301/author-translated-walk.mjs', toolSha256: sha256(readFileSync('tools/locomotion-301/author-translated-walk.mjs')), originalClip: sourceClip.name, clip: translated.name, duration, cycleTravelMetres, soleReweights, contactPhases: translated.extras.contactPhases, ankleHeightMetres: translated.extras.ankleHeightMetres, changes: ['Added a separate walk clip with authored half-metre forward root translation; original joint tracks and original clips retained.', 'Declared alternating half-cycle stance phases for FootIK authoring; 0.0905 m ankle target derives from bind ankle and admitted sole bounds. Passing stance quality must be independently measured.'], acceptance: 'unverified' }, null, 2) + '\n');
console.log(JSON.stringify({ output, sha256: sha256(result), duration, cycleTravelMetres }));
