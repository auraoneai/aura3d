import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LoadContext } from "@aura3d/assets";
import {
  admitNativeFormat, createMaterialXMaterial, createNativeFormatRegistry, createSVGGLTFAsset, evaluateMaterialXExpression,
  findNativeFormat, NATIVE_FORMAT_CATALOG, NativeFormatAdmissionError, parse3DLCube, parseBVH, parseMaterialXDocument,
  parseMDD, parseSVG, sampleColorLut, sampleVertexFrames, type NativeFormatDiagnosticCode
} from "@aura3d/assets/importers";
import type { GLTFAsset } from "@aura3d/assets";
import { CATALOG_SCENE_FIXTURES } from "../fixtures/native-capabilities/catalog-scenes";

// Every fixture below is independently authored in this file from the public
// format descriptions; none is copied from another engine's corpus.
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const BVH_MINIMAL = `HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  End Site
  {
    OFFSET 0 1 0
  }
}
MOTION
Frames: 1
Frame Time: 0.5
0 0 0 0 0 0
`;
const BVH_REALISTIC = `HIERARCHY
ROOT Hips
{
  OFFSET 0 10 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0 5 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT Head
    {
      OFFSET 0 4 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      End Site
      {
        OFFSET 0 2 0
      }
    }
  }
  JOINT LeftLeg
  {
    OFFSET 2 -1 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0 -8 0
    }
  }
}
MOTION
Frames: 3
Frame Time: 0.0333333
0 0 0 0 0 0  0 0 0  0 0 0  0 0 0
1 0 0 90 0 0  0 0 0  0 0 0  0 0 45
2 0 0 180 0 0  0 0 0  0 0 0  0 0 90
`;

function mdd(times: readonly number[], frames: readonly (readonly number[])[]): Uint8Array {
  const vertexCount = frames[0]!.length / 3;
  const bytes = new Uint8Array(8 + times.length * 4 + times.length * vertexCount * 12);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, times.length, false); view.setInt32(4, vertexCount, false);
  times.forEach((time, index) => view.setFloat32(8 + index * 4, time, false));
  let offset = 8 + times.length * 4;
  for (const frame of frames) for (const value of frame) { view.setFloat32(offset, value, false); offset += 4; }
  return bytes;
}

const SVG_MINIMAL = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M0 0 L10 0 L10 10 Z" fill="#ff0000"/></svg>`;
const SVG_REALISTIC = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="200" height="100">
  <!-- a translated group with a filled rectangle and a stroked polyline -->
  <g transform="translate(10 5) scale(2)">
    <rect id="panel" x="0" y="0" width="20" height="10" fill="rgb(0, 128, 255)" fill-opacity="0.5"/>
    <polyline id="edge" points="0,15 10,20 20,15" fill="none" stroke="#00ff00" stroke-width="2"/>
  </g>
  <circle id="dot" cx="80" cy="25" r="5" fill="black"/>
</svg>`;

const MTLX = `<?xml version="1.0"?>
<materialx version="1.38">
  <nodegraph name="tint_graph">
    <constant name="base" type="color3"><input name="value" type="color3" value="0.5, 0.25, 1.0"/></constant>
    <multiply name="tinted" type="color3"><input name="in1" type="color3" nodename="base"/><input name="in2" type="float" value="0.5"/></multiply>
    <output name="out" type="color3" nodename="tinted"/>
  </nodegraph>
  <standard_surface name="surface" type="surfaceshader">
    <input name="base_color" type="color3" nodegraph="tint_graph" output="out"/>
    <input name="metalness" type="float" value="0.75"/>
    <input name="specular_roughness" type="float" value="0.3"/>
    <input name="thin_film_thickness" type="float" value="10"/>
  </standard_surface>
  <surfacematerial name="painted" type="material"><input name="surfaceshader" type="surfaceshader" nodename="surface"/></surfacematerial>
  <noise3d name="unused_noise" type="float"/>
