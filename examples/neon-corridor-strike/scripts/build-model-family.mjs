#!/usr/bin/env node
/**
 * Neon Corridor Strike original CC0 model family.
 *
 * This is intentionally a single authored material language, rather than a
 * mixture of catalog assets: oxidised gunmetal, aged bronze, desaturated teal,
 * and restrained cyan/orange power cells.  The route-local Rapier hull stays
 * gameplay authority; the world mesh is the continuous visible shell that
 * makes that collision volume legible.  All outputs are deterministic glTF 2
 * binaries (+Y up, forward +Z), suitable for the normal typed-asset pipeline.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const blender = process.env.BLENDER_BIN ?? "/Applications/Blender.app/Contents/MacOS/Blender";
const blenderScript = resolve(dirname(fileURLToPath(import.meta.url)), "build-model-family-blender.py");
const blenderResult = spawnSync(blender, ["--background", "--factory-startup", "--python", blenderScript], {
  cwd: resolve(dirname(fileURLToPath(import.meta.url)), "../../.."), encoding: "utf8", maxBuffer: 64 * 1024 * 1024
});
process.stdout.write(blenderResult.stdout ?? ""); process.stderr.write(blenderResult.stderr ?? "");
if (blenderResult.status !== 0) process.exit(blenderResult.status ?? 1);
process.exit(0);

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/models");

function part() { return { positions: [], normals: [], indices: [], next: 0 }; }
function tri(p, a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
  for (const q of [a, b, c]) { p.positions.push(...q); p.normals.push(n[0] / l, n[1] / l, n[2] / l); }
  p.indices.push(p.next, p.next + 1, p.next + 2); p.next += 3;
}
function quad(p, a, b, c, d) { tri(p, a, b, c); tri(p, a, c, d); }
function box(p, x, y, z, hx, hy, hz) {
  const v = [[x-hx,y-hy,z-hz],[x+hx,y-hy,z-hz],[x+hx,y-hy,z+hz],[x-hx,y-hy,z+hz],[x-hx,y+hy,z-hz],[x+hx,y+hy,z-hz],[x+hx,y+hy,z+hz],[x-hx,y+hy,z+hz]];
  quad(p,v[0],v[3],v[2],v[1]); quad(p,v[4],v[5],v[6],v[7]); quad(p,v[1],v[2],v[6],v[5]); quad(p,v[3],v[0],v[4],v[7]); quad(p,v[0],v[1],v[5],v[4]); quad(p,v[2],v[3],v[7],v[6]);
}
function cyl(p, x, y, z, r, h, seg = 12) {
  for (let i = 0; i < seg; i += 1) { const a=i*Math.PI*2/seg,b=(i+1)*Math.PI*2/seg, loA=[x+Math.cos(a)*r,y-h/2,z+Math.sin(a)*r],loB=[x+Math.cos(b)*r,y-h/2,z+Math.sin(b)*r],hiA=[loA[0],y+h/2,loA[2]],hiB=[loB[0],y+h/2,loB[2]]; quad(p,loA,loB,hiB,hiA); tri(p,[x,y+h/2,z],hiA,hiB); tri(p,[x,y-h/2,z],loB,loA); }
}
function wedge(p, x, y, z, sx, sy, sz, taper = 0.55) {
  const a=[x-sx,y-sy,z-sz],b=[x+sx,y-sy,z-sz],c=[x+sx,y-sy,z+sz],d=[x-sx,y-sy,z+sz],e=[x-sx*taper,y+sy,z-sz*taper],f=[x+sx*taper,y+sy,z-sz*taper],g=[x+sx*taper,y+sy,z+sz*taper],h=[x-sx*taper,y+sy,z+sz*taper];
  quad(p,a,d,c,b); quad(p,e,f,g,h); quad(p,b,c,g,f); quad(p,d,a,e,h); quad(p,a,b,f,e); quad(p,c,d,h,g);
}
function prismXY(p, points, z, depth) {
  const front=points.map(([x,y])=>[x,y,z+depth]),back=points.map(([x,y])=>[x,y,z-depth]);
  for(let i=1;i<points.length-1;i+=1){tri(p,front[0],front[i],front[i+1]);tri(p,back[0],back[i+1],back[i]);}
  for(let i=0;i<points.length;i+=1){const j=(i+1)%points.length;quad(p,back[i],back[j],front[j],front[i]);}
}
function radialBlade(p,cx,cy,z,angle,inner,outer,rootWidth,tipWidth,depth,sweep=0) {
  const ux=Math.cos(angle),uy=Math.sin(angle),tx=-uy,ty=ux;
  const root=[cx+ux*inner,cy+uy*inner],tip=[cx+ux*outer+tx*sweep,cy+uy*outer+ty*sweep];
  prismXY(p,[
    [root[0]+tx*rootWidth,root[1]+ty*rootWidth],
    [tip[0]+tx*tipWidth,tip[1]+ty*tipWidth],
    [tip[0]-tx*tipWidth,tip[1]-ty*tipWidth],
    [root[0]-tx*rootWidth,root[1]-ty*rootWidth]
  ],z,depth);
}
function ellipsoid(p,cx,cy,cz,rx,ry,rz,rings=8,segments=16) {
  for(let r=0;r<rings;r+=1){const a=-Math.PI/2+r*Math.PI/rings,b=-Math.PI/2+(r+1)*Math.PI/rings;
    for(let s=0;s<segments;s+=1){const u=s*Math.PI*2/segments,v=(s+1)*Math.PI*2/segments;
      const point=(lat,lon)=>[cx+Math.cos(lat)*Math.cos(lon)*rx,cy+Math.sin(lat)*ry,cz+Math.cos(lat)*Math.sin(lon)*rz];
      const p0=point(a,u),p1=point(a,v),p2=point(b,v),p3=point(b,u);quad(p,p0,p1,p2,p3);
    }
  }
}
function writeGlb(path, label, entries) {
  const chunks = [], views = [], accessors = [], meshes = [], nodes = []; let offset = 0;
  const push = (a, target) => { const raw=Buffer.from(a.buffer,a.byteOffset,a.byteLength),pad=(4-raw.length%4)%4; chunks.push(raw,Buffer.alloc(pad));views.push({buffer:0,byteOffset:offset,byteLength:raw.length,target});offset+=raw.length+pad;return views.length-1; };
  entries.forEach((entry, material) => { const p=entry.part;if(!p.positions.length)return;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.positions.length;i+=3)for(let j=0;j<3;j+=1){min[j]=Math.min(min[j],p.positions[i+j]);max[j]=Math.max(max[j],p.positions[i+j]);}const pv=push(new Float32Array(p.positions),34962),nv=push(new Float32Array(p.normals),34962),iv=push(new Uint32Array(p.indices),34963);accessors.push({bufferView:pv,componentType:5126,count:p.positions.length/3,type:"VEC3",min,max},{bufferView:nv,componentType:5126,count:p.normals.length/3,type:"VEC3"},{bufferView:iv,componentType:5125,count:p.indices.length,type:"SCALAR"});meshes.push({name:entry.name,primitives:[{attributes:{POSITION:accessors.length-3,NORMAL:accessors.length-2},indices:accessors.length-1,material}]});nodes.push({name:entry.name,mesh:meshes.length-1}); });
  const bin=Buffer.concat(chunks),doc={asset:{version:"2.0",generator:"Aura3D Neon Corridor original CC0 model-family synthesis",extras:{license:"CC0-1.0",upAxis:"+Y",forwardAxis:"+Z",family:"Neon Corridor oxidised-bronze containment"}},scene:0,scenes:[{name:label,nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials:entries.map((e)=>({name:e.name+" material",pbrMetallicRoughness:{baseColorFactor:e.color,metallicFactor:e.metallic??0.15,roughnessFactor:e.roughness??0.72},...(e.emissive?{emissiveFactor:e.emissive}:{}),...(e.doubleSided?{doubleSided:true}:{})})),accessors,bufferViews:views,buffers:[{byteLength:bin.length}]};
  const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]),body=Buffer.alloc(12+8+json.length+8+((bin.length+3)&~3));body.write("glTF",0);body.writeUInt32LE(2,4);body.writeUInt32LE(body.length,8);body.writeUInt32LE(json.length,12);body.writeUInt32LE(0x4e4f534a,16);json.copy(body,20);const h=20+json.length;body.writeUInt32LE((bin.length+3)&~3,h);body.writeUInt32LE(0x004e4942,h+4);bin.copy(body,h+8);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,body);return body.length;
}

// One connected environment asset: deck, wall shells, recessed bays, arches,
// service machinery and the exit bulkhead all share the same dimensions as the
// route's unchanged visual/collision corridor.
const floor=part(), shell=part(), bronze=part(), inset=part(), glow=part(), machinery=part();
box(floor,0,-0.08,-1.0,3.08,0.13,11.1); box(inset,0,0.065,-1.0,1.34,0.018,10.7);
for (const side of [-1,1]) { box(shell,side*3.02,1.22,-1,0.16,1.42,11.1); box(bronze,side*2.82,0.34,-1,0.11,0.31,11.0); for (let z=8;z>-11;z-=3.05) { box(inset,side*2.84,1.27,z,0.035,0.78,1.17); box(bronze,side*2.73,1.92,z,0.12,0.12,1.24); box(glow,side*2.795,1.52,z,0.025,0.15,0.58); cyl(machinery,side*2.56,0.69,z-0.75,0.17,0.46,10); } }
box(shell,0,2.57,-1,3.18,0.16,11.1); box(inset,0,2.37,-1,2.64,0.035,10.8);
for (let z=8;z>-11;z-=3.05) { box(bronze,0,2.32,z,3.0,0.11,0.12); box(glow,0,2.29,z,1.22,0.024,0.045); }
for (const z of [6.65,0.55,-5.55]) { box(bronze,-2.82,1.26,z,0.14,1.34,0.12);box(bronze,2.82,1.26,z,0.14,1.34,0.12);box(bronze,0,2.15,z,2.92,0.12,0.12); }
box(shell,0,1.28,-11.0,3.18,1.48,0.18);box(inset,0,1.28,-11.2,2.28,1.0,0.035);box(bronze,0,2.1,-10.8,2.55,0.11,0.15);for(const x of [-2.2,2.2])cyl(machinery,x,1.05,-10.68,0.22,1.55,10);box(glow,0,2.1,-10.61,1.1,0.04,0.025);
for(const side of[-1,1])for(const z of[6.3,0.2,-5.9]){cyl(machinery,side*2.43,0.82,z,0.25,0.88,12);box(bronze,side*2.38,1.43,z,0.25,0.13,0.45);}

const worldBytes=writeGlb(resolve(out,"neonCorridorContainmentWorld.glb"),"Neon Corridor Containment World",[
  {name:"continuous oxidised deck",part:floor,color:[0.12,0.20,0.22,1],metallic:0.38,roughness:0.72},
  {name:"continuous containment shell",part:shell,color:[0.10,0.16,0.18,1],metallic:0.45,roughness:0.64},
  {name:"aged bronze structure",part:bronze,color:[0.31,0.21,0.13,1],metallic:0.62,roughness:0.52},
  {name:"recessed teal panels",part:inset,color:[0.12,0.30,0.30,1],metallic:0.32,roughness:0.68},
  {name:"restrained power cells",part:glow,color:[0.05,0.40,0.43,1],metallic:0.1,roughness:0.44,emissive:[0.025,0.22,0.24]},
  {name:"service machinery",part:machinery,color:[0.16,0.25,0.24,1],metallic:0.5,roughness:0.61}
]);

// The player tool intentionally remains cool/white.  That makes every warm
// Warden signal a threat read, instead of blending all combat roles into the
// teal/brown containment architecture.
function buildRifle() {
  const dark=part(), bronze=part(), coil=part(), glow=part();
  wedge(dark,0,0,0,0.19,0.12,0.67,0.62); box(dark,0,-0.07,0.68,0.11,0.09,0.48);
  box(bronze,0,0.10,0.1,0.15,0.06,0.42); box(bronze,-0.14,-0.22,-0.02,0.07,0.19,0.11);
  box(dark,0.1,-0.33,0.06,0.05,0.18,0.09); cyl(coil,0,0.1,0.58,0.082,0.36,10);
  cyl(glow,0,0.1,0.89,0.062,0.30,10); for(const x of[-0.16,0.16])box(bronze,x,0.01,0.32,0.035,0.045,0.35);
  box(coil,0,0.17,-0.28,0.10,0.025,0.18);
  return writeGlb(resolve(out,"neonContainmentPulseRifle.glb"),"Neon Containment Pulse Rifle",[
    {name:"charcoal receiver",part:dark,color:[0.065,0.10,0.12,1],metallic:0.7,roughness:0.4},
    {name:"bronze receiver ribs",part:bronze,color:[0.30,0.18,0.09,1],metallic:0.68,roughness:0.4},
    {name:"cobalt field coils",part:coil,color:[0.055,0.19,0.34,1],metallic:0.3,roughness:0.38},
    {name:"ivory blue charged bore",part:glow,color:[0.68,0.92,1,1],metallic:0.04,roughness:0.25,emissive:[0.32,0.66,0.9]}
  ]);
}

// The two Warden roles deliberately do not share a humanoid/block silhouette.
// A is a radial razor sentry with six swept vanes around an ovoid reactor;
// B is a broad manta-like interceptor with pointed wings and a vertical keel.
// Both remain rigid CC0 sculptures: route-local capsules own gameplay and the
// route never claims skeletal animation readiness.
function buildWarden(id, variant) {
  const armor=part(), warning=part(), stripe=part(), signal=part(), hot=part();
  if(!variant) {
    // Razor sentry: the outline is a six-point radial star, not a torso on
    // legs. Alternating swept vanes make rotation readable from either face.
    ellipsoid(armor,0,1.30,0,0.48,0.52,0.30,8,18);
    for(let i=0;i<6;i+=1) radialBlade(i%2===0?warning:armor,0,1.30,0,i*Math.PI/3,0.34,i%2===0?1.02:0.84,0.19,0.045,0.11,i%2===0?0.12:-0.10);
    // Three articulated landing talons root the hovering radial body into the
    // capsule footprint without reverting to paired humanoid legs.
    prismXY(armor,[[-0.34,1.05],[-0.62,0.15],[-0.35,0.02],[-0.13,0.92]],0,0.13);
    prismXY(armor,[[0.34,1.05],[0.62,0.15],[0.35,0.02],[0.13,0.92]],0,0.13);
    prismXY(stripe,[[-0.13,0.98],[0,0.05],[0.13,0.98]],-0.08,0.08);
    // Concentric front/back reactor eyes retain a clear aim point under patrol
    // rotation while the radial vanes carry the primary silhouette.
    for(const face of[-1,1]) {
      ellipsoid(signal,0,1.30,face*0.31,0.27,0.27,0.045,6,14);
      ellipsoid(hot,0,1.30,face*0.36,0.105,0.105,0.025,5,12);
      for(let i=0;i<3;i+=1) radialBlade(stripe,0,1.30,face*0.345,i*Math.PI*2/3,0.28,0.45,0.035,0.015,0.018,0);
    }
  } else {
    // Manta interceptor: one broad swept diamond wing and forked outer tips
    // establish a categorical role change from the radial sentry.
    prismXY(armor,[[-1.18,1.42],[-0.38,1.86],[0,1.58],[0.38,1.86],[1.18,1.42],[0.54,1.02],[0,0.88],[-0.54,1.02]],0,0.22);
    prismXY(warning,[[-1.25,1.48],[-0.72,1.75],[-0.94,1.24]],0.03,0.12);
    prismXY(warning,[[1.25,1.48],[0.72,1.75],[0.94,1.24]],0.03,0.12);
    // Forked wing claws and tall keel create negative space between limbs.
    for(const side of[-1,1]) {
      prismXY(armor,[[side*0.72,1.19],[side*1.05,0.22],[side*0.72,0.05],[side*0.43,1.02]],0,0.13);
      prismXY(stripe,[[side*0.77,1.16],[side*1.12,0.46],[side*0.98,0.38],[side*0.60,1.10]],0.15,0.045);
      radialBlade(warning,0,1.47,0.04,side>0?0.72:Math.PI-0.72,0.55,1.36,0.14,0.025,0.09,side*0.12);
    }
    prismXY(armor,[[-0.22,1.12],[0,2.48],[0.22,1.12]],-0.03,0.19);
    prismXY(warning,[[-0.11,1.32],[0,2.30],[0.11,1.32]],0.20,0.045);
    // Wide split visor and three hot optic cells distinguish the elite's face
    // from A's circular core at the exact opening camera.
    for(const face of[-1,1]) {
      prismXY(signal,[[-0.38,1.53],[-0.08,1.67],[0,1.56],[0.08,1.67],[0.38,1.53],[0,1.40]],face*0.235,0.035);
      for(const x of[-0.19,0,0.19]) ellipsoid(hot,x,1.54,face*0.285,0.055,0.038,0.018,4,10);
    }
  }
  return writeGlb(resolve(out,`${id}.glb`),id,[
    {name:variant?"manta interceptor armour":"razor sentry armour",part:armor,color:[0.075,0.12,0.13,1],metallic:0.52,roughness:0.46},
    {name:variant?"elite forked wing armour":"radial threat vanes",part:warning,color:variant?[0.72,0.07,0.035,1]:[0.92,0.24,0.035,1],metallic:0.26,roughness:0.34},
    {name:"directional warning edges",part:stripe,color:[1,0.58,0.06,1],metallic:0.12,roughness:0.31,emissive:[0.16,0.045,0.004]},
    {name:variant?"split elite visor":"circular reactor iris",part:signal,color:[0.95,0.055,0.018,1],roughness:0.22,emissive:[0.52,0.012,0.002]},
    {name:"ivory threat optics",part:hot,color:[1,0.84,0.48,1],roughness:0.2,emissive:[0.86,0.34,0.04]}
  ]);
}
const rifleBytes=buildRifle(), wardenABytes=buildWarden("neonContainmentWardenA",false), wardenBBytes=buildWarden("neonContainmentWardenB",true);
console.log(JSON.stringify({ worldBytes, rifleBytes, wardenABytes, wardenBBytes, output: out }, null, 2));
