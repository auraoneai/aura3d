/**
 * `aura3d assets convert` (A5): one tiny generated fixture per format -> a GLB that the `assets inspect` inspector reads
 * with bounds, vertices and readable materials; FBX importer diagnostics surfaced; usage contract; `assets add` hint.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands.js";
import "../../../../packages/aura3d-cli/src/commands/convert/index.js";
import { convertHintForModel, loadConvertToolkit, type ConvertModelResult } from "../../../../packages/aura3d-cli/src/commands/convert/index.js";
import { addAssetAsync, inspectAsset } from "../../../../packages/aura3d-cli/src/index.js";

const TIMEOUT = 30_000;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
const identity = "1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1";

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "aura3d-convert-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

/** Stored (uncompressed) ZIP, as USDZ requires. */
function zip(entries: [string, Uint8Array][]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name), crc = crc32(data), header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(nameBytes.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, nameBytes, Buffer.from(data)); central.push(directory, nameBytes); offset += header.length + nameBytes.length + data.length;
  }
  const table = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(table.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, table, end]);
}

// FBX 7.4 ASCII: UV'd triangle, red material with an external diffuse texture, one-joint skin, translate + rotate curves.
const fbx = `FBXHeaderExtension: {
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
 Texture: 9, "Texture::Albedo", "" { RelativeFilename: "tex/albedo.png" }
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
 AnimationCurveNode: 10, "AnimCurveNode::R", "" { }
 AnimationCurve: 11, "AnimCurve::Y", "" {
  KeyTime: *2 { a: 0,46186158000 }
  KeyValueFloat: *2 { a: 0,90 }
 }
}
Connections: {
 C: "OO", 1,2
 C: "OO", 4,2
 C: "OP", 9,4, "DiffuseColor"
 C: "OO", 5,1
 C: "OO", 6,5
 C: "OO", 3,6
 C: "OP", 7,2,"Lcl Translation"
 C: "OP", 8,7,"d|X"
 C: "OP", 10,2,"Lcl Rotation"
 C: "OP", 11,10,"d|Y"
}
`;

const obj = "mtllib quad.mtl\nv -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl paint\nf 1/1 2/2 3/3 4/4\n";
const mtl = "newmtl paint\nKd 0.8 0.2 0.1\nmap_Kd albedo.png\n";

const dae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit meter="0.01" name="centimeter"/><up_axis>Z_UP</up_axis></asset>
  <library_geometries><geometry id="tri"><mesh>
    <source id="tri-pos"><float_array id="tri-pos-array" count="9">-100 0 0 100 0 0 0 0 200</float_array>
      <technique_common><accessor source="#tri-pos-array" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
    <vertices id="tri-vtx"><input semantic="POSITION" source="#tri-pos"/></vertices>
    <triangles count="1"><input semantic="VERTEX" source="#tri-vtx" offset="0"/><p>0 1 2</p></triangles>
  </mesh></geometry></library_geometries>
  <library_visual_scenes><visual_scene id="scene"><node id="n"><instance_geometry url="#tri"/></node></visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>