</materialx>`;

function lut3dl(size: 2 | 3, scale: number, map: (r: number, g: number, b: number) => readonly number[] = (r, g, b) => [r, g, b]): string {
  const grid = Array.from({ length: size }, (_, index) => Math.round(index * scale / (size - 1)));
  const rows: string[] = [grid.join(" ")];
  // 3DL rows are blue-fastest: r outermost, then g, then b.
  for (let r = 0; r < size; r += 1) for (let g = 0; g < size; g += 1) for (let b = 0; b < size; b += 1) {
    rows.push(map(r / (size - 1), g / (size - 1), b / (size - 1)).map((value) => Math.round(value * scale)).join(" "));
  }
  return rows.join("\n") + "\n";
}

function tga(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(18 + width * height * 3);
  bytes[2] = 2; bytes[12] = width; bytes[14] = height; bytes[16] = 24; bytes[17] = 0x20;
  for (let index = 0; index < width * height; index += 1) bytes.set([0, 0, 255], 18 + index * 3); // BGR red
  return bytes;
}

async function admissionCode(promise: Promise<unknown>): Promise<NativeFormatDiagnosticCode> {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(NativeFormatAdmissionError);
    return (error as NativeFormatAdmissionError).code;
  }
  throw new Error("admission unexpectedly succeeded");
}

describe("native WP-08 format catalog", () => {
  it("declares units, coordinates, versions, dependencies and losses for every format exactly once", () => {
    const ids = NATIVE_FORMAT_CATALOG.map((value) => value.id);
    expect(new Set(ids).size).toBe(ids.length);
    const extensions = NATIVE_FORMAT_CATALOG.flatMap((value) => value.extensions);
    expect(new Set(extensions).size).toBe(extensions.length);
    for (const id of ["obj", "fbx", "usd", "collada", "model3mf", "rhino", "amf", "legacy3ds", "vrml", "ldraw", "kmz", "ply", "stl", "vox", "pcd", "pdb", "vtk", "xyz", "nrrd", "gcode", "bvh", "md2", "mdd", "svg", "exr", "jxl", "ultrahdr", "dds", "pvr", "ktx1", "tga", "tiff", "3dl", "materialx"]) {
      const value = NATIVE_FORMAT_CATALOG.find((candidate) => candidate.id === id);
      expect(value, id).toBeDefined();
      for (const field of [value!.units, value!.coordinates, value!.dependencies, value!.losses]) expect(field.length, id).toBeGreaterThan(3);
      expect(value!.versions.length, id).toBeGreaterThan(0);
    }
    expect(NATIVE_FORMAT_CATALOG.filter((value) => value.codec === "supplied").map((value) => value.id).sort()).toEqual(["jxl", "rhino", "ultrahdr"]);
    expect(findNativeFormat("scene.USDZ")?.id).toBe("usd");
    expect(findNativeFormat("part.ldr")?.id).toBe("ldraw");
    const doc = readFileSync(new URL("../../docs/api/native-formats.md", import.meta.url), "utf8");
    const matrix = doc.slice(doc.indexOf("## Per-format import matrix"), doc.indexOf("## Interchange export and loss"));
    for (const value of NATIVE_FORMAT_CATALOG) {
      const row = matrix.split("\n").find((line) => line.startsWith(`| \`${value.id}\` |`));
      expect(row, `${value.id} must have a public matrix row`).toBeDefined();
      expect(row).toContain(value.codec);
      expect(row).toContain(value.units.replaceAll("|", "\\|"));
    }
  });

  it("installs every root-renderable model adapter, and 3DM only with a supplied decoder", () => {
    const registry = createNativeFormatRegistry();
    const roots = NATIVE_FORMAT_CATALOG.filter((value) => value.rootModel && value.codec === "built-in").map((value) => value.id);
    for (const id of ["gltf", ...roots, "scalar-volume"]) expect(registry.list()).toContain(id);
    expect(registry.list()).not.toContain("rhino");
    for (const value of NATIVE_FORMAT_CATALOG.filter((candidate) => candidate.rootModel && candidate.codec === "built-in")) {
      const adapter = registry.select({ url: `/model.${value.extensions[0]}`, format: value.extensions[0] }, { format: value.extensions[0] });
      expect(adapter.id, value.id).toBe(value.id);
      expect(typeof adapter.buildGLTFResources, value.id).toBe("function");
    }
    const decoder = { decode: () => { throw new Error("unused"); } };
    expect(createNativeFormatRegistry({ codecs: { rhino: decoder } }).list()).toContain("rhino");
    expect(() => createNativeFormatRegistry({ formats: ["3dm"] })).toThrow(/NATIVE_FORMAT_CODEC_REQUIRED/);
  });

  it("renders SVG through the registry's glTF resource bridge and disposes it", async () => {
    const registry = createNativeFormatRegistry({ formats: ["svg"] });
    const lease = await registry.load({ url: `data:image/svg+xml,${encodeURIComponent(SVG_REALISTIC)}`, format: "svg" }, new LoadContext(), { format: "svg" });
    const resources = await lease.createGLTFRenderResources();
    expect(resources.renderableBindings.length).toBeGreaterThanOrEqual(3);
    const orders: number[] = [];
    resources.scene.traverse((node) => { if (node.renderable) orders.push(node.renderOrder); });
    expect(orders.every((order) => order > 0)).toBe(true);
    expect(new Set(orders).size).toBe(orders.length);
    await lease.dispose();
    expect(lease.disposed).toBe(true);
  });
});

