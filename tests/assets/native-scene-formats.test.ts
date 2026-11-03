import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { deflateRawSync, deflateSync } from "node:zlib";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { FormatRegistry, createGLTFFormatAdapter } from "../../packages/assets/src/FormatRegistry";
import { parseFBX, FBXLoader } from "../../packages/assets/src/loaders/FBXLoader";
import { USDLoader } from "../../packages/assets/src/loaders/USDLoader";
import { parseCollada, ColladaLoader } from "../../packages/assets/src/loaders/ColladaLoader";
import { parseModel3MF, read3MFPackageEntries, Model3MFLoader } from "../../packages/assets/src/loaders/Model3MFLoader";
import { RhinoLoader, parseRhinoArchive, type RhinoDecoder } from "../../packages/assets/src/loaders/RhinoLoader";

const identity = "1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1";
const fbxSource = `FBXHeaderExtension: {
 FBXVersion: 7400
}
GlobalSettings: {
 Properties70: {
 P: "UnitScaleFactor", "double", "Number", "", 100
 }
}
Objects: {
 Geometry: 1, "Geometry::Tri", "Mesh" {
  Vertices: *9 { a: 0,0,0,1,0,0,0,1,0 }
  PolygonVertexIndex: *3 { a: 0,1,-3 }
  LayerElementUV: 0 {
   MappingInformationType: "ByPolygonVertex"
   ReferenceInformationType: "IndexToDirect"
   UV: *6 { a: 0,0,1,0,0,1 }
   UVIndex: *3 { a: 0,1,2 }
  }
 }
 Model: 2, "Model::Tri", "Mesh" { }
 Model: 3, "Model::Joint", "LimbNode" { }
 Material: 4, "Material::Red", "" {
  Properties70: { P: "DiffuseColor", "Color", "", "A", 1,0,0 }
 }
 Deformer: 5, "Deformer::Skin", "Skin" { }
 Deformer: 6, "SubDeformer::Joint", "Cluster" {
  Indexes: *3 { a: 0,1,2 }
  Weights: *3 { a: 1,1,1 }
  Transform: *16 { a: ${identity} }
  TransformLink: *16 { a: ${identity} }
 }
 AnimationCurveNode: 7, "AnimCurveNode::T", "" { }
 AnimationCurve: 8, "AnimCurve::X", "" {
  KeyTime: *2 { a: 0,46186158000 }
  KeyValueFloat: *2 { a: 0,2 }
 }
}
Connections: {
 C: "OO", 1,2
 C: "OO", 4,2
 C: "OO", 5,1
 C: "OO", 6,5
 C: "OO", 3,6
 C: "OP", 7,2,"Lcl Translation"
 C: "OP", 8,7,"d|X"
}
`;

const usdSource = `#usda 1.0
(
    metersPerUnit = 1
    upAxis = "Z"
    timeCodesPerSecond = 24
    startTimeCode = 0
)
def Xform "World" {
    double3 xformOp:translate.timeSamples = { 0: (0, 0, 0), 24: (1, 2, 3) }
    uniform token[] xformOpOrder = ["xformOp:translate"]
    def Mesh "Panel" {
        point3f[] points = [(0,0,0), (1,0,0), (1,1,0), (0,1,0)]
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0,1,2,3]
        texCoord2f[] primvars:st = [(0,0), (1,0), (1,1), (0,1)] (
            interpolation = "faceVarying"
        )
        rel material:binding = </World/Red>
        uniform token subdivisionScheme = "none"
    }
    def Material "Red" {
        token outputs:surface.connect = </World/Red/Surface.outputs:surface>
        def Shader "Surface" {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (1,0,0)
            float inputs:metallic = 0.25
            float inputs:roughness = 0.4
        }
    }
    def Camera "View" {
        float focalLength = 50
        float verticalAperture = 24
        float horizontalAperture = 36
        float2 clippingRange = (0.1, 100)
    }
    def DistantLight "Sun" {
        float inputs:intensity = 2
        float inputs:exposure = 1
        color3f inputs:color = (1,1,1)
    }
}
`;

