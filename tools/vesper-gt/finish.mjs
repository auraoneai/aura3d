// Finish the normalized Idol mesh: correct its stance and give each surface its own studio response.
// Usage: node tools/vesper-gt/finish.mjs <normalized-coupe.glb> <finished-coupe.glb>
import { NodeIO } from "@gltf-transform/core";
import { KHRMaterialsClearcoat } from "@gltf-transform/extensions";
import sharp from "sharp";
import { fairPanels, addGlazing } from "./coachwork.mjs";

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error("Supply the normalized input and finished output paths.");
const io = new NodeIO().registerExtensions([KHRMaterialsClearcoat]);
const doc = await io.read(source);
const root = doc.getRoot();
const mesh = root.listMeshes()[0].setName("Vesper GT coachwork");
root.listNodes()[0].setName("VesperGT");
const original = mesh.listPrimitives()[0];
const attrs = Object.fromEntries(original.listSemantics().map(s => [s, original.getAttribute(s)]));
const indices = original.getIndices().getArray();
const pos = attrs.POSITION.getArray();
const normals = attrs.NORMAL.getArray();
const uv = attrs.TEXCOORD_0.getArray();
const originalMat = original.getMaterial();
const texture = originalMat.getBaseColorTexture();
const { data: base, info } = await sharp(texture.getImage()).removeAlpha().raw().toBuffer({resolveWithObject: true});
const originalAtlas = Buffer.from(base);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const coat = doc.createExtension(KHRMaterialsClearcoat);
const painted = originalMat.clone().setName("Midnight garnet lacquer").setBaseColorTexture(null).setBaseColorFactor([.215,.012,.029,1]).setMetallicFactor(.44).setRoughnessFactor(.32)
  .setMetallicRoughnessTexture(null).setNormalTexture(null);
painted.setExtension("KHR_materials_clearcoat", coat.createClearcoat().setClearcoatFactor(.48).setClearcoatRoughnessFactor(.24));
const glass = doc.createMaterial("Smoked canopy glazing").setBaseColorFactor([.018,.029,.038,1]).setMetallicFactor(.1).setRoughnessFactor(.23);
glass.setExtension("KHR_materials_clearcoat", coat.createClearcoat().setClearcoatFactor(.40).setClearcoatRoughnessFactor(.175));
const wheels = originalMat.clone().setName("Machined alloys and tire sidewalls").setNormalScale(.65);
const trim = originalMat.setName("Carbon, vents and brightwork").setNormalScale(.65);
const lamps = originalMat.clone().setName("Amber lamp lenses").setEmissiveFactor([.58,.16,.025]).setRoughnessFactor(.23);
const materials = [painted, glass, wheels, trim, lamps];
const groups = materials.map(() => []);

function sampleColor(vertex) {
  const x = clamp(Math.round(uv[vertex*2]*(info.width-1)), 0, info.width-1);
  const y = clamp(Math.round(uv[vertex*2+1]*(info.height-1)), 0, info.height-1);
  const i = (x+y*info.width)*info.channels;
  return originalAtlas.subarray(i, i+3);
}
function surface(vertex) {
  const [r,g,b] = sampleColor(vertex);
  const x=pos[vertex*3], y=pos[vertex*3+1], z=pos[vertex*3+2];
  if (z>1.18 && y>.32 && y<.95 && r>120 && r>1.2*g && g>1.8*b && g>55) return 4;
  if (r-g>13 && r-b>11 && r>1.35*g) return 0;
  if (y>1.05 && z<1.05 && z>-1.75 && Math.max(r,g,b)<68 && Math.max(r,g,b)-Math.min(r,g,b)<14) return 1;
  const wheelZ = z>0 ? .92 : -1.74;
  const wheelY = z>0 ? .5 : .66;
  if (Math.abs(x)>.64 && Math.hypot(z-wheelZ, y-wheelY)<.51) return 2;
  return 3;
}
for (let i=0; i<indices.length; i+=3) {
  const face = Array.from(indices.subarray(i,i+3));
  const labels = face.map(surface);
  const slot = labels[1]===labels[2] ? labels[1] : (labels[0]===labels[1] || labels[0]===labels[2]) ? labels[0] : 3;
  groups[slot].push(...face);
}
for (let i=0; i<base.length; i+=info.channels) {
  const r=base[i], g=base[i+1], b=base[i+2];
  // Pull red bodywork toward a consistent garnet albedo. Specular bands come from studio lights.
  const amber = g>b*1.35 && g>32;
  const mix=amber ? 0 : clamp((r-Math.max(g,b)-8)/42,0,1);
  const shade=clamp((r-115)*.24,-20,18);
  for (const [channel, tint] of [125+shade,24+shade*.28,42+shade*.38].entries())
    base[i+channel]=Math.round(base[i+channel]*(1-mix)+tint*mix);
}
texture.setImage(await sharp(base,{raw:info}).jpeg({quality:93}).toBuffer()).setMimeType("image/jpeg").setName("Vesper GT surface color");
const widthScale=2.08/2.765;
const pitch=.078, roll=.016;
let minY=Infinity, maxY=-Infinity;
for (let i=0; i<pos.length; i+=3) {
  pos[i+1]+=pitch*pos[i+2]+roll*pos[i];
  minY=Math.min(minY,pos[i+1]); maxY=Math.max(maxY,pos[i+1]);
}
const heightScale=1.29/(maxY-minY);
for (let i=0; i<pos.length; i+=3) {
  pos[i]*=widthScale;
  pos[i+1]=(pos[i+1]-minY)*heightScale;
  // Inverse-transpose normals and forward tangents preserve normal-map lighting on a sheared mesh.
  const nx=(normals[i]-roll*normals[i+1])/widthScale, ny=normals[i+1]/heightScale, nz=normals[i+2]-pitch*normals[i+1];
  const length=Math.hypot(nx,ny,nz);
  normals.set([nx/length,ny/length,nz/length],i);
  const j=i/3*4, tangent=attrs.TANGENT.getArray();
  const tx=tangent[j]*widthScale, ty=(tangent[j+1]+roll*tangent[j]+pitch*tangent[j+2])*heightScale, tz=tangent[j+2];
  const tLen=Math.hypot(tx,ty,tz);
  tangent.set([tx/tLen,ty/tLen,tz/tLen],j);
}
const shoulder = fairPanels(pos, normals);
for (const from of [1,3]) {
  const keep = [];
  for (let f=0; f<groups[from].length; f+=3) {
    const face=groups[from].slice(f,f+3);
    (face.every(v=>shoulder[v]>.55) ? groups[0] : keep).push(...face);
  }
  groups[from]=keep;
}
addGlazing(doc, mesh, glass, painted);
for (const [i,group] of groups.entries()) {
  if (!group.length) continue;
  const primitive=doc.createPrimitive().setMaterial(materials[i]);
  for (const [name, accessor] of Object.entries(attrs)) primitive.setAttribute(name,accessor);
  const accessor=doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(group)).setBuffer(root.listBuffers()[0]);
  primitive.setIndices(accessor);
  mesh.addPrimitive(primitive);
}
mesh.removePrimitive(original);
const oldIndex=original.getIndices();
original.dispose(); oldIndex.dispose();
await io.write(output, doc);
console.log(JSON.stringify(Object.fromEntries(groups.map((g,i)=>[materials[i].getName(),g.length/3]))));
