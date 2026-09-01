/**
 * Siege Golf course-world synth.
 *
 * Writes one original CC0, metre-scale glTF 2.0 binary world asset.  It is a
 * deliberately continuous, authored surface: fairway, sculpted rough, raised
 * stone banks, a fortified target court, side gardens, and a distant castle
 * silhouette all live in one +Y-up model.  The game keeps its validated
 * Rapier floor/walls as the collision authority; `src/course-world.ts` records
 * the exact visual-to-collider mapping so this asset never pretends to own
 * gameplay physics.
 *
 * Run: node apps/showcase-siege-golf/scripts/build-course-world.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/models");

function part() { return { positions: [], normals: [], indices: [], next: 0 }; }
function tri(p, a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  for (const point of [a, b, c]) { p.positions.push(...point); p.normals.push(n[0] / l, n[1] / l, n[2] / l); }
  p.indices.push(p.next, p.next + 1, p.next + 2); p.next += 3;
}
function quad(p, a, b, c, d) { tri(p, a, b, c); tri(p, a, c, d); }
function box(p, x, y, z, hx, hy, hz) {
  const v = [[x-hx,y-hy,z-hz],[x+hx,y-hy,z-hz],[x+hx,y-hy,z+hz],[x-hx,y-hy,z+hz],[x-hx,y+hy,z-hz],[x+hx,y+hy,z-hz],[x+hx,y+hy,z+hz],[x-hx,y+hy,z+hz]];
  quad(p,v[0],v[3],v[2],v[1]); quad(p,v[4],v[5],v[6],v[7]); quad(p,v[1],v[2],v[6],v[5]); quad(p,v[3],v[0],v[4],v[7]); quad(p,v[0],v[1],v[5],v[4]); quad(p,v[2],v[3],v[7],v[6]);
}
function cyl(p, x, y, z, r, height, segments = 12) {
  for (let i = 0; i < segments; i += 1) {
    const a = i * Math.PI * 2 / segments, b = (i + 1) * Math.PI * 2 / segments;
    const loA=[x+Math.cos(a)*r,y-height/2,z+Math.sin(a)*r], loB=[x+Math.cos(b)*r,y-height/2,z+Math.sin(b)*r];
    const hiA=[loA[0],y+height/2,loA[2]], hiB=[loB[0],y+height/2,loB[2]];
    quad(p,loA,loB,hiB,hiA); tri(p,[x,y+height/2,z],hiA,hiB); tri(p,[x,y-height/2,z],loB,loA);
  }
}
function slope(p, x, z, width, length, lowY, highY, towardNegativeZ) {
  const z0 = z - length / 2, z1 = z + length / 2;
  const near = towardNegativeZ ? highY : lowY, far = towardNegativeZ ? lowY : highY;
  const a=[x-width/2,near,z0], b=[x+width/2,near,z0], c=[x+width/2,far,z1], d=[x-width/2,far,z1];
  quad(p,a,b,c,d); quad(p,[a[0],0,a[2]],d,c,[b[0],0,b[2]]); quad(p,[a[0],0,a[2]],a,d,[d[0],0,d[2]]); quad(p,b,[b[0],0,b[2]],[c[0],0,c[2]],c);
}
function glb(path, entries) {
  const chunks=[], views=[], accessors=[], meshes=[], nodes=[]; let offset=0;
  const push = (array, target) => { const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength), pad=(4-data.length%4)%4; chunks.push(data,Buffer.alloc(pad)); views.push({buffer:0,byteOffset:offset,byteLength:data.length,target}); offset += data.length+pad; return views.length-1; };
  entries.forEach((entry, material) => {
    const p=entry.part, count=p.positions.length/3; if (!count) return;
    const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<p.positions.length;i+=3) for(let a=0;a<3;a+=1){min[a]=Math.min(min[a],p.positions[i+a]);max[a]=Math.max(max[a],p.positions[i+a]);}
    const pv=push(new Float32Array(p.positions),34962), nv=push(new Float32Array(p.normals),34962), iv=push(new Uint32Array(p.indices),34963);
    accessors.push({bufferView:pv,componentType:5126,count,type:"VEC3",min,max},{bufferView:nv,componentType:5126,count,type:"VEC3"},{bufferView:iv,componentType:5125,count:p.indices.length,type:"SCALAR"});
    meshes.push({name:entry.name,primitives:[{attributes:{POSITION:accessors.length-3,NORMAL:accessors.length-2},indices:accessors.length-1,material}]}); nodes.push({name:entry.name,mesh:meshes.length-1});
  });
  const binary=Buffer.concat(chunks), document={asset:{version:"2.0",generator:"Aura3D Siege Golf CC0 course-world synthesis"},scene:0,scenes:[{name:"siege-golf-continuous-world",nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials:entries.map((e)=>({name:e.name+" material",pbrMetallicRoughness:{baseColorFactor:e.color,metallicFactor:e.metallic??0,roughnessFactor:e.roughness??0.8},...(e.emissive?{emissiveFactor:e.emissive}:{})})),accessors,bufferViews:views,buffers:[{byteLength:binary.length}]};
  const raw=Buffer.from(JSON.stringify(document)), json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]), bin=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]), output=Buffer.alloc(12+8+json.length+8+bin.length);
  output.write("glTF",0); output.writeUInt32LE(2,4); output.writeUInt32LE(output.length,8); output.writeUInt32LE(json.length,12); output.writeUInt32LE(0x4e4f534a,16); json.copy(output,20); const h=20+json.length; output.writeUInt32LE(bin.length,h); output.writeUInt32LE(0x004e4942,h+4); bin.copy(output,h+8); mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,output); return output.length;
}

const earth=part(), turf=part(), turfLight=part(), stone=part(), trim=part(), foliage=part(), timber=part(), flame=part(), sky=part();

/*
 * The visible world is one compact causeway, not a landscape containing a
 * course. Its proportions are driven by hole 01's real interaction chain:
 * tee z=3.2 -> crate stack z=-4.6 -> cup z=-8.4. Every authored landmark is
 * attached to the same continuous base and stays outside the legal Rapier
 * lane. This lets the player read one route through the frame at a glance.
 */
