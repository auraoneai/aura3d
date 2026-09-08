/** Independent, read-only replay of retained root C1 pixel evidence. */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { strict as assert } from "node:assert";
const root=resolve(process.argv[2]??process.cwd());
const directory=resolve(root,"tests/reports/root-textured-c1/captures");
const hash=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
function pngReadback(bytes:Buffer,width:number,height:number):Buffer {
  const chunks:Buffer[]=[];
  assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  for(let i=8;i<bytes.length;){const size=bytes.readUInt32BE(i),type=bytes.toString("ascii",i+4,i+8);if(type==="IHDR"){assert.equal(bytes.readUInt32BE(i+8),width);assert.equal(bytes.readUInt32BE(i+12),height);assert.equal(bytes[i+16],8);assert.equal(bytes[i+17],6);}if(type==="IDAT")chunks.push(bytes.subarray(i+8,i+8+size));i+=size+12;}
  const scan=inflateSync(Buffer.concat(chunks)),stride=width*4,raw=Buffer.alloc(stride*height);assert.equal(scan.length,(stride+1)*height);
  for(let y=0;y<height;y++){assert.equal(scan[y*(stride+1)],0,"producer must retain lossless filter-0 RGBA");scan.copy(raw,(height-y-1)*stride,y*(stride+1)+1,(y+1)*(stride+1));}return raw;
}
const captures=new Map<string,{bytes:Buffer;value:any}>();let manifests=0;
for(const name of readdirSync(directory).filter(name=>name.endsWith(".json"))){
  const report=JSON.parse(readFileSync(resolve(directory,name),"utf8"));assert.equal(report.schema,"aura3d.root-material-captures/1");assert.equal(report.complete,true,report.test);assert(report.command.ancestors.some((entry:any)=>/playwright[^\n]*\btest\b/.test(entry.commandLine)));manifests++;
  for(const value of report.captures){
    assert.equal(value.backend,"webgl2");assert.equal(value.runtimeSurface,"production-runtime");assert.match(value.graphicsVersion,/^WebGL 2\.0/);assert(value.drawCalls>0);const bytes=readFileSync(resolve(root,value.raw.path)),png=readFileSync(resolve(root,value.png.path));
    assert.equal(hash(bytes),value.raw.sha256);assert.equal(hash(bytes),value.png.readbackSha256);assert.equal(hash(png),value.png.sha256);assert.equal(bytes.length,value.width*value.height*4);assert.deepEqual(pngReadback(png,value.width,value.height),bytes);
    assert(!captures.has(value.id),`duplicate capture ${value.id}`);captures.set(value.id,{bytes,value});
  }
}
function compare(a:string,b:string){const first=captures.get(a),second=captures.get(b);assert(first&&second,`missing captures ${a}/${b}`);assert.equal(first.bytes.length,second.bytes.length);let changed=0,sum=0;for(let i=0;i<first.bytes.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(first.bytes[i+c]!-second.bytes[i+c]!);sum+=d;if(d>12)changed++;}const pixels=first.bytes.length/4;return {changedFraction:changed/pixels,meanAbsoluteDelta:sum/pixels};}
const slots=["clearcoat","clearcoatRoughness","clearcoatNormal","sheenColor","sheenRoughness","iridescence","iridescenceThickness","anisotropy"];
const results:Record<string,unknown>={};
for(const slot of slots){
  const id=`extension:${slot}:`,report=JSON.parse(readFileSync(resolve(root,`tests/reports/root-textured-c1/extension-${slot}.json`),"utf8"));
  for(const mode of ["on","swapped","uv1","xform"]){const actual=compare(id+mode,id+(mode==="on"?"off":"on"));assert(actual.changedFraction>.001,`${slot}/${mode}`);assert.deepEqual(actual,report.deltas[mode]);results[id+mode]=actual;}
  assert.equal(compare(id+"disabled",id+"disabledOff").changedFraction,0);
  const missing=captures.get(id+"missing")!.value;assert(missing.warnings.some((w:string)=>w.includes("texture fetch failed")));assert(!missing.texturedMaterials.find((m:any)=>m.nodeName==="c1 subject box")?.pixelBacked);
  if(["clearcoat","clearcoatRoughness","sheenRoughness","iridescence","iridescenceThickness"].includes(slot))assert.equal(compare(id+"decoy",id+"on").changedFraction,0);
  if(slot==="anisotropy")assert(compare(id+"direction",id+"on").changedFraction>.001);
  const color=captures.get(`color:${slot}`);assert(color&&color.value.colorOracle);const oracle=color.value.colorOracle;
  const texel=[184,244,112,162];assert.deepEqual(oracle.texel,texel);
  const decode=(v:number)=>{const c=v/255;return Math.round(255*(c<=.04045?c/12.92:((c+.055)/1.055)**2.4));};
  const expected=slot==="sheenColor"?texel.slice(0,3).map(decode):slot==="sheenRoughness"?[162,162,162]:texel.slice(0,3);assert.deepEqual(oracle.expected,expected);
  let matches=0;for(let i=0;i<color.bytes.length;i+=4)if(expected.every((v,c)=>Math.abs(color.bytes[i+c]!-v)<=1))matches++;assert.equal(matches,oracle.matchingPixels);assert(matches>100);assert(oracle.shaderSubstitutions>0);
}
const all=JSON.parse(readFileSync(resolve(root,"tests/reports/root-textured-c1/all-extension-maps.json"),"utf8"));
for(const [control,metric] of Object.entries(all.deltas)){const actual=compare("all:on",`all:${control}`);assert(actual.changedFraction>.001);assert.deepEqual(actual,metric);results[`all:${control}`]=actual;}
for(const family of ["sheen","iridescence"]){const actual=compare(`combined:${family}:on`,`combined:${family}:off`);assert(actual.changedFraction>.001);assert.deepEqual(actual,JSON.parse(readFileSync(resolve(root,`tests/reports/root-textured-c1/combined-${family}.json`),"utf8")).delta);}
const baseReport=JSON.parse(readFileSync(resolve(root,"tests/reports/root-textured-c1/c1-probe.json"),"utf8"));
for(const [mode,base,key] of [["textured","baseline","texturedDelta"],["uv1","textured","uv1Delta"],["fullmaps","textured","fullmapsDelta"],["xform","textured","xformDelta"]]){
  const actual=compare(mode!,base!);assert(actual.changedFraction>.02);assert.deepEqual(actual,baseReport[key!]);results[mode!]=actual;
}
const procedural=captures.get("procedural")!.value;assert(procedural.warnings.some((warning:string)=>warning.includes("procedural texture")));assert(!procedural.texturedMaterials.find((material:any)=>material.nodeName==="c1 subject box")?.pixelBacked);
assert.equal(manifests,13,"all 12 original C1 tests and the new numerical color test must be retained");
console.log(JSON.stringify({status:"passed",manifests,captures:captures.size,comparisons:results},null,2));
