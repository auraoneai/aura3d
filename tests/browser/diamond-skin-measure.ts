import { readFileSync } from "node:fs";

/**
 * CPU skin of the batter's hand vertices from the engine's joint matrices, so the grip is measured against the DRAWN hand
 * (skinned vertices) and not only against the bone, whichever way the mesh is bound.
 */
type V3 = [number, number, number];

interface Glb {
  json: any;
  bin: Buffer;
}

function readGlb(path: string): Glb {
  const b = readFileSync(path);
  const jl = b.readUInt32LE(12);
  return { json: JSON.parse(b.subarray(20, 20 + jl).toString()), bin: b.subarray(20 + jl + 8) };
}

function accessor(g: Glb, index: number): number[][] {
  const a = g.json.accessors[index];
  const bv = g.json.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type as string]!;
  const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType as number]!;
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = bv.byteStride ?? size * n;
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  const out: number[][] = [];
  for (let k = 0; k < a.count; k++) {
    const row: number[] = [];
    for (let c = 0; c < n; c++) {
      const o = off + k * stride + c * size;
      let v = a.componentType === 5126 ? dv.getFloat32(o, true) : a.componentType === 5123 ? dv.getUint16(o, true) : a.componentType === 5121 ? dv.getUint8(o) : dv.getUint32(o, true);
      if (a.normalized) v /= a.componentType === 5123 ? 65535 : 255;
      row.push(v);
    }
    out.push(row);
  }
  return out;
}

const apply = (m: ArrayLike<number>, v: V3): V3 => [m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2] + m[12]!, m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2] + m[13]!, m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2] + m[14]!];

export interface HandMesh {
  jointNames: string[];
  ibm: number[][];
  hands: Record<"Right" | "Left", Array<{ v: V3; j: number[]; w: number[] }>>;
}

export function loadHandMesh(path: string): HandMesh {
  const g = readGlb(path);
  const skin = g.json.skins[0];
  const jointNames: string[] = skin.joints.map((i: number) => g.json.nodes[i].name);
  const ibm = accessor(g, skin.inverseBindMatrices);
  const hands: HandMesh["hands"] = { Right: [], Left: [] };
  for (const prim of g.json.meshes[0].primitives) {
    const pos = accessor(g, prim.attributes.POSITION);
    const jt = accessor(g, prim.attributes.JOINTS_0);
    const wt = accessor(g, prim.attributes.WEIGHTS_0);
    for (const side of ["Right", "Left"] as const) {
      const ji = jointNames.indexOf(`${side}Forearm`);
      for (let k = 0; k < pos.length; k++) {
        let w = 0;
        for (let c = 0; c < 4; c++) if (jt[k]![c] === ji) w += wt[k]![c]!;
        if (w <= 0.6) continue;
        const local = apply(ibm[ji]!, pos[k]! as V3);
        if (Math.hypot(...local) <= 0.34) continue;
        hands[side].push({ v: pos[k]! as V3, j: jt[k]!, w: wt[k]! });
      }
    }
  }
  return { jointNames, ibm, hands };
}

export function renderedHandCentroid(mesh: HandMesh, side: "Right" | "Left", mats: Record<string, number[] | null>, node: { pos: V3; yaw: number; s: number; n: V3 }): V3 | null {
  const pts = mesh.hands[side];
  if (pts.length === 0) return null;
  const acc: V3 = [0, 0, 0];
  for (const p of pts) {
    const out: V3 = [0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const w = p.w[c]!;
      if (w === 0) continue;
      const name = mesh.jointNames[p.j[c]!]!;
      const m = mats[name];
      if (!m) return null;
      const q = apply(m, apply(mesh.ibm[p.j[c]!]!, p.v));
      out[0] += w * q[0];
      out[1] += w * q[1];
      out[2] += w * q[2];
    }
    acc[0] += out[0];
    acc[1] += out[1];
    acc[2] += out[2];
  }
  const sk: V3 = [acc[0] / pts.length, acc[1] / pts.length, acc[2] / pts.length];
  const sc: V3 = [(sk[0] + node.n[0]) * node.s, (sk[1] + node.n[1]) * node.s, (sk[2] + node.n[2]) * node.s];
  const c = Math.cos(node.yaw);
  const s = Math.sin(node.yaw);
  return [node.pos[0] + sc[0] * c + sc[2] * s, node.pos[1] + sc[1], node.pos[2] - sc[0] * s + sc[2] * c];
}

/** Distances (metres) from the drawn hands to the bat axis and the knob. */
export function drawnGrip(rightHand: V3 | null, leftHand: V3 | null, knob: V3, tip: V3): Record<string, number | null> {
  const d: V3 = [tip[0] - knob[0], tip[1] - knob[1], tip[2] - knob[2]];
  const L = Math.hypot(...d);
  const dir: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const axis = (p: V3 | null): number | null => {
    if (!p) return null;
    const r: V3 = [p[0] - knob[0], p[1] - knob[1], p[2] - knob[2]];
    const cr: V3 = [r[1] * dir[2] - r[2] * dir[1], r[2] * dir[0] - r[0] * dir[2], r[0] * dir[1] - r[1] * dir[0]];
    return Math.hypot(...cr);
  };
  const along = (p: V3 | null): number | null => (p ? (p[0] - knob[0]) * dir[0] + (p[1] - knob[1]) * dir[1] + (p[2] - knob[2]) * dir[2] : null);
  return { drawnRightToAxis: axis(rightHand), drawnLeftToAxis: axis(leftHand), drawnRightAlong: along(rightHand), drawnLeftAlong: along(leftHand) };
}