describe("catalog scene fixtures through the root registry", () => {
  it.each(CATALOG_SCENE_FIXTURES.map((value) => [value.id, value] as const))("%s projects to a +Z-facing triangle wider at its lower edge", async (_id, value) => {
    const registry = createNativeFormatRegistry();
    const lease = await registry.load({ url: `data:${value.mediaType},${encodeURIComponent(value.source)}`, format: value.format, type: undefined }, new LoadContext(), { format: value.format });
    const asset = lease.asset as GLTFAsset;
    const resources = await lease.createGLTFRenderResources();
    try {
      expect(resources.renderableBindings.length).toBeGreaterThan(0);
      const points = asset.meshes.flatMap((mesh) => mesh.positions);
      expect(points.length).toBeGreaterThanOrEqual(3);
      const { min, max } = resources.bounds;
      const width = max[0] - min[0], height = max[1] - min[1];
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(Math.abs(max[2] - min[2])).toBeLessThan(1e-6 + 0.01 * Math.max(width, height));
      const lower = points.filter((point) => point[1] - min[1] < height * 0.05);
      const lowerSpan = Math.max(...lower.map((point) => point[0])) - Math.min(...lower.map((point) => point[0]));
      expect(lowerSpan).toBeGreaterThan(width * 0.9);
    } finally { await lease.dispose(); }
    expect(lease.disposed).toBe(true);
  });
});

describe("strict admission with consistent limits and stable diagnostics", () => {
  it("admits self-contained files through the real parsers with typed summaries", async () => {
    const obj = await admitNativeFormat(text("o tri\nv -1 -1 0\nv 1 -1 0\nv 0 1 0\nf 1 2 3\n"), "obj");
    expect(obj).toMatchObject({ format: "obj", assetType: "model", summary: { meshes: 1, vertices: 3, triangles: 1 } });
    const ply = await admitNativeFormat(text("ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n-1 -1 0\n1 -1 0\n0 1 0\n3 0 1 2\n"), "ply");
    expect(ply.summary).toMatchObject({ vertices: 3, triangles: 1 });
    expect((await admitNativeFormat(text(SVG_MINIMAL), "svg")).summary.meshes).toBeGreaterThan(0);
    expect((await admitNativeFormat(text(BVH_REALISTIC), "bvh")).summary).toMatchObject({ frames: 3 });
    expect((await admitNativeFormat(mdd([0, 1], [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0]]), "mdd")).summary).toMatchObject({ vertices: 2, frames: 2 });
    expect((await admitNativeFormat(text(lut3dl(2, 1023)), "3dl")).summary).toEqual({ lutSize: 2 });
    expect((await admitNativeFormat(text(MTLX), "mtlx")).summary.materials).toBe(1);
    expect((await admitNativeFormat(tga(2, 2), "tga")).summary).toMatchObject({ width: 2, height: 2 });
    // Scientific point/toolpath and legacy scene formats use the same contract.
    expect((await admitNativeFormat(text("0 0 0\n1 0 0\n0 1 0\n"), "xyz")).summary.vertices).toBeGreaterThan(0);
    expect((await admitNativeFormat(text("# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 2\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS 2\nDATA ascii\n0 0 0\n1 1 1\n"), "pcd")).summary.vertices).toBeGreaterThan(0);
    expect((await admitNativeFormat(text("G21\nG90\nG0 X0 Y0 Z0\nG1 X10 Y0 E1 F600\nG1 X10 Y10 E2\n"), "gcode")).summary.vertices).toBeGreaterThan(0);
    for (const value of CATALOG_SCENE_FIXTURES) {
      expect((await admitNativeFormat(text(value.source), value.format)).summary.triangles, value.id).toBeGreaterThan(0);
    }
  });

  it("reports the same codes across formats for limits, codecs, truncation and unknown inputs", async () => {
    expect(await admissionCode(admitNativeFormat(text("x"), "abc"))).toBe("NATIVE_FORMAT_UNKNOWN");
    for (const format of ["obj", "svg", "3dl", "tga", "bvh"]) {
      expect(await admissionCode(admitNativeFormat(new Uint8Array(65), format, { limits: { maxFileBytes: 64 } })), format).toBe("NATIVE_FORMAT_FILE_LIMIT");
    }
    expect(await admissionCode(admitNativeFormat(tga(2, 2), "tga", { limits: { maxPixels: 3 } }))).toBe("NATIVE_FORMAT_PIXEL_LIMIT");
    expect(await admissionCode(admitNativeFormat(mdd([0], [[0, 0, 0, 1, 0, 0, 0, 1, 0]]), "mdd", { limits: { maxElements: 2 } }))).toBe("NATIVE_FORMAT_ALLOCATION_LIMIT");
    for (const [bytes, format] of [[Uint8Array.of(0xff, 0x0a, 0), "jxl"], [Uint8Array.of(0xff, 0xd8, 0xff, 0xd9), "uhdr"], [text("3D Geometry File Format"), "3dm"]] as const) {
      expect(await admissionCode(admitNativeFormat(bytes, format)), format).toBe("NATIVE_FORMAT_CODEC_REQUIRED");
    }
    expect(await admissionCode(admitNativeFormat(mdd([0, 1], [[0, 0, 0], [1, 1, 1]]).subarray(0, 20), "mdd"))).toBe("NATIVE_FORMAT_TRUNCATED");
    expect(await admissionCode(admitNativeFormat(new Uint8Array(), "stl"))).toBe("NATIVE_FORMAT_TRUNCATED");
    const malformed = await admissionCode(admitNativeFormat(text("<svg><path d='M 0 0 Q'/></svg>"), "svg"));
    expect(["NATIVE_FORMAT_MALFORMED", "NATIVE_FORMAT_TRUNCATED"]).toContain(malformed);
  });
});