const colladaSource = `<?xml version="1.0"?><COLLADA version="1.4.1">
<asset><unit meter="0.01"/><up_axis>Z_UP</up_axis></asset>
<library_images><image id="im"><init_from>texture.png</init_from></image></library_images>
<library_effects><effect id="fx"><profile_COMMON>
<newparam sid="surface"><surface type="2D"><init_from>im</init_from></surface></newparam>
<newparam sid="sampler"><sampler2D><source>surface</source></sampler2D></newparam>
<technique sid="common"><phong><diffuse><texture texture="sampler" texcoord="TEXCOORD0"/></diffuse><shininess><float>30</float></shininess></phong></technique>
</profile_COMMON></effect></library_effects>
<library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials>
<library_geometries><geometry id="geo"><mesh>
<source id="pos"><float_array id="pos-a" count="9">0 0 0 1 0 0 0 1 0</float_array><technique_common><accessor source="#pos-a" count="3" stride="3"/></technique_common></source>
<source id="uv"><float_array id="uv-a" count="6">0 0 1 0 0 1</float_array><technique_common><accessor source="#uv-a" count="3" stride="2"/></technique_common></source>
<vertices id="verts"><input semantic="POSITION" source="#pos"/></vertices><triangles material="body" count="1"><input semantic="VERTEX" source="#verts" offset="0"/><input semantic="TEXCOORD" source="#uv" offset="1" set="0"/><p>0 0 1 1 2 2</p></triangles>
</mesh></geometry></library_geometries>
<library_controllers><controller id="skin"><skin source="#geo">
<bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix>
<source id="joints"><Name_array id="joints-a" count="1">joint</Name_array><technique_common><accessor source="#joints-a" count="1"/></technique_common></source>
<source id="bind"><float_array id="bind-a" count="16">1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</float_array><technique_common><accessor source="#bind-a" count="1" stride="16"/></technique_common></source>
<source id="weights"><float_array id="weights-a" count="1">1</float_array><technique_common><accessor source="#weights-a" count="1"/></technique_common></source>
<joints><input semantic="JOINT" source="#joints"/><input semantic="INV_BIND_MATRIX" source="#bind"/></joints>
<vertex_weights count="3"><input semantic="JOINT" source="#joints" offset="0"/><input semantic="WEIGHT" source="#weights" offset="1"/><vcount>1 1 1</vcount><v>0 0 0 0 0 0</v></vertex_weights>
</skin></controller></library_controllers>
<library_animations><animation id="anim"><source id="time"><float_array id="time-a" count="2">0 1</float_array><technique_common><accessor source="#time-a" count="2"/></technique_common></source>
<source id="move"><float_array id="move-a" count="6">0 0 0 2 0 0</float_array><technique_common><accessor source="#move-a" count="2" stride="3"/></technique_common></source>
<source id="interp"><Name_array id="interp-a" count="2">LINEAR LINEAR</Name_array><technique_common><accessor source="#interp-a" count="2"/></technique_common></source>
<sampler id="samples"><input semantic="INPUT" source="#time"/><input semantic="OUTPUT" source="#move"/><input semantic="INTERPOLATION" source="#interp"/></sampler><channel source="#samples" target="joint/location"/></animation></library_animations>
<library_visual_scenes><visual_scene id="scene"><node id="joint"><translate sid="location">0 0 0</translate><node id="mesh"><instance_controller url="#skin"><bind_material><technique_common><instance_material symbol="body" target="#mat"/></technique_common></bind_material></instance_controller></node></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene></COLLADA>`;

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function zip(entries: [string, Uint8Array][], method: 0 | 8 = 0): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name), payload = method === 8 ? deflateRawSync(data) : Buffer.from(data), crc = crc32(data);
    const header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(method,8); header.writeUInt32LE(crc,14);
    header.writeUInt32LE(payload.length,18); header.writeUInt32LE(data.length,22); header.writeUInt16LE(nameBytes.length,26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20,4); directory.writeUInt16LE(20,6); directory.writeUInt16LE(method,10);
    directory.writeUInt32LE(crc,16); directory.writeUInt32LE(payload.length,20); directory.writeUInt32LE(data.length,24); directory.writeUInt16LE(nameBytes.length,28); directory.writeUInt32LE(offset,42);
    local.push(header,nameBytes,payload); central.push(directory,nameBytes); offset += header.length + nameBytes.length + payload.length;
  }
  const table = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(table.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,table,end]);
}
type FbxProperty = string | bigint | number[];
type FbxNode = { name: string; properties?: FbxProperty[]; children?: FbxNode[] };
function binaryFbx(version: 7400 | 7500 = 7400): Buffer {
  const versionBytes = Buffer.alloc(4); versionBytes.writeUInt32LE(version);
  const magic = Buffer.concat([Buffer.from("Kaydara FBX Binary  \0\x1a\0", "binary"), versionBytes]);
  const headerSize = version >= 7500 ? 25 : 13;
  const property = (value: FbxProperty): Buffer => {
    if (typeof value === "string") { const bytes=Buffer.from(value), size=Buffer.alloc(4); size.writeUInt32LE(bytes.length); return Buffer.concat([Buffer.from("S"),size,bytes]); }
    if (typeof value === "bigint") { const bytes=Buffer.alloc(8); bytes.writeBigInt64LE(value); return Buffer.concat([Buffer.from("L"),bytes]); }
    const integer = value.every(Number.isInteger), raw=Buffer.alloc(value.length * (integer ? 4 : 8));
    value.forEach((item,index) => integer ? raw.writeInt32LE(item,index * 4) : raw.writeDoubleLE(item,index * 8));
    const compressed=deflateSync(raw), header=Buffer.alloc(12); header.writeUInt32LE(value.length,0); header.writeUInt32LE(1,4); header.writeUInt32LE(compressed.length,8);
    return Buffer.concat([Buffer.from(integer ? "i" : "d"),header,compressed]);
  };
  const node = (input: FbxNode, start: number): Buffer => {
    const name=Buffer.from(input.name), properties=Buffer.concat((input.properties ?? []).map(property));
    let cursor=start+headerSize+name.length+properties.length;
    const children: Buffer[]=[];
    for (const child of input.children ?? []) { const value=node(child,cursor); children.push(value); cursor+=value.length; }
    if (input.children?.length) { children.push(Buffer.alloc(headerSize)); cursor+=headerSize; }
    const header=Buffer.alloc(headerSize);
    if (version >= 7500) { header.writeBigUInt64LE(BigInt(cursor),0); header.writeBigUInt64LE(BigInt(input.properties?.length ?? 0),8); header.writeBigUInt64LE(BigInt(properties.length),16); header.writeUInt8(name.length,24); }
    else { header.writeUInt32LE(cursor,0); header.writeUInt32LE(input.properties?.length ?? 0,4); header.writeUInt32LE(properties.length,8); header.writeUInt8(name.length,12); }
    return Buffer.concat([header,name,properties,...children]);
  };
  const tree: FbxNode[] = [{name:"Objects",children:[{name:"Geometry",properties:[1n,"Geometry::Tri","Mesh"],children:[{name:"Vertices",properties:[[0,0,0,1,0,0,0,1,0]]},{name:"PolygonVertexIndex",properties:[[0,1,-3]]}]},{name:"Model",properties:[2n,"Model::Tri","Mesh"]}]},{name:"Connections",children:[{name:"C",properties:["OO",1n,2n]}]}];
  let cursor = magic.length; const blocks: Buffer[]=[magic];
  for (const item of tree) { const bytes=node(item,cursor); blocks.push(bytes); cursor+=bytes.length; }
  blocks.push(Buffer.alloc(headerSize)); return Buffer.concat(blocks);
}
const usdTexturedSource = `#usda 1.0
(
 metersPerUnit = 1
)
def Xform "World" {
 def Mesh "Panel" {
  point3f[] points = [(0,0,0),(1,0,0),(0,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0,1,2]
  uniform token subdivisionScheme = "none"
  rel material:binding = </World/Mat>
 }
 def Material "Mat" {
  token outputs:surface.connect = </World/Mat/Surface.outputs:surface>
  def Shader "Surface" {
   uniform token info:id = "UsdPreviewSurface"
   color3f inputs:diffuseColor.connect = </World/Mat/Tex.outputs:rgb>
  }
  def Shader "Tex" {
   uniform token info:id = "UsdUVTexture"
   asset inputs:file = @color.png@
  }
 }
}`;
const modelRels = "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Target=\"/3D/3dmodel.model\" Id=\"rel0\" Type=\"http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel\"/></Relationships>";
const contentTypes = "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"model\" ContentType=\"application/vnd.ms-package.3dmanufacturing-3dmodel+xml\"/><Default Extension=\"png\" ContentType=\"image/png\"/></Types>";
const modelXml = "<?xml version=\"1.0\"?><model xmlns=\"http://schemas.microsoft.com/3dmanufacturing/core/2015/02\" xmlns:m=\"http://schemas.microsoft.com/3dmanufacturing/material/2015/02\" unit=\"millimeter\"><resources><basematerials id=\"1\"><base name=\"red\" displaycolor=\"#FF0000FF\"/></basematerials><object id=\"2\" name=\"triangle\" pid=\"1\" pindex=\"0\"><mesh><vertices><vertex x=\"0\" y=\"0\" z=\"0\"/><vertex x=\"1\" y=\"0\" z=\"0\"/><vertex x=\"0\" y=\"1\" z=\"0\"/></vertices><triangles><triangle v1=\"0\" v2=\"1\" v3=\"2\"/></triangles></mesh></object><object id=\"3\"><components><component objectid=\"2\" transform=\"1 0 0 0 1 0 0 0 1 0 0 5\"/></components></object></resources><build><item objectid=\"3\" transform=\"1 0 0 0 1 0 0 0 1 10 0 0\"/></build></model>";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"));
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const dataUrl = (value: string) => `data:application/octet-stream,${encodeURIComponent(value)}`;
const textBytes = (value: string) => new TextEncoder().encode(value);
function archive(model = modelXml, method: 0 | 8 = 0): Buffer {
  return zip([["_rels/.rels", textBytes(modelRels)], ["[Content_Types].xml", textBytes(contentTypes)], ["3D/3dmodel.model", textBytes(model)]], method);
}