`;

const usda = `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root"
{
    def Mesh "Triangle"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(-1, 0, 0), (1, 0, 0), (0, 2, 0)]
        uniform bool doubleSided = 1
    }
}
`;

const usdzStage = `#usda 1.0
(
 metersPerUnit = 1
 upAxis = "Y"
)
def Xform "World" {
 def Mesh "Panel" {
  point3f[] points = [(0,0,0), (1,0,0), (1,1,0), (0,1,0)]
  int[] faceVertexCounts = [4]
  int[] faceVertexIndices = [0,1,2,3]
  texCoord2f[] primvars:st = [(0,0), (1,0), (1,1), (0,1)] (
   interpolation = "faceVarying"
  )
  rel material:binding = </World/Mat>
  uniform token subdivisionScheme = "none"
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

const ply = "ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0 255 0 0\n1 0 0 0 255 0\n0 1 0 0 0 255\n3 0 1 2\n";
const stl = "solid tri\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 20 0 0\nvertex 0 10 40\nendloop\nendfacet\nendsolid tri\n";

const modelRels = "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Target=\"/3D/3dmodel.model\" Id=\"rel0\" Type=\"http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel\"/></Relationships>";
const contentTypes = "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"model\" ContentType=\"application/vnd.ms-package.3dmanufacturing-3dmodel+xml\"/></Types>";
const modelXml = "<?xml version=\"1.0\"?><model xmlns=\"http://schemas.microsoft.com/3dmanufacturing/core/2015/02\" unit=\"millimeter\"><resources><basematerials id=\"1\"><base name=\"red\" displaycolor=\"#FF0000FF\"/></basematerials><object id=\"2\" name=\"triangle\" pid=\"1\" pindex=\"0\"><mesh><vertices><vertex x=\"0\" y=\"0\" z=\"0\"/><vertex x=\"100\" y=\"0\" z=\"0\"/><vertex x=\"0\" y=\"100\" z=\"0\"/></vertices><triangles><triangle v1=\"0\" v2=\"1\" v3=\"2\"/></triangles></mesh></object></resources><build><item objectid=\"2\"/></build></model>";
const model3mf = zip([["_rels/.rels", Buffer.from(modelRels)], ["[Content_Types].xml", Buffer.from(contentTypes)], ["3D/3dmodel.model", Buffer.from(modelXml)]]);

function vox(): Buffer {
  const integer = (value: number): Buffer => { const result = Buffer.alloc(4); result.writeInt32LE(value); return result; };
  const chunk = (id: string, content: Buffer, children: Buffer = Buffer.alloc(0)): Buffer => {
    const header = Buffer.alloc(12);
    header.write(id, 0, 4, "ascii"); header.writeUInt32LE(content.length, 4); header.writeUInt32LE(children.length, 8);
    return Buffer.concat([header, content, children]);
  };
  const voxels = [0, 0, 0, 1, 1, 2, 3, 1];
  const body = Buffer.concat([chunk("SIZE", Buffer.concat([2, 3, 4].map(integer))), chunk("XYZI", Buffer.concat([integer(voxels.length / 4), Buffer.from(voxels)]))]);
  const header = Buffer.alloc(8);
  header.write("VOX "); header.writeUInt32LE(150, 4);
  return Buffer.concat([header, chunk("MAIN", Buffer.alloc(0), body)]);
}

const bvh = `HIERARCHY
ROOT Hips
{
  OFFSET 0 90 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0 10 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0 20 0
    }
  }
}
MOTION
Frames: 3
Frame Time: 0.0333333
0 90 0 0 0 0 0 0 0
0 91 1 0 10 0 0 15 0
0 92 2 0 20 0 0 30 0
`;

function write(dir: string, name: string, content: string | Buffer): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

async function run(argv: string[], cwd = root): Promise<{ code: number; out: string; err: string }> {
  const command = cliCommandFor("assets convert");
  if (!command) throw new Error("assets convert is not registered");
  let out = "", err = "";
  const code = await command.run(argv, { cwd, stdout: (line) => { out += `${line}\n`; }, stderr: (line) => { err += `${line}\n`; } });
  return { code, out, err };
}

async function convertJson(argv: string[]): Promise<ConvertModelResult> {
  const { code, out, err } = await run([...argv, "--json"]);
  const result = JSON.parse(out) as ConvertModelResult;
  if (code !== 0) throw new Error(`exit ${code}: ${err}${JSON.stringify(result.diagnostics ?? result, null, 2)}`);
  return result;
}

/** What `aura3d assets inspect out.glb` reports, held to its strictest reading: only an untextured-source warning may remain. */
function expectStrictInspect(file: string, textured: boolean): void {
  const report = inspectAsset({ file, projectDir: root });
  expect(report.format).toBe("glb");
  expect(report.vertexCount).toBeGreaterThan(0);
  expect(report.boundsMetadata?.maxDimension).toBeGreaterThan(0);
  expect(report.materialMetadata?.every((material) => material.visible && material.readable)).toBe(true);
  expect(report.orientation).toMatchObject({ source: "gltf-extras", upAxis: "+y" });
  expect(report.warnings).toEqual(textured ? [] : ["no texture references detected"]);
}

const toolkitAvailable = (() => { try { loadConvertToolkit(process.cwd()); return true; } catch { return false; } })();
const withToolkit = toolkitAvailable ? describe : describe.skip;

withToolkit("assets convert: one fixture per format -> verified GLB", () => {
  it("FBX: skin, clip, material; importer diagnostics surfaced; external texture dropped without --embed-textures", async () => {
    const dir = join(root, "fbx");
    write(dir, "hero.fbx", fbx);
    write(join(dir, "tex"), "albedo.png", png);
    const result = await convertJson(["fbx/hero.fbx", "--out", "out/hero.glb"]);
    expect(result).toMatchObject({ ok: true, format: "fbx", parity: "partial", up: "declared", output: "out/hero.glb" });
    expect(result.verification).toMatchObject({ ok: true, skins: 1, materials: 1, textures: 0 });
    expect(result.verification.animations).toHaveLength(1);
    const codes = result.diagnostics.map((item) => item.code);
    expect(codes).toContain("FBX_ANIMATION_EULER_APPROXIMATION");
    expect(result.diagnostics.find((item) => item.code === "FBX_ANIMATION_EULER_APPROXIMATION")).toMatchObject({ source: "importer", severity: "warning" });
    expect(codes).toContain("ASSET_IMPORT_EXTERNAL_CONVERSION_REQUIRED"); // preflight on the .fbx input
    expect(codes).toContain("CONVERT_TEXTURE_EXTERNAL");
    expect(codes).toContain("CONVERT_PARTIAL_PARITY");
    expect(result.droppedTextures).toEqual(["tex/albedo.png"]);
    expectStrictInspect("out/hero.glb", false);

    // Human output prints the same diagnostics.
    const human = await run(["fbx/hero.fbx", "--out", "out/hero-human.glb"]);
    expect(human.code).toBe(0);
    expect(human.out).toMatch(/\[warning\] FBX_ANIMATION_EULER_APPROXIMATION \(importer\)/);
    expect(human.out).toMatch(/partial parity/);
  }, TIMEOUT);

  it("FBX with --embed-textures embeds the external PNG", async () => {
    const result = await convertJson(["fbx/hero.fbx", "--out", "out/hero-textured.glb", "--embed-textures"]);
    expect(result.embeddedTextures).toEqual(["tex/albedo.png"]);
    expect(result.droppedTextures).toEqual([]);
    expect(result.verification.textures).toBe(1);
    expectStrictInspect("out/hero-textured.glb", true);
  }, TIMEOUT);

  it("OBJ + MTL: colour kept, texture only with --embed-textures", async () => {
    const dir = join(root, "obj");
    write(dir, "quad.obj", obj);
    write(dir, "quad.mtl", mtl);
    write(dir, "albedo.png", png);
    const plain = await convertJson(["obj/quad.obj", "--out", "out/quad.glb"]);
    expect(plain.droppedTextures).toEqual(["albedo.png"]);
    expect(plain.verification).toMatchObject({ materials: 1, textures: 0, vertexCount: 6 }); // the OBJ importer emits unindexed triangles
    expect(plain.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["CONVERT_UNITS_ASSUMED", "CONVERT_AXES_ASSUMED", "ASSET_IMPORT_OBJ_NATIVE_BOUNDED"]));
    expectStrictInspect("out/quad.glb", false);
    const textured = await convertJson(["obj/quad.obj", "--out", "out/quad-textured.glb", "--embed-textures"]);
    expect(textured.embeddedTextures).toEqual(["albedo.png"]);
    expect(textured.verification.textures).toBe(1);
    expectStrictInspect("out/quad-textured.glb", true);
  }, TIMEOUT);

  it("DAE: centimetre Z-up document arrives in metres, +Y up", async () => {
    write(join(root, "dae"), "tri.dae", dae);
    const result = await convertJson(["dae/tri.dae", "--out", "out/tri-dae.glb"]);
    expect(result.verification.bounds?.size.map((n) => Number(n.toFixed(3)))).toEqual([2, 2, 0]);
    expectStrictInspect("out/tri-dae.glb", false);
  }, TIMEOUT);

  it("USDA and USDZ (texture inside the archive is kept)", async () => {
    write(join(root, "usd"), "tri.usda", usda);
    write(join(root, "usd"), "panel.usdz", zip([["panel.usda", Buffer.from(usdzStage)], ["color.png", png]]));
    const stage = await convertJson(["usd/tri.usda", "--out", "out/tri-usda.glb"]);
    expect(stage.verification.bounds?.size.map((n) => Number(n.toFixed(3)))).toEqual([2, 2, 0]);
    expectStrictInspect("out/tri-usda.glb", false);
    const archive = await convertJson(["usd/panel.usdz", "--out", "out/panel.glb"]);
    expect(archive.verification.textures).toBe(1);
    expectStrictInspect("out/panel.glb", true);
  }, TIMEOUT);

  it("USDA with an external texture fails without --embed-textures and names the fix", async () => {
    write(join(root, "usd-ext"), "panel.usda", usdzStage);
    write(join(root, "usd-ext"), "color.png", png);
    const failed = await run(["usd-ext/panel.usda", "--out", "out/panel-ext.glb"]);
    expect(failed.code).toBe(1);
    expect(failed.err).toMatch(/--embed-textures/);
    const ok = await convertJson(["usd-ext/panel.usda", "--out", "out/panel-ext.glb", "--embed-textures"]);
    expect(ok.embeddedTextures).toEqual(["color.png"]);
    expectStrictInspect("out/panel-ext.glb", true);
  }, TIMEOUT);

  it("PLY with vertex colours", async () => {
    write(join(root, "ply"), "tri.ply", ply);
    const result = await convertJson(["ply/tri.ply", "--out", "out/tri-ply.glb"]);
    expect(result.verification.vertexCount).toBe(3);
    expectStrictInspect("out/tri-ply.glb", false);
  }, TIMEOUT);

  it("STL with --unit-scale 0.001 --up z (CAD millimetres, Z up)", async () => {
    write(join(root, "stl"), "part.stl", stl);
    const result = await convertJson(["stl/part.stl", "--out", "out/part.glb", "--unit-scale", "0.001", "--up", "z"]);
    expect(result).toMatchObject({ unitScale: 0.001, up: "z" });
    // 20 x 10 x 40 mm, Z up -> X 0.02, Y (was Z) 0.04, Z (was -Y) 0.01.
    expect(result.verification.bounds?.size.map((n) => Number(n.toFixed(4)))).toEqual([0.02, 0.04, 0.01]);
    expect(result.diagnostics.map((item) => item.code)).not.toContain("CONVERT_AXES_ASSUMED");
    expectStrictInspect("out/part.glb", false);
  }, TIMEOUT);

  it("3MF in millimetres", async () => {
    write(join(root, "3mf"), "tri.3mf", model3mf);
    const result = await convertJson(["3mf/tri.3mf", "--out", "out/tri-3mf.glb"]);
    expect(Math.max(...(result.verification.bounds?.size ?? []))).toBeCloseTo(0.1, 5);
    expectStrictInspect("out/tri-3mf.glb", false);
  }, TIMEOUT);

  it("VOX", async () => {
    write(join(root, "vox"), "blocks.vox", vox());
    const result = await convertJson(["vox/blocks.vox", "--out", "out/blocks.glb"]);
    expect(result.diagnostics.map((item) => item.code)).toContain("VOX_FRAME_ZERO");
    expectStrictInspect("out/blocks.glb", false);
  }, TIMEOUT);

  it("BVH -> skeleton + clip + skinned joint markers", async () => {
    write(join(root, "bvh"), "walk.bvh", bvh);
    const result = await convertJson(["bvh/walk.bvh", "--out", "out/walk.glb", "--unit-scale", "0.01"]);
    expect(result.verification).toMatchObject({ ok: true, skins: 1, animations: ["walk"], meshes: 1 });
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["BVH_SOURCE_CONVENTION", "CONVERT_BVH_SKELETON_CLIP"]));
    // Hips at 0.9 m, end site at 1.2 m.
    expect(Number(result.verification.bounds?.max[1]?.toFixed(2))).toBeCloseTo(1.2, 1);
    expectStrictInspect("out/walk.glb", false);
    const { NodeIO } = loadConvertToolkit(process.cwd());
    const doc = await new NodeIO().read(join(root, "out/walk.glb"));
    const animation = doc.getRoot().listAnimations()[0];
    expect(animation.listChannels().map((channel: any) => `${channel.getTargetNode().getName()}.${channel.getTargetPath()}`).sort())
      .toEqual(["Hips.rotation", "Hips.translation", "Spine.rotation"]);
  }, TIMEOUT);
});

