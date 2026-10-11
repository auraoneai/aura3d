/**
 * PRD-10 T3.6 §9.6 — GLB flattener for the impostor bake (Node side).
 *
 * Reads a binary glTF 2.0 file and flattens the default scene into one
 * object-space triangle soup (node TRS/matrix transforms applied, normals by
 * the inverse-transpose), grouped per primitive with its material colour,
 * alpha cutoff and base/diffuse texture image. The bake page uploads this
 * as-is, so the same GLB bytes always produce the same draw stream.
 *
 * Supported: TRIANGLES primitives, float POSITION/NORMAL/TEXCOORD_0,
 * u8/u16/u32 indices, interleaved bufferViews (byteStride),
 * `pbrMetallicRoughness.baseColor*` and `KHR_materials_pbrSpecularGlossiness`
 * `diffuse*`. Anything else throws — the bake must not silently drop geometry.
 */
import { readFileSync } from "node:fs";

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function parseGlb(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("glb: bad magic");
  let off = 12;
  let json = null;
  let bin = null;
  while (off < bytes.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const chunk = bytes.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error("glb: missing JSON or BIN chunk");
  return { json, bin };
}

function readAccessor(gltf, bin, index) {
  const acc = gltf.accessors[index];
  const view = gltf.bufferViews[acc.bufferView];
  const n = COMPONENTS[acc.type];
  const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
  if (!n || !size) throw new Error(`glb: unsupported accessor ${index} (${acc.type}/${acc.componentType})`);
  const stride = view.byteStride || n * size;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out = acc.componentType === 5126 ? new Float32Array(acc.count * n) : new Uint32Array(acc.count * n);
  for (let i = 0; i < acc.count; i += 1) {
    for (let c = 0; c < n; c += 1) {
      const p = base + i * stride + c * size;
      out[i * n + c] = acc.componentType === 5126 ? dv.getFloat32(p, true)
        : acc.componentType === 5125 ? dv.getUint32(p, true)
          : acc.componentType === 5123 ? dv.getUint16(p, true) : dv.getUint8(p);
    }
  }
  return out;
}

/** column-major 4x4 multiply a*b */
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    let s = 0;
    for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
    2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
    2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
    tx, ty, tz, 1
  ];
}

/** cofactor of the upper 3x3 (∝ inverse-transpose; sign-corrected by det) */
function normalMatrix(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const co = [e * i - f * h, -(d * i - f * g), d * h - e * g, -(b * i - c * h), a * i - c * g, -(a * h - b * g), b * f - c * e, -(a * f - c * d), a * e - b * d];
  const det = a * co[0] + b * co[1] + c * co[2];
  const s = det < 0 ? -1 : 1;
  // rows of the cofactor matrix: n' = C · n
  return [co[0] * s, co[1] * s, co[2] * s, co[3] * s, co[4] * s, co[5] * s, co[6] * s, co[7] * s, co[8] * s];
}

function materialOf(gltf, index) {
  const m = index === undefined ? {} : gltf.materials[index];
  const sg = m.extensions?.KHR_materials_pbrSpecularGlossiness;
  const pbr = m.pbrMetallicRoughness ?? {};
  const color = sg?.diffuseFactor ?? pbr.baseColorFactor ?? [1, 1, 1, 1];
  const tex = sg?.diffuseTexture ?? pbr.baseColorTexture;
  const image = tex ? gltf.textures[tex.index].source : null;
  const alphaCutoff = m.alphaMode === "MASK" ? (m.alphaCutoff ?? 0.5) : 0;
  return { color: [...color], alphaCutoff, image };
}

/** Serialise a `loadGlbMesh` result for `page.evaluate` (typed arrays → arrays). */
export function meshForPage(mesh) {
  return {
    positions: Array.from(mesh.positions),
    normals: Array.from(mesh.normals),
    uvs: Array.from(mesh.uvs),
    indices: Array.from(mesh.indices),
    groups: mesh.groups,
    images: mesh.images
  };
}