describe("BVH fixtures", () => {
  it("parses a minimal single-joint file", () => {
    const asset = parseBVH(BVH_MINIMAL);
    expect(asset.joints.map((joint) => joint.name)).toEqual(["Hips", "Hips_end_1"]);
    expect(asset.frameCount).toBe(1);
    expect(asset.clip.duration).toBe(0);
  });

  it("builds the realistic hierarchy, world offsets, unit scale and timed rotation tracks", () => {
    const asset = parseBVH(BVH_REALISTIC, { unitScale: 0.01, clipName: "walk" });
    expect(asset.joints.map((joint) => [joint.name, joint.parentIndex])).toEqual([
      ["Hips", -1], ["Spine", 0], ["Head", 1], ["Head_end_3", 2], ["LeftLeg", 0], ["LeftLeg_end_5", 4]
    ]);
    expect(asset.joints[1]!.offset).toEqual([0, 0.05, 0]);
    expect(asset.clip.name).toBe("walk");
    expect(asset.clip.duration).toBeCloseTo(0.0666666, 5);
    const root = asset.clip.tracks.find((track) => track.target === "Hips.rotation")!;
    // Frame 1 is a 90 degree Z rotation: (0, 0, sin 45, cos 45).
    const q = root.keyframes[1]!.value as readonly number[];
    expect(q[2]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 5);
    const translation = asset.clip.tracks.find((track) => track.target === "Hips.translation")!;
    expect((translation.keyframes[2]!.value as readonly number[])[0]).toBeCloseTo(0.02, 6);
    expect(asset.clip.tracks.some((track) => track.target === "LeftLeg.rotation")).toBe(true);
    expect(asset.diagnostics[0]!.code).toBe("BVH_SOURCE_CONVENTION");
  });

  it("rejects truncated motion, unsupported channels, duplicate joints and frame limits", () => {
    expect(() => parseBVH(BVH_REALISTIC.trimEnd().split("\n").slice(0, -1).join("\n"))).toThrow(/TRUNCATED/);
    expect(() => parseBVH(BVH_MINIMAL.replace("Yrotation", "Wrotation"))).toThrow(/UNSUPPORTED_CHANNEL/);
    expect(() => parseBVH(BVH_REALISTIC.replace("JOINT LeftLeg", "JOINT Spine"))).toThrow(/DUPLICATE_JOINT/);
    expect(() => parseBVH(BVH_REALISTIC, { maxFrames: 2 })).toThrow(/COUNT_LIMIT/);
    expect(() => parseBVH(`${BVH_MINIMAL} 7`)).toThrow(/trailing/);
  });
});

