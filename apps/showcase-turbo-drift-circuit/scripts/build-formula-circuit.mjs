/**
 * Deterministic, self-authored CC0 Formula-scale circuit for Turbo Drift.
 *
 * The previous Tsukuba extraction had a sub-car-width road once the typed Formula
 * pair was fitted.  This builder owns a single continuous asphalt ribbon, red/white
 * kerbs, gravel run-off, terrain, tyre walls and a pit complex in the same GLB, so
 * the visual road and the playable topology are no longer independent layers.
 *
 * Geometry is deliberately authored from this source file; registering the output as
 * CC0 keeps provenance truthful while the route keeps Rapier as contact authority.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OUTPUT = resolve(import.meta.dirname, "../generated/turboFormulaCircuit.glb");
const align4 = (value) => (value + 3) & ~3;
const pad = (buffer, fill = 0) => { const result = Buffer.alloc(align4(buffer.length), fill); buffer.copy(result); return result; };
const floats = (values) => { const out = Buffer.alloc(values.length * 4); values.forEach((v, i) => out.writeFloatLE(v, i * 4)); return out; };
const uints = (values) => { const out = Buffer.alloc(values.length * 4); values.forEach((v, i) => out.writeUInt32LE(v, i * 4)); return out; };

const materials = [
  ["Formula Circuit Asphalt", [0.075, 0.085, 0.09, 1], 0.72, 0.02],
  ["Formula Edge Red", [0.76, 0.035, 0.025, 1], 0.55, 0.03],
  ["Formula Edge White", [0.9, 0.86, 0.72, 1], 0.7, 0.01],
  ["Formula Runoff Gravel", [0.34, 0.255, 0.16, 1], 0.98, 0],
  ["Venue Grass", [0.09, 0.2, 0.11, 1], 0.96, 0],
  ["Venue Barrier", [0.48, 0.54, 0.56, 1], 0.42, 0.48],
  ["Venue Tyres", [0.018, 0.022, 0.025, 1], 0.97, 0.02],
  ["Paddock Orange", [0.72, 0.36, 0.12, 1], 0.67, 0.12],
  ["Paddock Roof", [0.1, 0.14, 0.17, 1], 0.48, 0.4]
];
const parts = materials.map(() => ({ positions: [], normals: [], indices: [] }));
function tri(part, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1; nx /= length; ny /= length; nz /= length;
  const base = part.positions.length / 3;
  for (const point of [a, b, c]) { part.positions.push(...point); part.normals.push(nx, ny, nz); }
  part.indices.push(base, base + 1, base + 2);
}
function quad(part, a, b, c, d) { tri(part, a, b, c); tri(part, a, c, d); }
function box(material, x, y, z, w, h, d) {
  const p = parts[material], hx = w / 2, hy = h / 2, hz = d / 2;
  const v = [[x-hx,y-hy,z-hz],[x+hx,y-hy,z-hz],[x+hx,y-hy,z+hz],[x-hx,y-hy,z+hz],[x-hx,y+hy,z-hz],[x+hx,y+hy,z-hz],[x+hx,y+hy,z+hz],[x-hx,y+hy,z+hz]];
  quad(p,v[0],v[3],v[2],v[1]); quad(p,v[4],v[5],v[6],v[7]); quad(p,v[0],v[1],v[5],v[4]); quad(p,v[1],v[2],v[6],v[5]); quad(p,v[2],v[3],v[7],v[6]); quad(p,v[3],v[0],v[4],v[7]);
}
function disk(material, x, y, z, radius, height, sides = 12) {
  const p = parts[material], lower = [], upper = [];
  for (let i=0;i<sides;i+=1) { const a=i*Math.PI*2/sides; lower.push([x+Math.cos(a)*radius,y,z+Math.sin(a)*radius]); upper.push([x+Math.cos(a)*radius,y+height,z+Math.sin(a)*radius]); }
  for (let i=0;i<sides;i+=1) { const n=(i+1)%sides; quad(p,lower[i],lower[n],upper[n],upper[i]); tri(p,[x,y,z],lower[n],lower[i]); tri(p,[x,y+height,z],upper[i],upper[n]); }
}

// A long lap with a braking hairpin, open sweepers and a certified start/pit straight.
//
// The hash-bound authored centreline owns its seam at the circuit's western edge.
// Its first 6.75 units are exactly vertical and therefore zero-curvature asphalt,
// exceeding the trace-derived 6.75-unit encounter floor without changing either
// vehicle's start gap, pace, steering, or camera behavior.
const control = [[-13,1],[-13,-8],[-12.5,-9.1],[-11,-9.8],[-8,-10],[-2,-10],[5,-9],[11,-5],[12,1],[9,6],[4,7.5],[-3,7.5],[-9,7],[-13,5],[-13,1]];
const line = [];
for (let i=0;i<control.length-1;i+=1) {
  const a=control[i], b=control[i+1];
  for (let j=0;j<4;j+=1) { const t=j/4; line.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]); }
}
const width = 3.6, kerb = 0.42, runoff = 2.65;
function offset(pointIndex, distance) {
  const prev=line[(pointIndex-1+line.length)%line.length], next=line[(pointIndex+1)%line.length], current=line[pointIndex];
  const dx=next[0]-prev[0], dz=next[1]-prev[1], len=Math.hypot(dx,dz)||1;
  return [current[0]-dz/len*distance,current[1]+dx/len*distance];
}
// The playable asphalt has authored elevation and camber.  This is geometry, not
// a route-side height formula: the compiler extracts these exact triangles and the
// vehicle chassis samples the resulting normal under each wheel.
function roadHeight(index, side = 0) {
  const phase = index / line.length * Math.PI * 2;
  return 0.04 + Math.sin(phase * 2) * 0.055 + Math.cos(phase * 3) * side * 0.035;
}
function ribbon(material, inner, outer, yAt) {
  const p=parts[material];
  for (let i=0;i<line.length;i+=1) { const n=(i+1)%line.length; quad(p,[inner[i][0],yAt(i,1),inner[i][1]],[inner[n][0],yAt(n,1),inner[n][1]],[outer[n][0],yAt(n,-1),outer[n][1]],[outer[i][0],yAt(i,-1),outer[i][1]]); }
}
const leftRoad=line.map((_,i)=>offset(i,width/2)), rightRoad=line.map((_,i)=>offset(i,-width/2));
const leftKerb=line.map((_,i)=>offset(i,width/2+kerb)), rightKerb=line.map((_,i)=>offset(i,-width/2-kerb));
const leftRun=line.map((_,i)=>offset(i,width/2+kerb+runoff)), rightRun=line.map((_,i)=>offset(i,-width/2-kerb-runoff));
ribbon(0,leftRoad,rightRoad,roadHeight);
for (let i=0;i<line.length;i+=1) { const n=(i+1)%line.length; const mat=i%2?1:2; quad(parts[mat],[leftRoad[i][0],roadHeight(i,1)+.012,leftRoad[i][1]],[leftRoad[n][0],roadHeight(n,1)+.012,leftRoad[n][1]],[leftKerb[n][0],roadHeight(n,1)+.008,leftKerb[n][1]],[leftKerb[i][0],roadHeight(i,1)+.008,leftKerb[i][1]]); quad(parts[mat],[rightKerb[i][0],roadHeight(i,-1)+.008,rightKerb[i][1]],[rightKerb[n][0],roadHeight(n,-1)+.008,rightKerb[n][1]],[rightRoad[n][0],roadHeight(n,-1)+.012,rightRoad[n][1]],[rightRoad[i][0],roadHeight(i,-1)+.012,rightRoad[i][1]]); }
ribbon(3,leftKerb,leftRun,(index, side) => roadHeight(index, side) - 0.018); ribbon(3,rightRun,rightKerb,(index, side) => roadHeight(index, side) - 0.018);
// One continuous outfield prevents the road ribbon from floating in black space.
box(4,-0.5,-0.15,-0.5,39,.24,33);
// Guards and tyre stacks follow the external shoulder at selected braking/corner zones.
for (let i=0;i<line.length;i+=2) { for (const sign of [1,-1]) { const point=offset(i,sign*(width/2+kerb+runoff+0.48)); disk(6,point[0],0.06,point[1],0.22,.35,10); if(i%4===0) disk(6,point[0]+0.02,0.4,point[1],0.22,.28,10); } }
for (const [x,z] of [[-13,-8],[11,-5],[9,6],[-9,7]]) { box(5,x,.42,z,2.1,.72,.18); }
// Visible pit buildings at the start straight; depth belongs to the venue, not a UI overlay.
for (let i=0;i<5;i+=1) { const z=3.5-i*2.05; box(7,-7.35,.72,z,1.55,1.35,1.65); box(8,-7.35,1.48,z,1.82,.18,1.92); }
box(8,-7.7,2.15,-0.6,.24,.16,11.8);

const chunks=[], views=[], accessors=[], primitives=[]; let byteOffset=0;
for (let material=0;material<parts.length;material+=1) { const part=parts[material]; if(!part.indices.length) continue; const position=pad(floats(part.positions)), normal=pad(floats(part.normals)), index=pad(uints(part.indices)); const pv=views.length; views.push({buffer:0,byteOffset,byteLength:position.length,target:34962}); chunks.push(position); byteOffset+=position.length; const nv=views.length; views.push({buffer:0,byteOffset,byteLength:normal.length,target:34962}); chunks.push(normal); byteOffset+=normal.length; const iv=views.length; views.push({buffer:0,byteOffset,byteLength:index.length,target:34963}); chunks.push(index); byteOffset+=index.length; const xs=part.positions.filter((_,i)=>i%3===0),ys=part.positions.filter((_,i)=>i%3===1),zs=part.positions.filter((_,i)=>i%3===2); const pa=accessors.length; accessors.push({bufferView:pv,componentType:5126,count:part.positions.length/3,type:"VEC3",min:[Math.min(...xs),Math.min(...ys),Math.min(...zs)],max:[Math.max(...xs),Math.max(...ys),Math.max(...zs)]}); const na=accessors.length; accessors.push({bufferView:nv,componentType:5126,count:part.normals.length/3,type:"VEC3"}); const ia=accessors.length; accessors.push({bufferView:iv,componentType:5125,count:part.indices.length,type:"SCALAR",min:[0],max:[part.positions.length/3-1]}); primitives.push({attributes:{POSITION:pa,NORMAL:na},indices:ia,material}); }
const authoredCenterline=[...line.slice(1),line[0]];
const binary=Buffer.concat(chunks); const gltf={asset:{version:"2.0",generator:"Aura3D deterministic Formula Circuit builder",copyright:"CC0 1.0 — Aura3D authored circuit",extras:{license:"CC0-1.0",source:"apps/showcase-turbo-drift-circuit/scripts/build-formula-circuit.mjs",role:"primary-racing-track",orientation:{upAxis:"+Y",forwardAxis:"+Z"},racingGeometry:{minimumStartStraightLength:6.75,roadWidth:width,roadCenterline:authoredCenterline.map(([x,z])=>({x,z,width}))}}},scene:0,scenes:[{name:"Turbo Formula Venue",nodes:[0]}],nodes:[{name:"Turbo Formula Venue — continuous wide asphalt, kerbs and venue",mesh:0}],meshes:[{name:"Turbo Formula Venue",primitives}],materials:materials.map(([name,color,roughness,metallic])=>({name,pbrMetallicRoughness:{baseColorFactor:color,roughnessFactor:roughness,metallicFactor:metallic}})),accessors,bufferViews:views,buffers:[{byteLength:binary.length}]};
const json=pad(Buffer.from(JSON.stringify(gltf),"utf8"),0x20); const body=Buffer.alloc(12+8+json.length+8+binary.length); body.write("glTF",0,"ascii"); body.writeUInt32LE(2,4); body.writeUInt32LE(body.length,8); body.writeUInt32LE(json.length,12); body.writeUInt32LE(0x4e4f534a,16); json.copy(body,20); const binAt=20+json.length; body.writeUInt32LE(binary.length,binAt); body.writeUInt32LE(0x004e4942,binAt+4); binary.copy(body,binAt+8); mkdirSync(dirname(OUTPUT),{recursive:true}); writeFileSync(OUTPUT,body); console.log(JSON.stringify({output:OUTPUT,bytes:body.length,points:line.length,width},null,2));
