import { createHash } from "node:crypto";
import { deflateRawSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { FormatRegistry, createGLTFFormatAdapter } from "../../packages/assets/src/FormatRegistry";
import { AMFLoader, KMZLoader, LDrawLoader, TDSLoader, VRMLLoader, parse3DS, parseAMF, parseKMZ, parseLDraw, parseVRML } from "../../packages/assets/src/loaders/LegacySceneLoaders";
import { AMFLoader as PublicAMFLoader, TDSLoader as PublicTDSLoader, VRMLLoader as PublicVRMLLoader, LDrawLoader as PublicLDrawLoader, KMZLoader as PublicKMZLoader, parseAMF as publicParseAMF, parse3DS as publicParse3DS, parseVRML as publicParseVRML, parseLDraw as publicParseLDraw, parseKMZ as publicParseKMZ } from "../../packages/assets/src/importers";
import type { LegacySceneOptions as PublicLegacySceneOptions, LDrawImportOptions as PublicLDrawImportOptions, LegacySceneImport as PublicLegacySceneImport, KMZImport as PublicKMZImport, LoadedLegacySceneAsset as PublicLoadedLegacySceneAsset } from "../../packages/assets/src/importers";

// Small generated specimens: values are chosen here to exercise the public
// format grammars rather than adapted from another engine's test corpus.
const amf=`<?xml version="1.0"?><amf unit="millimeter" version="1.1">
  <material id="7"><color><r>1</r><g>0</g><b>0</b><a>1</a></color></material>
  <object id="1"><mesh><vertices>
   <vertex><coordinates><x>0</x><y>0</y><z>0</z></coordinates></vertex>
   <vertex><coordinates><x>10</x><y>0</y><z>0</z></coordinates></vertex>
   <vertex><coordinates><x>0</x><y>0</y><z>10</z></coordinates></vertex>
   <vertex><coordinates><x>0</x><y>10</y><z>0</z></coordinates></vertex>
  </vertices><volume materialid="7"><triangle><v1>0</v1><v2>1</v2><v3>2</v3></triangle>
   <triangle><v1>0</v1><v2>3</v2><v3>1</v3></triangle><triangle><v1>0</v1><v2>2</v2><v3>3</v3></triangle>
   <triangle><v1>1</v1><v2>3</v2><v3>2</v3></triangle></volume></mesh></object></amf>`;
const vrml=`#VRML V2.0 utf8
Transform { translation 2 3 4 children [
 DEF triangle Shape { appearance Appearance { material Material { diffuseColor 1 0 0 } }
  geometry IndexedFaceSet { solid FALSE coord Coordinate { point [0 0 0, 1 0 0, 1 1 0, 0 1 0] } coordIndex [0 1 2 3 -1] } }
 USE triangle
] }`;
const ldraw=`0 FILE main.ldr
1 4 10 0 0 1 0 0 0 1 0 0 0 1 part.dat
1 1 0 20 0 1 0 0 0 1 0 0 0 1 part.dat
0 FILE part.dat
3 16 0 0 0 10 0 0 0 10 0
0 NOFILE`;
const dae=`<COLLADA version="1.4.1">
 <library_images><image id="im"><init_from>original.png</init_from></image></library_images>
 <library_effects><effect id="fx"><profile_COMMON>
 <newparam sid="surf"><surface type="2D"><init_from>im</init_from></surface></newparam>
 <newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam>
 <technique sid="common"><lambert><diffuse><texture texture="samp" texcoord="UV"/></diffuse></lambert></technique>
 </profile_COMMON></effect></library_effects>
 <library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials>
 <library_geometries><geometry id="g"><mesh><source id="p"><float_array id="a" count="9">0 0 0 1 0 0 0 1 0</float_array>
 <technique_common><accessor source="#a" count="3" stride="3"/></technique_common></source>
 <vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1" material="M"><input semantic="VERTEX" source="#v"/><p>0 1 2</p></triangles>
 </mesh></geometry></library_geometries>
 <library_visual_scenes><visual_scene id="s"><node id="n"><instance_geometry url="#g"><bind_material><technique_common><instance_material symbol="M" target="#mat"/></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
 <scene><instance_visual_scene url="#s"/></scene></COLLADA>`;
const kml=`<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Model><Location><longitude>1</longitude><latitude>2</latitude></Location><Link><href>models/model.dae</href></Link><ResourceMap><Alias><sourceHref>original.png</sourceHref><targetHref>images/red.png</targetHref></Alias></ResourceMap></Model></Placemark></Document></kml>`;
const sha=(input:string|Uint8Array)=>createHash("sha256").update(input).digest("hex");
const dataUrl=(input:string|Uint8Array)=>`data:application/octet-stream;base64,${Buffer.from(input).toString("base64")}`;
function crc32(bytes:Uint8Array):number {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(id:number,...pieces:Buffer[]):Buffer {const body=Buffer.concat(pieces),head=Buffer.alloc(6);head.writeUInt16LE(id);head.writeUInt32LE(body.length+6,2);return Buffer.concat([head,body]);}
function u16(...numbers:number[]):Buffer {const out=Buffer.alloc(numbers.length*2);numbers.forEach((n,i)=>out.writeUInt16LE(n,i*2));return out;}
function f32(...numbers:number[]):Buffer {const out=Buffer.alloc(numbers.length*4);numbers.forEach((n,i)=>out.writeFloatLE(n,i*4));return out;}
function tds():Buffer {
 const material=chunk(0xafff,chunk(0xa000,Buffer.from("red\0")),chunk(0xa020,chunk(0x0011,Buffer.from([255,0,0]))));
 const points=chunk(0x4110,u16(3),f32(0,0,0, 1,0,0, 0,0,1));
 const faces=chunk(0x4120,u16(1),u16(0,1,2,0),chunk(0x4130,Buffer.from("red\0"),u16(1,0)));
 const uv=chunk(0x4140,u16(3),f32(0,0,1,0,0,1));
 return chunk(0x4d4d,chunk(0x3d3d,material,chunk(0x4000,Buffer.from("triangle\0"),chunk(0x4100,points,faces,uv))));
}
function zip(files:Array<[string,Uint8Array]>,compress=false):Buffer {
 const local:Buffer[]=[],directory:Buffer[]=[];let offset=0;
 for(const [filename,content] of files){
  const name=Buffer.from(filename),payload=compress?deflateRawSync(content):Buffer.from(content),crc=crc32(content),method=compress?8:0;
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(method,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(payload.length,18);l.writeUInt32LE(content.length,22);l.writeUInt16LE(name.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(payload.length,20);c.writeUInt32LE(content.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
  local.push(l,name,payload);directory.push(c,name);offset+=l.length+name.length+payload.length;
 }
 const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,dir,end]);
}
function png():Buffer {
 const pchunk=(type:string,data:Buffer)=>{const header=Buffer.alloc(4),kind=Buffer.from(type),crc=Buffer.alloc(4);header.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([kind,data])));return Buffer.concat([header,kind,data,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pchunk("IHDR",ihdr),pchunk("IDAT",deflateSync(Buffer.from([0,255,0,0,255]))),pchunk("IEND",Buffer.alloc(0))]);
}

describe("bounded legacy scene imports",()=>{
 it("exposes the five opt-in loaders and parsers from the public importer entry point",()=>{
  expect([PublicAMFLoader,PublicTDSLoader,PublicVRMLLoader,PublicLDrawLoader,PublicKMZLoader,publicParseAMF,publicParse3DS,publicParseVRML,publicParseLDraw,publicParseKMZ]).toEqual([AMFLoader,TDSLoader,VRMLLoader,LDrawLoader,KMZLoader,parseAMF,parse3DS,parseVRML,parseLDraw,parseKMZ]);
  const options:PublicLegacySceneOptions={maxNodes:10}, ldrawOptions:PublicLDrawImportOptions=options;
  const publicTypes:[PublicLegacySceneImport?,PublicKMZImport?,PublicLoadedLegacySceneAsset?]=[];
  expect(ldrawOptions.maxNodes).toBe(10);expect(publicTypes).toHaveLength(0);
 });
 it("imports plain and zipped AMF in meters and rejects malformed or unsupported input",async()=>{
  const loader=new AMFLoader(),asset=await loader.load({url:dataUrl(amf),type:"amf"},new LoadContext());
  expect(asset.meshes[0]!.positions).toEqual([[0,0,0],[expect.closeTo(.01),0,0],[0,expect.closeTo(.01),0],[0,0,expect.closeTo(-.01)]]);
  expect(asset.materials[0]!.baseColorFactor).toEqual([1,0,0,1]);loader.dispose(asset);expect(asset.disposed).toBe(true);
  const archived=zip([["model.amf",Buffer.from(amf)]],true);expect((await parseAMF(archived)).format).toBe("amf");
  expect((await parseAMF(amf.replace("</amf>",'<metadata type="name">example</metadata></amf>'))).diagnostics).toContain("AMF_UNSUPPORTED_METADATA");
  await expect(parseAMF(amf.replace("<v3>2</v3>","<v3>99</v3>"))).rejects.toThrow(/AMF_INDEX/);
  await expect(parseAMF(`<!DOCTYPE amf [<!ENTITY a "x">]>${amf}`)).rejects.toThrow(/DTD/);
  await expect(parseAMF(amf.replace("</amf>","<constellation id=\"2\"/></amf>"))).rejects.toThrow(/CONSTELLATION/);
  await expect(parseAMF(amf.replace('version="1.1"','version="2.0"'))).rejects.toThrow(/VERSION/);
  await expect(parseAMF(archived,{maxExpandedBytes:10})).rejects.toThrow(/LIMIT/);
 });
 it("imports 3DS chunks, UVs and material groups, and rejects invalid chunk lengths",async()=>{
  const bytes=tds(),loader=new TDSLoader(),asset=await loader.load({url:dataUrl(bytes),type:"3ds"},new LoadContext());
  expect(asset.meshes[0]!.positions).toEqual([[0,0,0],[1,0,0],[0,1,0]]);
  expect(asset.meshes[0]!.texcoords).toEqual([[0,0],[1,0],[0,1]]);
  expect(asset.materials[0]!.baseColorFactor).toEqual([1,0,0,1]);expect(asset.loaderDiagnostics.unsupportedFeatures).toContain("3DS_UNIT_ASSUMED_METERS");loader.dispose(asset);
  expect(()=>parse3DS(bytes.subarray(0,-1))).toThrow(/3DS_HEADER|TRUNCATED/);
  expect(()=>parse3DS(bytes,{maxVertices:2})).toThrow(/LIMIT/);
  const corrupt=Buffer.from(bytes);corrupt.writeUInt32LE(0xffffffff,8);expect(()=>parse3DS(corrupt)).toThrow(/TRUNCATED/);
 });
 it("preserves VRML grouping, transforms, DEF/USE and indexed quads",async()=>{
  const parsed=parseVRML(vrml),nodes=parsed.gltf.nodes as Array<{translation?:number[];children?:number[]}>;
  expect(nodes[0]!.translation).toEqual([2,3,4]);expect(nodes[0]!.children).toHaveLength(2);
  const loader=new VRMLLoader(),asset=await loader.load({url:dataUrl(vrml),type:"vrml"},new LoadContext());
  expect(asset.meshes).toHaveLength(2);expect(asset.meshes[0]!.indices).toEqual([0,1,2,0,2,3]);expect(asset.materials[0]!.doubleSided).toBe(true);loader.dispose(asset);
  expect(()=>parseVRML(vrml.replace("0 1 2 3 -1","0 1 9 -1"))).toThrow(/VRML_INDEX/);
  expect(()=>parseVRML(vrml.replace("translation 2 3 4","center 1 0 0"))).toThrow(/UNSUPPORTED_TRANSFORM/);
  expect(()=>parseVRML(vrml.replace("solid FALSE","convex FALSE"))).toThrow(/UNSUPPORTED_CONCAVE/);
 });
 it("resolves LDraw MPD subfiles, inherits colors and bounds expansion and cycles",async()=>{
  const loader=new LDrawLoader(),asset=await loader.load({url:dataUrl(ldraw),type:"ldraw"},new LoadContext());
  expect(asset.meshes).toHaveLength(2);expect(asset.meshes[0]!.positions[0]![0]).toBeCloseTo(.004);expect(asset.meshes[1]!.positions[0]![1]).toBeCloseTo(-.008);loader.dispose(asset);
  await expect(parseLDraw(ldraw,{maxTriangles:1})).rejects.toThrow(/GEOMETRY_LIMIT/);
  await expect(parseLDraw(ldraw,{maxNodes:2})).rejects.toThrow(/NODE_LIMIT/);
  await expect(parseLDraw(ldraw,{maxDependencies:1})).rejects.toThrow(/DEPENDENCY_LIMIT/);
  const cycle=`0 FILE a.ldr\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 a.ldr`;
  await expect(parseLDraw(cycle)).rejects.toThrow(/CYCLE/);
  await expect(parseLDraw('1 16 0 0 0 1 0 0 0 1 0 0 0 1 ../secret.dat')).rejects.toThrow(/PATH/);
 });
 it("applies root request headers, origin policy and dependency integrity to LDraw parts",async()=>{
  const root="https://example.test/models/main.ldr",partUrl="https://example.test/models/parts/brick.dat";
  const main="1 4 0 0 0 1 0 0 0 1 0 0 0 1 parts/brick.dat",part="3 16 0 0 0 10 0 0 0 10 0",old=globalThis.fetch,calls:string[]=[];
  try {
   globalThis.fetch=async(input,init)=>{const url=String(input);calls.push(url);expect(new Headers(init?.headers).get("x-asset")).toBe("test");return new Response(url===root?main:part);};
   const request={url:root,headers:{"x-asset":"test"},allowedOrigins:["https://example.test"],integrity:{version:1 as const,digest:sha(main),dependencies:{"parts/brick.dat":sha(part)},requireDependencies:true}};
   const loader=new LDrawLoader(),asset=await loader.load(request,new LoadContext());expect(calls).toEqual([root,partUrl]);expect(asset.legacyScene.dependencies).toEqual([partUrl]);loader.dispose(asset);
   await expect(loader.load({...request,integrity:{...request.integrity,dependencies:{"parts/brick.dat":"0".repeat(64)}}},new LoadContext())).rejects.toThrow(/integrity/i);
   await expect(loader.load({...request,integrity:{...request.integrity,dependencies:{}}},new LoadContext())).rejects.toThrow(/integrity/i);
  } finally {globalThis.fetch=old;}
 });
 it("loads a KMZ KML/Collada model and remapped embedded texture without network access",async()=>{
  const bytes=zip([["doc.kml",Buffer.from(kml)],["models/model.dae",Buffer.from(dae)],["images/red.png",png()]],true), parsed=await parseKMZ(bytes);
  expect(parsed.modelPath).toBe("models/model.dae");expect(parsed.diagnostics).toContain("KMZ_UNSUPPORTED_GEOGRAPHIC_LOCATION");
  const withPoint=kml.replace("</Document>","<Placemark><Point><coordinates>1,2</coordinates></Point></Placemark></Document>");
  const pointPackage=zip([["doc.kml",Buffer.from(withPoint)],["models/model.dae",Buffer.from(dae)],["images/red.png",png()]]);
  expect((await parseKMZ(pointPackage)).diagnostics).toContain("KMZ_UNSUPPORTED_POINT");
  const loader=new KMZLoader(),asset=await loader.load({url:dataUrl(bytes),type:"kmz"},new LoadContext());
  expect(asset.meshes).toHaveLength(1);expect(asset.images).toHaveLength(1);expect(asset.loaderDiagnostics.unsupportedFeatures).toContain("KMZ_UNSUPPORTED_GEOGRAPHIC_LOCATION");loader.dispose(asset);expect(asset.disposed).toBe(true);
  const traversal=zip([["../escape",Buffer.from("x")]]);await expect(parseKMZ(traversal)).rejects.toThrow(/PATH/);
  await expect(parseKMZ(bytes,{maxExpandedBytes:32})).rejects.toThrow(/LIMIT/);
  const corrupt=Buffer.from(bytes);corrupt[45]^=1;await expect(parseKMZ(corrupt)).rejects.toThrow();
  const missingAlias=zip([["doc.kml",Buffer.from(kml)],["models/model.dae",Buffer.from(dae)]]);await expect(parseKMZ(missingAlias)).rejects.toThrow(/RESOURCE_MAP/);
  await expect(parseKMZ(zip([["doc.kml",Buffer.from(kml.replace("models/model.dae","https://evil.test/a.dae"))],["models/model.dae",Buffer.from(dae)] ]))).rejects.toThrow(/PATH/);
 });
 it("honors cancellation and supports explicit format registry leases",async()=>{
  const controller=new AbortController();controller.abort();
  await expect(parseAMF(amf,{signal:controller.signal})).rejects.toThrow();
  expect(()=>parse3DS(tds(),{signal:controller.signal})).toThrow();
  expect(()=>parseVRML(vrml,{signal:controller.signal})).toThrow();
  await expect(parseLDraw(ldraw,{signal:controller.signal})).rejects.toThrow();
  const pending=new AbortController(),part="1 16 0 0 0 1 0 0 0 1 0 0 0 1 external.dat";
  const inFlight=parseLDraw(part,{signal:pending.signal,resolveDependency:async(_name,_url,signal)=>new Promise((_resolve,reject)=>signal!.addEventListener("abort",()=>reject(signal!.reason),{once:true}))});
  pending.abort();await expect(inFlight).rejects.toThrow();
  await expect(parseKMZ(Buffer.from("bad"),{signal:controller.signal})).rejects.toThrow();
  const registry=new FormatRegistry(),loader=new AMFLoader();registry.register(createGLTFFormatAdapter("amf",["amf"],loader));
  const lease=await registry.load({url:dataUrl(amf),type:"amf"},new LoadContext());expect(lease.renderable).toBe(true);
  const resources=await lease.createGLTFRenderResources();expect(resources.scene.collectRenderables()).toHaveLength(1);await lease.dispose();expect(lease.disposed).toBe(true);
 });
});