describe("MDD fixtures", () => {
  it("parses big-endian frames and interpolates between them", () => {
    const minimal = parseMDD(mdd([0], [[1, 2, 3]]));
    expect(minimal.vertexCount).toBe(1);
    expect([...minimal.frames[0]!.positions]).toEqual([1, 2, 3]);
    const asset = parseMDD(mdd([0, 0.5, 1], [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 2, 0, 1, 4, 0]]));
    expect(asset.frames.map((frame) => frame.time)).toEqual([0, 0.5, 1]);
    expect([...sampleVertexFrames(asset, 0.75)]).toEqual([0, 1.5, 0, 1, 2.5, 0]);
    expect([...sampleVertexFrames(asset, 9)]).toEqual([0, 2, 0, 1, 4, 0]);
    expect(asset.diagnostics[0]!.code).toBe("MDD_TOPOLOGY_REQUIRED");
  });

  it("rejects truncated, padded, non-monotonic, non-finite and oversized caches", () => {
    const valid = mdd([0, 1], [[0, 0, 0], [1, 1, 1]]);
    expect(() => parseMDD(valid.subarray(0, valid.length - 1))).toThrow(/TRUNCATED/);
    expect(() => parseMDD(Uint8Array.from([...valid, 0]))).toThrow(/TRUNCATED/);
    expect(() => parseMDD(mdd([1, 1], [[0, 0, 0], [1, 1, 1]]))).toThrow(/INVALID_TIME/);
    expect(() => parseMDD(mdd([0], [[Number.NaN, 0, 0]]))).toThrow(/INVALID_NUMBER/);
    expect(() => parseMDD(valid, { maxFrames: 1 })).toThrow(/COUNT_LIMIT/);
  });
});