describe("native scene format imports", () => {
  it("loads FBX geometry, UVs, material, skin and animation through the runtime", async () => {
    const parsed = await parseFBX(fbxSource);
    expect(parsed.unitInMeters).toBe(1);
    expect(parsed.gltf.skins).toHaveLength(1);
    expect(parsed.gltf.animations).toHaveLength(1);
    const loader = new FBXLoader();
    const asset = await loader.load({ url: dataUrl(fbxSource), type: "fbx" }, new LoadContext());
    expect(asset.meshes[0]!.texcoords).toEqual([[0,0],[1,0],[0,1]]);
    expect(asset.meshes[0]!.joints[0]).toEqual([0,0,0,0]);
    expect(asset.meshes[0]!.weights[0]).toEqual([1,0,0,0]);
    expect(asset.materials).toHaveLength(1);
    expect(asset.animations).toHaveLength(1);
    expect(asset.createScene().collectRenderables()).toHaveLength(1);
    loader.dispose(asset); expect(asset.disposed).toBe(true);
    await expect(parseFBX(fbxSource.replace("a: 0,1,-3", "a: 0,1,-7"))).rejects.toThrow(/FBX_INVALID_MESH/);
    await expect(parseFBX(fbxSource, { maxBytes: 10 })).rejects.toThrow(/FBX_LIMIT_BYTES/);
    await expect(parseFBX(fbxSource.replace("*9 { a:", "*8 { a:"))).rejects.toThrow(/FBX_INVALID_ARRAY/);
  });
  it("parses compressed binary FBX arrays with bounded and truncated input rejection", async () => {
    for (const version of [7400,7500] as const) {
      const bytes = binaryFbx(version);
      const parsed = await parseFBX(bytes);
      expect(parsed.version).toBe(version); expect(parsed.gltf.meshes).toHaveLength(1);
      await expect(parseFBX(bytes.subarray(0, bytes.length-40))).rejects.toThrow(/FBX_BINARY/);
      await expect(parseFBX(bytes, {maxArrayElements:4})).rejects.toThrow(/FBX_LIMIT/);
    }
  });
  it("triangulates concave FBX polygons and rejects malformed embedded textures", async () => {
    const source=`FBXHeaderExtension: { FBXVersion: 7400 }
Objects: {
 Geometry: 1,"Geometry::Concave","Mesh" {
  Vertices: *15 { a: 0,0,0,2,0,0,2,2,0,1,1,0,0,2,0 }
  PolygonVertexIndex: *5 { a: 0,1,2,3,-5 }
 }
 Model: 2,"Model::Concave","Mesh" { }
}
Connections: { C: "OO",1,2 }`;
    const loader=new FBXLoader(), asset=await loader.load({url:dataUrl(source),type:"fbx"},new LoadContext());
    const vertices=asset.meshes[0]!.positions;
    expect(vertices).toHaveLength(9);
    let area=0; for(let i=0;i<vertices.length;i+=3) { const a=vertices[i]!,b=vertices[i+1]!,c=vertices[i+2]!; area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2; }
    expect(area).toBe(3); loader.dispose(asset);
    const embedded = (content:string) => `FBXHeaderExtension: { FBXVersion: 7400 }
Objects: {
 Geometry: 1,"Geometry::Tri","Mesh" { Vertices: *9 { a: 0,0,0,1,0,0,0,1,0 } PolygonVertexIndex: *3 { a: 0,1,-3 } }
 Model: 2,"Model::Tri","Mesh" {}
 Material: 3,"Material::M","" {}
 Texture: 4,"Texture::T","" {}
 Video: 5,"Video::V","Clip" { Content: "${content}" }
}
Connections: {
 C: "OO",1,2
 C: "OO",3,2
 C: "OP",4,3,"DiffuseColor"
 C: "OO",5,4
}`;
    const good=await parseFBX(embedded(Buffer.from(png).toString("base64")),{maxTexturePixels:1,maxTextureDimension:1});
    expect(good.embeddedTexturePixels).toBe(1);
    const bad=Buffer.from(png); bad[30]^=1;
    await expect(parseFBX(embedded(bad.toString("base64")))).rejects.toThrow(/FBX_INVALID_TEXTURE/);
    await expect(parseFBX(embedded(Buffer.from(png).toString("base64")),{maxTexturePixels:0})).rejects.toThrow(/FBX_LIMIT_INVALID/);
    const abort=new AbortController(); abort.abort();
    await expect(parseFBX(embedded(Buffer.from(png).toString("base64")),{signal:abort.signal})).rejects.toThrow();
  });
  it("enforces FBX document and texture dependency hashes and request headers", async () => {
    const source = `FBXHeaderExtension: { FBXVersion: 7400 }
Objects: {
 Geometry: 1,"Geometry::Tri","Mesh" {
  Vertices: *9 { a: 0,0,0,1,0,0,0,1,0 }
  PolygonVertexIndex: *3 { a: 0,1,-3 }
 }
 Model: 2,"Model::Tri","Mesh" { }
 Material: 3,"Material::M","" { }
 Texture: 4,"Texture::T","" { RelativeFilename: "tex/pixel.png" }
}
Connections: {
 C: "OO",1,2
 C: "OO",3,2
 C: "OP",4,3,"DiffuseColor"
}`;
    const url="https://example.test/assets/model.fbx", calls:string[]=[];
    const options={credentials:"include" as const, headers:{"x-client":"test"}, integrity:{version:1 as const,digest:sha(source), dependencies:{"tex/pixel.png":sha(png)},requireDependencies:true}};
    const oldFetch=globalThis.fetch;
    try {
      globalThis.fetch=async (input,init) => {
        const target=String(input); calls.push(target);
        expect(init?.credentials).toBe("include"); expect(new Headers(init?.headers).get("x-client")).toBe("test");
        return new Response(target.endsWith(".fbx") ? source : png, {headers:{"content-type":"application/octet-stream"}});
      };
      const loader=new FBXLoader(), asset=await loader.load({url,...options},new LoadContext());
      expect(calls).toEqual([url,"https://example.test/assets/tex/pixel.png"]);
      expect(asset.images).toHaveLength(1); loader.dispose(asset);
      await expect(loader.load({url,...options,integrity:{...options.integrity,dependencies:{}}},new LoadContext())).rejects.toThrow(/dependency integrity/i);
      await expect(loader.load({url,...options,integrity:{...options.integrity,dependencies:{"tex/pixel.png":"0".repeat(64)}}},new LoadContext())).rejects.toThrow(/integrity|digest/i);
    } finally { globalThis.fetch=oldFetch; }
  });
  it("loads USD scene, material, UVs, camera, light, animation and rejects corrupt indices", async () => {
    const loader = new USDLoader();
    const asset = await loader.load({ url: dataUrl(usdSource), type: "usd" }, new LoadContext());
    expect(asset.meshes[0]!.indices).toEqual([0,1,2,0,2,3]);
    expect(asset.meshes[0]!.texcoords).toEqual([[0,0],[1,0],[1,1],[0,1]]);
    expect(asset.materials[0]!.baseColorFactor).toEqual([1,0,0,1]);
    expect(asset.cameras).toHaveLength(1); expect(asset.lights).toHaveLength(1); expect(asset.animations).toHaveLength(1);
    expect(asset.usdDiagnostics.some((d) => d.code === "USD_LIGHT_UNIT_APPROXIMATION")).toBe(true);
    loader.dispose(asset); expect(asset.disposed).toBe(true);
    await expect(loader.load({ url: dataUrl(usdSource.replace("[0,1,2,3]", "[0,1,2,99]")), type:"usd" }, new LoadContext())).rejects.toThrow(/USD_INDEX/);
    await expect(loader.load({ url: dataUrl(usdSource.replace("#usda 1.0", "#usda 2.0")), type:"usd" }, new LoadContext())).rejects.toThrow(/USD_HEADER/);
  });
  it("loads a stored USDZ archive with a real embedded texture and checks its CRC", async () => {
    const source = usdTexturedSource;
    const bytes = zip([["model.usda",textBytes(source)],["color.png",png]]);
    const loader = new USDLoader();
    const asset = await loader.load({url:`data:application/octet-stream;base64,${bytes.toString("base64")}`,type:"usdz"},new LoadContext());
    expect(asset.meshes).toHaveLength(1); expect(asset.images).toHaveLength(1); expect(asset.materials[0]!.baseColorTexture?.texture).toBe(0);
    loader.dispose(asset); expect(asset.disposed).toBe(true);
    const corrupt = Buffer.from(bytes); corrupt[40] ^= 1;
    await expect(loader.load({url:`data:application/octet-stream;base64,${corrupt.toString("base64")}`,type:"usdz"},new LoadContext())).rejects.toThrow(/USD_ARCHIVE_CRC/);
    await expect(loader.load({url:`data:application/octet-stream;base64,${bytes.subarray(0,-1).toString("base64")}`,type:"usdz"},new LoadContext())).rejects.toThrow(/USD_ARCHIVE_TRUNCATED/);
  });
  it("enforces USD parent-relative texture origin, headers and dependency hashes", async () => {
    const root = "https://example.test/models/scene.usda", texture = "https://example.test/models/color.png";
    const options = {headers:{"x-api":"example"}, allowedOrigins:["https://example.test"], integrity:{version:1 as const,digest:sha(usdTexturedSource), dependencies:{"color.png":sha(png)}, requireDependencies:true}};
    const oldFetch=globalThis.fetch, requests: string[]=[];
    try {
      globalThis.fetch=async (input,init) => {
        const url=String(input); requests.push(url); expect(new Headers(init?.headers).get("x-api")).toBe("example");
        if (url===root) return new Response(usdTexturedSource);
        if (url===texture) return new Response(png);
        return new Response("",{status:404});
      };
      const loader=new USDLoader();
      const asset=await loader.load({url:root,type:"usd",...options},new LoadContext({baseUrl:"https://example.test/models/",...options}));
      expect(requests).toEqual([root,texture]); expect(asset.images).toHaveLength(1); loader.dispose(asset);
      await expect(loader.load({url:root,type:"usd",...options,integrity:{...options.integrity,dependencies:{"color.png":"f".repeat(64)}}},new LoadContext())).rejects.toThrow(/integrity/i);
      await expect(loader.load({url:root,type:"usd",...options,integrity:{...options.integrity,dependencies:{}}},new LoadContext())).rejects.toThrow(/integrity/i);
    } finally { globalThis.fetch=oldFetch; }
  });
  it("converts Collada hierarchy, units, materials, skin and animation, with integrity and disposal", async () => {
    const url = "https://assets.example/scenes/model.dae";
    const parsed = parseCollada(colladaSource, { baseUrl: url });
    expect(parsed.dependencies).toEqual(["https://assets.example/scenes/texture.png"]);
    expect(parsed.unitMeter).toBe(0.01); expect(parsed.upAxis).toBe("Z_UP");
    expect(parsed.gltf.skins).toHaveLength(1); expect(parsed.gltf.animations).toHaveLength(1);
    const oldFetch = globalThis.fetch;
    const loader = new ColladaLoader();
    const request = { url, headers: {"x-auth":"secret"}, allowedOrigins: ["https://assets.example"], integrity: { version: 1 as const, digest: sha(colladaSource), dependencies: {"texture.png":sha(png)}, requireDependencies:true } };
    const calls: string[] = [];
    try {
      globalThis.fetch = async (input, init) => {
        calls.push(String(input));
        expect(new Headers(init?.headers).get("x-auth")).toBe("secret");
        return new Response(String(input).endsWith(".dae") ? colladaSource : png, { headers: {"content-type": String(input).endsWith(".dae") ? "application/xml" : "image/png"} });
      };
      const asset = await loader.load(request, new LoadContext(request));
      expect(calls).toEqual([url, "https://assets.example/scenes/texture.png"]);
      expect(asset.meshes[0]!.joints[0]).toEqual([0,0,0,0]); expect(asset.meshes[0]!.weights[0]).toEqual([1,0,0,0]);
      expect(asset.animations[0]!.tracks.find((track) => track.target === "joint.translation")?.sample(0.5)).toEqual([1,0,0]);
      expect(asset.materials).toHaveLength(1); expect(asset.images).toHaveLength(1);
      loader.dispose(asset); expect(asset.disposed).toBe(true);
      await expect(loader.load({...request, integrity:{...request.integrity, dependencies:{"texture.png":"0".repeat(64)}}}, new LoadContext(request))).rejects.toThrow(/integrity|digest/i);
    } finally { globalThis.fetch = oldFetch; }
    expect(() => parseCollada(colladaSource.replace("0 0 1 1 2 2", "0 0 1 1 9 2"), {baseUrl:url})).toThrow(/out of range/);
    expect(() => parseCollada("<!DOCTYPE x><COLLADA/> ")).toThrow(/not permitted/);
    expect(() => parseCollada(colladaSource, {baseUrl:url, maxVertices:2})).toThrow(/maxVertices/);
    expect(() => parseCollada(colladaSource.replace("0 0 1 1 2 2", "0 0 1 1"), {baseUrl:url})).toThrow(/count|match/i);
    const corruptImage=Buffer.from(png); corruptImage[30]^=1;
    await expect(loader.parse(colladaSource,{baseUrl:url,resolveDependency:()=>`data:image/png;base64,${corruptImage.toString("base64")}`})).rejects.toThrow(/checksum/i);
    const oversized=Buffer.from(png); oversized.writeUInt32BE(9000,16); oversized.writeUInt32BE(crc32(oversized.subarray(12,29)),29);
    await expect(loader.parse(colladaSource,{baseUrl:url,resolveDependency:()=>`data:image/png;base64,${oversized.toString("base64")}`})).rejects.toThrow(/pixel limit/i);
  });
  it("triangulates Collada concave polygons and reports external documents", async () => {
    const source = `<COLLADA version="1.4.1"><library_geometries><geometry id="g"><mesh>
      <source id="p"><float_array id="a" count="15">0 0 0 2 0 0 2 2 0 1 1 0 0 2 0</float_array><technique_common><accessor source="#a" count="5" stride="3"/></technique_common></source>
      <vertices id="v"><input semantic="POSITION" source="#p"/></vertices><polylist count="1"><input semantic="VERTEX" source="#v"/><vcount>5</vcount><p>0 1 2 3 4</p></polylist>
      </mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="s"><node id="node"><instance_geometry url="#g"/><instance_geometry url="other.dae#model"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#s"/></scene></COLLADA>`;
    const baseUrl="https://example.test/models/scene.dae", parsed=parseCollada(source,{baseUrl});
    expect(parsed.dependencies).toEqual(["https://example.test/models/other.dae"]);
    expect(parsed.diagnostics).toContain("unsupported-external-geometry");
    const localSource=source.replace('<instance_geometry url="other.dae#model"/>','');
    const loader=new ColladaLoader(), asset=await loader.parse(localSource,{baseUrl});
    const points=asset.meshes[0]!.positions;
    let area=0; for(let i=0;i<points.length;i+=3) { const a=points[i]!,b=points[i+1]!,c=points[i+2]!; area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2; }
    expect(area).toBe(3);
    loader.dispose(asset);
    expect(() => parseCollada(source.replace('<instance_geometry url="#g"/>','<instance_node url="#node"/>'),{baseUrl})).toThrow(/cyclic/);
    expect(() => parseCollada(source.replace('count="15"','count="16"'),{baseUrl})).toThrow(/count mismatch/);
  });
  it("resolves externally referenced Collada documents through the scoped integrity policy", async () => {
    const root = `<?xml version="1.0"?><COLLADA version="1.4.1"><library_geometries><geometry id="g"><mesh>
      <source id="p"><float_array id="a" count="9">0 0 0 1 0 0 0 1 0</float_array><technique_common><accessor source="#a" count="3" stride="3"/></technique_common></source>
      <vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1"><input semantic="VERTEX" source="#v"/><p>0 1 2</p></triangles>
      </mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="s"><node id="node"><instance_geometry url="#g"/><instance_geometry url="sub/other.dae#g"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#s"/></scene></COLLADA>`;
    const external = `<COLLADA version="1.4.1"><library_geometries><geometry id="g"><mesh>
      <source id="p"><float_array id="a" count="9">0 0 1 2 0 1 0 2 1</float_array><technique_common><accessor source="#a" count="3" stride="3"/></technique_common></source>
      <vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1"><input semantic="VERTEX" source="#v"/><p>0 1 2</p></triangles>
      </mesh></geometry></library_geometries></COLLADA>`;
    const url="https://example.test/models/root.dae", externalUrl="https://example.test/models/sub/other.dae";
    const options={headers:{"x-collada":"on"},allowedOrigins:["https://example.test"],integrity:{version:1 as const,digest:sha(root),dependencies:{"sub/other.dae":sha(external)},requireDependencies:true}};
    const oldFetch=globalThis.fetch, requested:string[]=[];
    try {
      globalThis.fetch=async (input,init) => {
        const target=String(input); requested.push(target); expect(new Headers(init?.headers).get("x-collada")).toBe("on");
        return new Response(target===url ? root : external, {headers:{"content-type":"application/xml"}});
      };
      const loader=new ColladaLoader(), asset=await loader.load({url,...options},new LoadContext(options));
      expect(requested).toEqual([url,externalUrl]); expect(asset.meshes).toHaveLength(2);
      expect(asset.meshes[0]!.positions).toEqual([[0,0,0],[1,0,0],[0,1,0]]);
      expect(asset.meshes[1]!.positions).toEqual([[0,0,1],[2,0,1],[0,2,1]]);
      expect(asset.loaderDiagnostics.unsupportedFeatures).not.toContain("unsupported-external-geometry");
      loader.dispose(asset);
      await expect(loader.load({url,...options,integrity:{...options.integrity,dependencies:{"sub/other.dae":"0".repeat(64)}}},new LoadContext())).rejects.toThrow(/integrity/i);
      const differentUnits=external.replace('<COLLADA version="1.4.1">','<COLLADA version="1.4.1"><asset><unit meter="0.01"/></asset>');
      globalThis.fetch=async (input)=>new Response(String(input)===url ? root : differentUnits);
      await expect(loader.load({url},new LoadContext())).rejects.toThrow(/units or up axis/);
      const invalidVersion=external.replace('version="1.4.1"','version="2.0"');
      globalThis.fetch=async (input)=>new Response(String(input)===url ? root : invalidVersion);
      await expect(loader.load({url},new LoadContext())).rejects.toThrow(/Unsupported COLLADA version/);
      const externalWithImage=external.replace("<library_geometries>","<library_images><image id=\"tex\"><init_from>tex.png</init_from></image></library_images><library_geometries>");
      const imageUrl="https://example.test/models/sub/tex.png";
      const nestedOptions={...options,integrity:{...options.integrity,dependencies:{"sub/other.dae":sha(externalWithImage),"sub/tex.png":sha(png)}}};
      requested.length=0;
      globalThis.fetch=async (input) => { const target=String(input); requested.push(target); return new Response(target===url ? root : target===externalUrl ? externalWithImage : png); };
      const withImage=await loader.load({url,...nestedOptions},new LoadContext());
      expect(requested).toEqual([url,externalUrl,imageUrl]); expect(withImage.images).toHaveLength(1); loader.dispose(withImage);
      await expect(loader.parse(colladaSource.replace("texture.png","https://untrusted.example/image.png"),{baseUrl:url,resolveDependency:(uri)=>{if (/^https?:/.test(uri)) throw new Error("external network denied"); return uri;}})).rejects.toThrow(/network denied/);
    } finally { globalThis.fetch=oldFetch; }
  });
  it("loads 3MF package units, materials and nested transforms; rejects corruption, traversal and expansion", async () => {
    const bytes = archive();
    const model = await parseModel3MF(bytes);
    const compressedModel = await parseModel3MF(archive(modelXml, 8));
    expect(compressedModel.objects).toHaveLength(2);
    expect(model.unit).toBe("millimeter"); expect(model.objects).toHaveLength(2);
    expect(model.baseMaterials.get(1)?.[0]?.name).toBe("red");
    const loader = new Model3MFLoader();
    const asset = await loader.load({url:`data:model/3mf;base64,${bytes.toString("base64")}`}, new LoadContext());
    expect(asset.meshes).toHaveLength(1); expect(asset.meshes[0]!.positions[0]![0]).toBeCloseTo(0.01);
    expect(asset.meshes[0]!.positions[0]![1]).toBeCloseTo(0.005); expect(asset.materials[0]!.baseColorFactor[0]).toBe(1);
    loader.dispose(asset); expect(asset.disposed).toBe(true);
    const corrupt = Buffer.from(bytes); corrupt[32] ^= 0xff;
    await expect(read3MFPackageEntries(corrupt)).rejects.toThrow();
    await expect(parseModel3MF(bytes, { maxExpandedBytes: 10 })).rejects.toThrow();
    await expect(read3MFPackageEntries(zip([["../escape", textBytes("x")]]))).rejects.toThrow(/3MF_ZIP_PATH/);
    await expect(parseModel3MF(archive(modelXml.replace('objectid="2" transform=', 'objectid="3" transform=')))).rejects.toThrow(/cycle/i);
    await expect(parseModel3MF(archive(modelXml.replace('<model ', '<model xmlns:x="urn:unknown" requiredextensions="x" ')))).rejects.toThrow(/3MF_REQUIRED_EXTENSION/);
  });
  it("loads Collada through the explicit format registry, builds resources and disposes the lease", async () => {
    const source = `<COLLADA version="1.4.1"><library_geometries><geometry id="g"><mesh>
      <source id="p"><float_array id="a" count="9">0 0 0 1 0 0 0 1 0</float_array><technique_common><accessor source="#a" count="3" stride="3"/></technique_common></source>
      <vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1"><input semantic="VERTEX" source="#v"/><p>0 1 2</p></triangles>
      </mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="s"><node id="node"><instance_geometry url="#g"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#s"/></scene></COLLADA>`;
    const registry = new FormatRegistry(), loader = new ColladaLoader();
    expect(loader.canLoad({url:"data:model/vnd.collada+xml,%3CCOLLADA/%3E"})).toBe(true);
    registry.register(createGLTFFormatAdapter("collada", ["dae"], loader));
    const lease = await registry.load({url:dataUrl(source),type:"collada"},new LoadContext());
    expect(lease.format).toBe("collada"); expect(lease.renderable).toBe(true); expect(lease.gltfRenderable).toBe(true);
    const resources = await lease.createGLTFRenderResources();
    expect(resources.scene.collectRenderables()).toHaveLength(1);
    await lease.dispose(); expect(lease.disposed).toBe(true);
    await expect(lease.createGLTFRenderResources()).rejects.toThrow(/disposed/);
  });
  it("requires an explicit 3DM decoder and validates its decoded geometry and cleanup", async () => {
    const bytes = textBytes("3D Geometry File Format " + "7".padStart(8, " "));
    let released = 0;
    const decoder: RhinoDecoder = { decode: () => ({ document: { metersPerUnit: 1, objects: [{ id:"mesh", name:"triangle", mesh: { positions:[[0,0,0],[1,0,0],[0,1,0]], faces:[[0,1,2]] } }] }, release: () => { released++; } }) };
    const parsed = await parseRhinoArchive(bytes, decoder);
    expect(parsed.rhino.archiveVersion).toBe(7); expect(released).toBe(1);
    const loader = new RhinoLoader({decoder});
    const asset = await loader.load({url:`data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`,type:"3dm"},new LoadContext());
    expect(asset.meshes[0]!.positions).toHaveLength(3); expect(released).toBe(2);
    loader.dispose(asset); expect(asset.disposed).toBe(true);
    await expect(parseRhinoArchive(bytes, undefined as unknown as RhinoDecoder)).rejects.toThrow(/decoder/i);
    await expect(parseRhinoArchive(bytes.subarray(0,4), decoder)).rejects.toThrow(/truncated/i);
  });
});
