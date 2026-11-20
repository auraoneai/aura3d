import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Document, NodeIO, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const dirs: string[] = [];
export function tmp(prefix = "aura3d-asset-post-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
export function cleanupTmp(): void {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** Axis-aligned box [min, max] as 24 vertices / 12 triangles with UVs. */
export function boxGeometry(min: readonly [number, number, number], max: readonly [number, number, number]) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const faces = [
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
    [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
    [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]
  ];
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  faces.forEach((quad, f) => {
    for (const p of quad) positions.push(...p);
    uvs.push(0, 1, 0, 0, 1, 0, 1, 1);
    const b = f * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) };
}

export async function checkerPng(size = 64, a = [220, 40, 40], b = [40, 40, 220]): Promise<Uint8Array> {
  const data = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const c = ((x >> 3) + (y >> 3)) % 2 ? a : b;
    data.set(c, (y * size + x) * 3);
  }
  return new Uint8Array(await sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer());
}

/** A bumpy normal map (smooth relief + fine grain, like a baked map): large as PNG, small as JPEG. */
export async function noisyNormalPng(size = 512): Promise<Uint8Array> {
  const data = Buffer.alloc(size * size * 3);
  let state = 0x9e3779b9;
  const grain = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) % 9) - 4;
  };
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const o = (y * size + x) * 3;
    data[o] = 128 + Math.round(60 * Math.sin(x / 7) * Math.cos(y / 11)) + grain();
    data[o + 1] = 128 + Math.round(60 * Math.cos(x / 13) * Math.sin(y / 5)) + grain();
    data[o + 2] = 230 + grain();
  }
  return new Uint8Array(await sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer());
}

export interface FixtureOptions {
  readonly texture?: boolean;
  readonly normalMap?: boolean;
  /** Put the body under a translated + rotated parent (tests transform baking). */
  readonly nested?: boolean;
  readonly skinned?: boolean;
  /** Material metallic / roughness factors (glTF defaults: 1 and 1, i.e. a rough metal). */
  readonly metallic?: number;
  readonly roughness?: number;
}

/**
 * A "vehicle" that faces +X: body box 4 long (X) x 1 tall x 2 wide, plus a nose box in front (+X).
 * Node names: body, nose. Source units are arbitrary (scale 1).
 */
export async function vehicleFacingPlusX(options: FixtureOptions = {}): Promise<Document> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const material = doc.createMaterial("paint").setBaseColorFactor([0.8, 0.6, 0.2, 1]);
  if (options.metallic !== undefined) material.setMetallicFactor(options.metallic);
  if (options.roughness !== undefined) material.setRoughnessFactor(options.roughness);
  if (options.texture) {
    material.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(doc.createTexture("albedo").setMimeType("image/png").setImage(await checkerPng()));
  }
  if (options.normalMap) {
    material.setNormalTexture(doc.createTexture("normal").setMimeType("image/png").setImage(await noisyNormalPng()));
  }
  const meshFor = (name: string, min: [number, number, number], max: [number, number, number]) => {
    const g = boxGeometry(min, max);
    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(g.positions).setBuffer(buffer))
      .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(g.uvs).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(g.indices).setBuffer(buffer))
      .setMaterial(material);
    return doc.createMesh(name).addPrimitive(prim);
  };
  const scene = doc.createScene("scene");
  const body = doc.createNode("body").setMesh(meshFor("body", [-2, 0, -1], [2, 1, 1]));
  const nose = doc.createNode("nose").setMesh(meshFor("nose", [2, 0, -0.25], [3, 0.5, 0.25]));
  let top: Node[] = [body, nose];
  if (options.nested) {
    const parent = doc.createNode("offset").setTranslation([10, 5, -3]).setScale([2, 2, 2]);
    parent.addChild(body).addChild(nose);
    top = [parent];
  }
  if (options.skinned) {
    const joint = doc.createNode("hips").setTranslation([0, 0.5, 0]);
    const ibm = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.5, 0, 1]);
    const skin = doc.createSkin("rig").addJoint(joint)
      .setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(ibm).setBuffer(buffer));
    for (const node of [body, nose]) {
      const prim = node.getMesh()!.listPrimitives()[0]!;
      const count = prim.getAttribute("POSITION")!.getCount();
      prim.setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(new Uint16Array(count * 4)).setBuffer(buffer));
      const weights = new Float32Array(count * 4);
      for (let i = 0; i < count; i += 1) weights[i * 4] = 1;
      prim.setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(weights).setBuffer(buffer));
      node.setSkin(skin);
    }
    top = [...top, joint];
  }
  for (const node of top) scene.addChild(node);
  doc.getRoot().setDefaultScene(scene);
  return doc;
}

export async function writeFixture(dir: string, name: string, options: FixtureOptions = {}): Promise<string> {
  const path = join(dir, name);
  await io.write(path, await vehicleFacingPlusX(options));
  return path;
}

export function captureIo(cwd: string) {
  const out: string[] = [], err: string[] = [];
  return { io: { cwd, stdout: (s: string) => { out.push(s); }, stderr: (s: string) => { err.push(s); } }, out, err };
}