box(earth,0,-0.38,-3.75,4.8,0.4,8.25);
box(stone,0,-0.02,-3.75,4.62,0.08,8.08);

// A single uninterrupted playable ribbon covers every legal x position.
box(turf,0,0.075,-3.75,3.62,0.035,8.0);
// Alternating inset mowing bands reinforce forward travel without becoming
// separate platforms: every band rests directly on the continuous ribbon.
for (let i=0;i<7;i+=1) {
  const z=2.0-i*2.18;
  box(i%2===0?turfLight:turf,0,0.116,z,3.48,0.008,1.02);
}

// Continuous low coping traces both sides from tee to keep, visually matching
// the real containment rails while leaving the whole playable surface open.
for (const side of [-1,1]) {
  box(stone,side*3.86,0.24,-3.75,0.24,0.24,8.06);
  box(trim,side*3.86,0.52,-3.75,0.3,0.06,8.08);
  // Repeated shield standards create scale and direction while remaining
  // physically outside the ball corridor.
  for(let i=0;i<6;i+=1) {
    const z=2.35-i*2.65;
    cyl(timber,side*4.18,0.72,z,0.075,0.72,8);
    box(flame,side*4.18,1.04,z,0.24,0.2,0.045);
  }
  // A grounded timber gallery follows the coping for the whole playable
  // chain.  Its posts align with the real route cadence and its two long rails
  // connect tee, obstacle and goal instead of reading as unrelated props.
  for(let i=0;i<9;i+=1) {
    const z=3.15-i*1.72;
    cyl(timber,side*4.42,0.82,z,0.075,1.18,8);
  }
  box(timber,side*4.42,0.72,-3.73,0.055,0.055,7.78);
  box(timber,side*4.42,1.08,-3.73,0.055,0.055,7.78);
}

// Two connected S-bands make the shot line visibly wind through the obstacle
// bay while remaining paint on the single validated flat Rapier lane.  Every
// segment overlaps its neighbour, so this is a continuous course marking, not
// a collection of floating stepping stones.
for (const side of [-1,1]) {
  let previousX=side*2.65, previousZ=2.75;
  for(let i=1;i<=18;i+=1) {
    const t=i/18, z=2.75-t*11.05;
    const x=side*(2.62-0.34*Math.sin(t*Math.PI*2));
    const dx=x-previousX, dz=z-previousZ;
    const length=Math.hypot(dx,dz)+0.08;
    const yaw=Math.atan2(dx,dz);
    const cx=(x+previousX)/2, cz=(z+previousZ)/2;
    // `box` is axis-aligned, so author the narrow diagonal strip explicitly.
    const hw=0.055, hl=length/2, c=Math.cos(yaw), s=Math.sin(yaw);
    const corner=(lx,lz)=>[cx+lx*c+lz*s,0.132,cz-lx*s+lz*c];
    quad(trim,corner(-hw,-hl),corner(hw,-hl),corner(hw,hl),corner(-hw,hl));
    previousX=x; previousZ=z;
  }
}

// Tee court is flush with the ribbon, framed by attached corner buttresses.
box(trim,0,0.118,3.22,3.28,0.012,0.82);
for (const side of [-1,1]) {
  box(stone,side*3.25,0.31,3.2,0.34,0.31,0.88);
  cyl(timber,side*3.25,0.98,3.2,0.12,0.95,8);
}