describe("assets convert: usage contract", () => {
  it("--help prints usage and writes nothing", async () => {
    const dir = join(root, "help");
    mkdirSync(dir, { recursive: true });
    const { code, out } = await run(["model.fbx", "--out", "x.glb", "--help"], dir);
    expect(code).toBe(0);
    expect(out).toMatch(/aura3d assets convert <in\.fbx/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("usage errors exit 2 and name the fix", async () => {
    write(join(root, "usage"), "tri.stl", stl);
    expect((await run(["usage/tri.stl"])).code).toBe(2);
    expect((await run(["usage/tri.stl", "--out", "x.gltf"])).err).toMatch(/\.glb/);
    expect((await run(["usage/tri.stl", "--out", "x.glb", "--up", "x"])).code).toBe(2);
    expect((await run(["usage/tri.stl", "--out", "x.glb", "--unit-scale", "-1"])).code).toBe(2);
    expect((await run(["usage/missing.stl", "--out", "x.glb"])).code).toBe(2);
    expect((await run(["usage/model.glb", "--out", "x.glb"])).err).toMatch(/no conversion/);
    expect((await run(["usage/tri.stl", "--out", "x.glb", "--bogus"])).code).toBe(2);
    const json = await run(["usage/tri.stl", "--json"]);
    expect(json.code).toBe(2);
    expect(JSON.parse(json.out)).toMatchObject({ ok: false });
    expect(existsSync(join(root, "x.glb"))).toBe(false);
  });

  it("a malformed source exits 1 with the importer's error", async () => {
    write(join(root, "bad"), "broken.fbx", fbx.replace("a: 0,1,-3", "a: 0,1,-7"));
    const { code, err } = await run(["bad/broken.fbx", "--out", "out/broken.glb"]);
    expect(code).toBe(1);
    expect(err).toMatch(/FBX_INVALID_MESH/);
  });
});

describe("assets add -> assets convert hint", () => {
  it("names the convert command for non-glTF models only", () => {
    expect(convertHintForModel("assets/hero.fbx")).toMatch(/aura3d assets convert assets\/hero\.fbx --out hero\.glb/);
    expect(convertHintForModel("walk.BVH")).toMatch(/assets convert/);
    expect(convertHintForModel("hero.glb")).toBeUndefined();
    expect(convertHintForModel("albedo.png")).toBeUndefined();
  });

  it("is appended to assets add messages for a native model and to its errors", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-convert-hint-"));
    try {
      mkdirSync(join(dir, "assets"));
      writeFileSync(join(dir, "assets/tri.ply"), ply);
      const added = await addAssetAsync({ projectDir: dir, file: "assets/tri.ply", name: "tri" });
      expect(added.messages.at(-1)).toMatch(/assets convert assets\/tri\.ply --out tri\.glb/);
      writeFileSync(join(dir, "assets/broken.fbx"), "not an fbx");
      await expect(addAssetAsync({ projectDir: dir, file: "assets/broken.fbx", name: "broken" })).rejects.toThrow(/assets convert/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);
});