/**
 * @param {string} path GLB file
 * @param {{ materials?: readonly number[], nodes?: readonly string[] }} [opts] keep only primitives
 *   using these material indices / inside the subtrees of these node names
 */
export function loadGlbMesh(path, opts = {}) {
  const { json: gltf, bin } = parseGlb(new Uint8Array(readFileSync(path)));
  const pos = [], nrm = [], uv = [], idx = [], groups = [];
  const usedImages = new Map();
  const visit = (nodeIndex, parent, selected) => {
    const node = gltf.nodes[nodeIndex];
    const world = mul(parent, nodeMatrix(node));
    const inSubtree = selected || !opts.nodes || opts.nodes.includes(node.name);
    if (node.mesh !== undefined && inSubtree) {
      const nm = normalMatrix(world);
      for (const prim of gltf.meshes[node.mesh].primitives) {
        if (opts.materials && !opts.materials.includes(prim.material)) continue;
        if ((prim.mode ?? 4) !== 4) throw new Error(`glb: primitive mode ${prim.mode} unsupported`);
        const P = readAccessor(gltf, bin, prim.attributes.POSITION);
        const N = prim.attributes.NORMAL !== undefined ? readAccessor(gltf, bin, prim.attributes.NORMAL) : null;
        const T = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(gltf, bin, prim.attributes.TEXCOORD_0) : null;
        const count = P.length / 3;
        const I = prim.indices !== undefined ? readAccessor(gltf, bin, prim.indices) : Uint32Array.from({ length: count }, (_, k) => k);
        const baseVertex = pos.length / 3;
        for (let v = 0; v < count; v += 1) {
          const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
          pos.push(world[0] * x + world[4] * y + world[8] * z + world[12], world[1] * x + world[5] * y + world[9] * z + world[13], world[2] * x + world[6] * y + world[10] * z + world[14]);
          const nx = N ? N[v * 3] : 0, ny = N ? N[v * 3 + 1] : 1, nz = N ? N[v * 3 + 2] : 0;
          const tx = nm[0] * nx + nm[1] * ny + nm[2] * nz, ty = nm[3] * nx + nm[4] * ny + nm[5] * nz, tz = nm[6] * nx + nm[7] * ny + nm[8] * nz;
          const l = Math.hypot(tx, ty, tz) || 1;
          nrm.push(tx / l, ty / l, tz / l);
          uv.push(T ? T[v * 2] : 0, T ? T[v * 2 + 1] : 0);
        }
        const material = materialOf(gltf, prim.material);
        if (material.image !== null && !usedImages.has(material.image)) usedImages.set(material.image, usedImages.size);
        groups.push({ start: idx.length, count: I.length, material: { ...material, image: material.image === null ? null : usedImages.get(material.image) } });
        for (const k of I) idx.push(baseVertex + k);
      }
    }
    for (const child of node.children ?? []) visit(child, world, inSubtree && Boolean(opts.nodes));
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, identity, false);
  if (pos.length === 0) throw new Error("glb: no triangles selected");

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < pos.length; v += 3) for (let c = 0; c < 3; c += 1) {
    min[c] = Math.min(min[c], pos[v + c]); max[c] = Math.max(max[c], pos[v + c]);
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let radius = 0;
  for (let v = 0; v < pos.length; v += 3) radius = Math.max(radius, Math.hypot(pos[v] - center[0], pos[v + 1] - center[1], pos[v + 2] - center[2]));

  const images = [...usedImages.keys()].map((src) => {
    const img = gltf.images[src];
    const view = gltf.bufferViews[img.bufferView];
    const bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    return { mime: img.mimeType, base64: Buffer.from(bytes).toString("base64") };
  });
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    uvs: new Float32Array(uv),
    indices: new Uint32Array(idx),
    groups,
    images,
    bounds: { center, radius, min, max }
  };
}