// The obstacle bay is a widening of the same causeway, not a bridge or island.
// Side towers bracket the real crate stack at z=-4.6 and point directly onward
// to the sensor court.
box(turfLight,0,0.122,-4.6,3.53,0.01,1.18);
for (const side of [-1,1]) {
  box(stone,side*3.24,0.36,-4.6,0.5,0.36,1.16);
  box(trim,side*3.24,0.77,-4.6,0.58,0.06,1.22);
  cyl(timber,side*3.24,1.12,-4.6,0.12,0.66,8);
}

// A U-shaped keep frames the actual cup at z=-8.4. Nothing sits beneath or in
// front of the sensor: the green flows directly into a bright, unmistakable
// goal court, with the fortress mass attached behind it.
box(turfLight,0,0.124,-8.35,3.5,0.012,1.36);
for (const side of [-1,1]) {
  box(stone,side*3.2,0.62,-8.55,0.56,0.62,1.28);
  box(trim,side*3.2,1.3,-8.55,0.66,0.08,1.34);
  cyl(stone,side*3.2,1.72,-9.34,0.5,0.82,12);
  cyl(trim,side*3.2,2.17,-9.34,0.58,0.08,12);
  box(timber,side*2.25,1.12,-9.28,0.08,1.02,0.08);
  box(flame,side*2.25,1.65,-9.28,0.42,0.28,0.045);
}
box(stone,0,1.02,-9.66,3.78,1.02,0.34);
box(trim,0,2.12,-9.66,3.9,0.08,0.4);
// Crenellations terminate the route at the target instead of creating a
// distant unrelated skyline.
for(let i=0;i<7;i+=1) box(trim,-3.3+i*1.1,2.42,-9.66,0.28,0.24,0.42);

// Low attached planting softens the outside of the causeway without widening
// the course or competing with the tee/obstacle/goal chain.
for(const side of [-1,1]) for(const [z,r] of [[1.2,0.42],[-1.8,0.5],[-6.7,0.46]]) {
  cyl(foliage,side*4.38,0.38,z,r,0.66,10);
}

// Grounded orchard silhouettes supply scale and cast readable vertical forms
// along the connected spectator rail.  They sit outside the real containment
// corridor and are part of the typed course-world asset.
for(const side of [-1,1]) for(const [z,h] of [[2.1,1.45],[-0.9,1.75],[-3.8,1.5],[-6.9,1.8]]) {
  const x=side*4.68;
  cyl(timber,x,h*0.34,z,0.11,h*0.68,9);
  cyl(foliage,x,h*0.88,z,0.48,h*0.58,10);
  cyl(foliage,x-side*0.25,h*0.77,z+0.12,0.34,h*0.44,9);
}

// A compact rally of pennants grows toward the sensor keep, reinforcing the
// direction and goal hierarchy rather than decorating random screen space.
for(const side of [-1,1]) for(let i=0;i<5;i+=1) {
  const z=1.8-i*2.25;
  cyl(timber,side*4.25,1.42,z,0.045,1.56,8);
  const width=0.25+i*0.035;
  box(flame,side*(4.25-width),1.85,z,width,0.19,0.025);
}

// Renderer-owned cloud banks sit behind the keep and make the golden-hour sky
// feel inhabited without CSS/canvas fakery.  They remain subordinate to the
// course and are included in the typed GLB evidence.
for(const [x,y,z,s] of [[-3.7,4.7,-11.4,1],[2.9,5.4,-12.0,0.85],[0.1,6.0,-13.0,0.7]]) {
  cyl(sky,x,y,z,0.72*s,0.34*s,12);
  cyl(sky,x+0.62*s,y+0.08*s,z,0.52*s,0.3*s,12);
  cyl(sky,x-0.56*s,y-0.03*s,z,0.48*s,0.28*s,12);
}

const bytes=glb(resolve(outDir,"siegeGolfCourseWorld.glb"),[
  {name:"continuous earth and banks",part:earth,color:[0.17,0.31,0.16,1],roughness:0.96},
  {name:"mown fairway and rough",part:turf,color:[0.08,0.40,0.22,1],roughness:0.88},
  {name:"sunlit fairway bands",part:turfLight,color:[0.18,0.55,0.30,1],roughness:0.9},
  {name:"warm fortress stone",part:stone,color:[0.36,0.29,0.20,1],roughness:0.84},
  {name:"sunlit coping",part:trim,color:[0.72,0.58,0.35,1],metallic:0.08,roughness:0.58},
  {name:"garden foliage",part:foliage,color:[0.13,0.44,0.23,1],roughness:0.94},
  {name:"palisade timber",part:timber,color:[0.31,0.15,0.07,1],roughness:0.72},
  {name:"target banners and torches",part:flame,color:[1,0.24,0.10,1],roughness:0.35,emissive:[0.82,0.08,0.015]},
  {name:"fortress cloud banks",part:sky,color:[0.88,0.97,0.91,1],roughness:1}
]);
console.log(`Siege Golf continuous course world: ${bytes} bytes, +Y up, x=[-5.16,5.16], y=[-0.78,6.17], z=[-13.72,4.5]`);