describe("SVG fixtures", () => {
  it("parses minimal and realistic documents with transforms, styles and viewBox", async () => {
    const minimal = parseSVG(SVG_MINIMAL);
    expect(minimal.shapes).toHaveLength(1);
    expect(minimal.shapes[0]!.style.fill).toBe("#ff0000");
    const asset = parseSVG(SVG_REALISTIC);
    expect(asset.viewBox).toEqual([0, 0, 100, 50]);
    expect(asset.shapes.map((shape) => shape.id)).toEqual(["panel", "edge", "dot"]);
    // viewBox 100x50 shown at 200x100 doubles the group's translate(10 5) scale(2).
    expect(asset.shapes[0]!.transform).toEqual([4, 0, 0, 4, 20, 10]);
    expect(asset.shapes[0]!.style.fillOpacity).toBe(0.5);
    expect(asset.shapes[1]!.style).toMatchObject({ fill: "none", stroke: "#00ff00", strokeWidth: 2 });
    const gltf = await createSVGGLTFAsset(asset);
    // SVG y-down is flipped to glTF y-up: the panel spans y = -10 .. -50.
    const panel = gltf.meshes.find((mesh) => mesh.name.startsWith("panel-fill"))!;
    const ys = panel.positions.map((position) => position[1]);
    expect(Math.max(...ys)).toBeCloseTo(-10, 4);
    expect(Math.min(...ys)).toBeCloseTo(-50, 4);
    expect(gltf.meshes.some((mesh) => mesh.name.startsWith("edge-stroke"))).toBe(true);
    expect(gltf.meshes.some((mesh) => mesh.name.startsWith("edge-fill"))).toBe(false);
  });

  it("rejects entity declarations, malformed XML, invalid numbers and command limits", () => {
    expect(() => parseSVG(`<!DOCTYPE svg [<!ENTITY x "y">]>${SVG_MINIMAL}`)).toThrow(/UNSUPPORTED_XML/);
    expect(() => parseSVG(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L1 1"></svg>`)).toThrow(/INVALID_XML/);
    expect(() => parseSVG(SVG_MINIMAL.replace("L10 0", "L1e999 0"))).toThrow(/INVALID_NUMBER|finite/);
    expect(() => parseSVG(SVG_MINIMAL, { maxPathCommands: 2 })).toThrow(/LIMIT/);
    expect(() => parseSVG(SVG_MINIMAL, { maxBytes: 10 })).toThrow(/INPUT_LIMIT/);
  });
});

describe("MaterialX fixtures", () => {
  it("translates a standard surface with a node graph, reporting unsupported inputs and nodes", () => {
    const minimal = parseMaterialXDocument(`<materialx version="1.39"><surface_unlit name="flat" type="surfaceshader"><input name="emission_color" type="color3" value="1, 0, 0"/></surface_unlit></materialx>`);
    expect(minimal.materials.map((material) => [material.name, material.model])).toEqual([["flat", "surface_unlit"]]);
    const document = parseMaterialXDocument(MTLX);
    expect(document.version).toBe("1.38");
    const surface = document.materials.find((material) => material.name === "painted")!;
    expect(surface.model).toBe("standard_surface");
    const base = evaluateMaterialXExpression(surface.parameters.base_color!) as readonly number[];
    expect(base.map((value) => Number(value.toFixed(6)))).toEqual([0.25, 0.125, 0.5]);
    expect(evaluateMaterialXExpression(surface.parameters.metalness!)).toBe(0.75);
    const codes = document.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain("MATERIALX_UNSUPPORTED_INPUT");
    expect(codes).toContain("MATERIALX_UNSUPPORTED_NODE");
    const material = createMaterialXMaterial(surface);
    expect(material.name).toBe("painted");
  });

  it("rejects unsupported versions, DTDs, duplicate nodes and graph cycles", () => {
    expect(() => parseMaterialXDocument(`<materialx version="1.37"/>`)).toThrow(/VERSION_UNSUPPORTED/);
    expect(() => parseMaterialXDocument(`<!DOCTYPE m><materialx version="1.38"/>`)).toThrow(/DTD/);
    expect(() => parseMaterialXDocument(`<materialx version="1.38"><constant name="a" type="float"/><constant name="a" type="float"/></materialx>`)).toThrow(/DUPLICATE_NODE/);
    const cycle = `<materialx version="1.38"><add name="a" type="float"><input name="in1" type="float" nodename="b"/></add><add name="b" type="float"><input name="in1" type="float" nodename="a"/></add>
      <standard_surface name="s" type="surfaceshader"><input name="metalness" type="float" nodename="a"/></standard_surface></materialx>`;
    expect(() => parseMaterialXDocument(cycle)).toThrow(/CYCLE/);
    expect(() => parseMaterialXDocument(MTLX, { maxBytes: 64 })).toThrow(/LIMIT/);
  });
});

describe("3DL fixtures", () => {
  it("parses minimal identity and realistic Mesh-headed lattices with interpolation", () => {
    const identity = parse3DLCube(lut3dl(2, 1023), { outputMax: 1023 });
    expect(identity.size).toBe(2);
    const sampled = sampleColorLut(identity, [0.25, 0.5, 0.75]);
    sampled.forEach((value, index) => expect(value).toBeCloseTo([0.25, 0.5, 0.75][index]!, 3));
    const inverted = parse3DLCube(`3DMESH\nMesh 1 12\n${lut3dl(3, 4095, (r, g, b) => [1 - r, g, b * 0.5])}`);
    expect(inverted.size).toBe(3);
    expect(inverted.diagnostics).toEqual([]);
    const value = sampleColorLut(inverted, [0, 1, 1]);
    expect(value[0]).toBeCloseTo(1, 3); expect(value[1]).toBeCloseTo(1, 3); expect(value[2]).toBeCloseTo(0.5, 3);
    const inferred = parse3DLCube(lut3dl(2, 1023));
    expect(inferred.diagnostics.map((diagnostic) => diagnostic.code)).toContain("COLOR_LUT_OUTPUT_RANGE_INFERRED");
  });

  it("rejects missing rows, negative codes, unknown directives, bad Mesh headers and grids", () => {
    const valid = lut3dl(2, 1023);
    expect(() => parse3DLCube(valid.trimEnd().split("\n").slice(0, -1).join("\n"))).toThrow(/expected 8 RGB rows/);
    expect(() => parse3DLCube(valid.replace("1023 1023 1023", "-1 1023 1023"))).toThrow(/non-negative/);
    expect(() => parse3DLCube(`LUT_3D_SIZE 2\n${valid}`)).toThrow(/UNSUPPORTED_DIRECTIVE/);
    expect(() => parse3DLCube(`Mesh 2 10\n${valid}`)).toThrow(/Mesh declares 5/);
    expect(() => parse3DLCube(valid.replace(/^0 1023/, "1023 0"))).toThrow(/strictly increasing/);
    expect(() => parse3DLCube(valid, { maxBytes: 8 })).toThrow(/LIMIT/);
  });
});
