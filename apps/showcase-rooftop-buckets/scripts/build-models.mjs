/**
 * Synthesizes CC0 GLB 3D models for Rooftop Buckets showcase.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = resolve(__dirname, "../assets/models");
mkdirSync(MODELS_DIR, { recursive: true });

function createBoxGlb(dx, dy, dz, colorHex = "#38bdf8", roughness = 0.5, metallic = 0.1) {
  const hx = dx / 2, hy = dy / 2, hz = dz / 2;
  const positions = new Float32Array([
    // Front face
    -hx, -hy,  hz,   hx, -hy,  hz,   hx,  hy,  hz,  -hx,  hy,  hz,
    // Back face
     hx, -hy, -hz,  -hx, -hy, -hz,  -hx,  hy, -hz,   hx,  hy, -hz,
    // Top face
    -hx,  hy,  hz,   hx,  hy,  hz,   hx,  hy, -hz,  -hx,  hy, -hz,
    // Bottom face
    -hx, -hy, -hz,   hx, -hy, -hz,   hx, -hy,  hz,  -hx, -hy,  hz,
    // Right face
     hx, -hy,  hz,   hx, -hy, -hz,   hx,  hy, -hz,   hx,  hy,  hz,
    // Left face
    -hx, -hy, -hz,  -hx, -hy,  hz,  -hx,  hy,  hz,  -hx,  hy, -hz,
  ]);

  const normals = new Float32Array([
     0,  0,  1,   0,  0,  1,   0,  0,  1,   0,  0,  1,
     0,  0, -1,   0,  0, -1,   0,  0, -1,   0,  0, -1,
     0,  1,  0,   0,  1,  0,   0,  1,  0,   0,  1,  0,
     0, -1,  0,   0, -1,  0,   0, -1,  0,   0, -1,  0,
     1,  0,  0,   1,  0,  0,   1,  0,  0,   1,  0,  0,
    -1,  0,  0,  -1,  0,  0,  -1,  0,  0,  -1,  0,  0,
  ]);

  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,
     4,  5,  6,   4,  6,  7,
     8,  9, 10,   8, 10, 11,
    12, 13, 14,  12, 14, 15,
    16, 17, 18,  16, 18, 19,
    20, 21, 22,  20, 22, 23,
  ]);

  return buildGlb(positions, normals, indices, colorHex, roughness, metallic);
}

function createSphereGlb(radius = 0.5, latBands = 12, lonBands = 16, colorHex = "#ea580c") {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat * Math.PI) / latBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon * 2 * Math.PI) / lonBands;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const x = cosPhi * sinTheta;
      const y = cosTheta;
      const z = sinPhi * sinTheta;

      normals.push(x, y, z);
      positions.push(radius * x, radius * y, radius * z);
    }
  }

  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const first = lat * (lonBands + 1) + lon;
      const second = first + lonBands + 1;
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return buildGlb(
    new Float32Array(positions),
    new Float32Array(normals),
    new Uint16Array(indices),
    colorHex,
    0.6,
    0.05
  );
}

function createTorusGlb(majorR = 0.225, minorR = 0.015, majorSegs = 16, minorSegs = 8, colorHex = "#f97316") {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i <= majorSegs; i++) {
    const u = (i / majorSegs) * 2 * Math.PI;
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);

    for (let j = 0; j <= minorSegs; j++) {
      const v = (j / minorSegs) * 2 * Math.PI;
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);

      const x = (majorR + minorR * cosV) * cosU;
      const y = minorR * sinV;
      const z = (majorR + minorR * cosV) * sinU;

      const nx = cosV * cosU;
      const ny = sinV;
      const nz = cosV * sinU;

      positions.push(x, y, z);
      normals.push(nx, ny, nz);
    }
  }

  for (let i = 0; i < majorSegs; i++) {
    for (let j = 0; j < minorSegs; j++) {
      const a = i * (minorSegs + 1) + j;
      const b = (i + 1) * (minorSegs + 1) + j;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  return buildGlb(
    new Float32Array(positions),
    new Float32Array(normals),
    new Uint16Array(indices),
    colorHex,
    0.3,
    0.8
  );
}

function appendBox(positions, normals, indices, cx, cy, cz, dx, dy, dz) {
  const hx = dx / 2, hy = dy / 2, hz = dz / 2;
  const offset = positions.length / 3;
  positions.push(
    -hx + cx, -hy + cy,  hz + cz,  hx + cx, -hy + cy,  hz + cz,  hx + cx,  hy + cy,  hz + cz, -hx + cx,  hy + cy,  hz + cz,
     hx + cx, -hy + cy, -hz + cz, -hx + cx, -hy + cy, -hz + cz, -hx + cx,  hy + cy, -hz + cz,  hx + cx,  hy + cy, -hz + cz,
    -hx + cx,  hy + cy,  hz + cz,  hx + cx,  hy + cy,  hz + cz,  hx + cx,  hy + cy, -hz + cz, -hx + cx,  hy + cy, -hz + cz,
    -hx + cx, -hy + cy, -hz + cz,  hx + cx, -hy + cy, -hz + cz,  hx + cx, -hy + cy,  hz + cz, -hx + cx, -hy + cy,  hz + cz,
     hx + cx, -hy + cy,  hz + cz,  hx + cx, -hy + cy, -hz + cz,  hx + cx,  hy + cy, -hz + cz,  hx + cx,  hy + cy,  hz + cz,
    -hx + cx, -hy + cy, -hz + cz, -hx + cx, -hy + cy,  hz + cz, -hx + cx,  hy + cy,  hz + cz, -hx + cx,  hy + cy, -hz + cz
  );
  normals.push(
     0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
     0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
     1,0,0, 1,0,0, 1,0,0, 1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0
  );
  const local = [0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11, 12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23];
  indices.push(...local.map((index) => offset + index));
}

function appendSphere(positions, normals, indices, cx, cy, cz, radius, latBands = 10, lonBands = 14) {
  const offset = positions.length / 3;
  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat * Math.PI) / latBands;
    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon * 2 * Math.PI) / lonBands;
      const x = Math.cos(phi) * Math.sin(theta);
      const y = Math.cos(theta);
      const z = Math.sin(phi) * Math.sin(theta);
      normals.push(x, y, z);
      positions.push(cx + radius * x, cy + radius * y, cz + radius * z);
    }
  }
  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const first = offset + lat * (lonBands + 1) + lon;
      const second = first + lonBands + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
}

function appendCylinderBetween(positions, normals, indices, start, end, radius, segments = 12) {
  const axis = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  const up = axis.map((value) => value / length);
  const helper = Math.abs(up[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  const tangentLength = Math.hypot(
    helper[1] * up[2] - helper[2] * up[1],
    helper[2] * up[0] - helper[0] * up[2],
    helper[0] * up[1] - helper[1] * up[0]
  );
  const tangent = [
    (helper[1] * up[2] - helper[2] * up[1]) / tangentLength,
    (helper[2] * up[0] - helper[0] * up[2]) / tangentLength,
    (helper[0] * up[1] - helper[1] * up[0]) / tangentLength
  ];
  const bitangent = [
    up[1] * tangent[2] - up[2] * tangent[1],
    up[2] * tangent[0] - up[0] * tangent[2],
    up[0] * tangent[1] - up[1] * tangent[0]
  ];
  const offset = positions.length / 3;
  for (const point of [start, end]) {
    for (let index = 0; index <= segments; index++) {
      const angle = (index / segments) * Math.PI * 2;
      const radial = [
        tangent[0] * Math.cos(angle) + bitangent[0] * Math.sin(angle),
        tangent[1] * Math.cos(angle) + bitangent[1] * Math.sin(angle),
        tangent[2] * Math.cos(angle) + bitangent[2] * Math.sin(angle)
      ];
      positions.push(point[0] + radial[0] * radius, point[1] + radial[1] * radius, point[2] + radial[2] * radius);
      normals.push(radial[0], radial[1], radial[2]);
    }
  }
  for (let index = 0; index < segments; index++) {
    const a = offset + index;
    const b = offset + segments + 1 + index;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
}

function quaternionFromEuler(x = 0, y = 0, z = 0) {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  ];
}

function createArticulatedPlayerGlb(kind) {
  const isShooter = kind === "shooter";
  const materials = [
    { name: "uniform", color: isShooter ? "#0e7490" : "#be185d", roughness: 0.5 },
    { name: "uniform-trim", color: isShooter ? "#67e8f9" : "#f9a8d4", roughness: 0.42 },
    { name: "skin", color: "#d69a72", roughness: 0.72 },
    { name: "shoes", color: "#f8fafc", roughness: 0.38 },
    { name: "hair", color: "#261c24", roughness: 0.84 }
  ];
  const geometries = {};
  for (const geometry of ["box", "sphere", "limb"]) {
    const positions = [], normals = [], indices = [];
    if (geometry === "box") appendBox(positions, normals, indices, 0, 0, 0, 1, 1, 1);
    else if (geometry === "sphere") appendSphere(positions, normals, indices, 0, 0, 0, 0.5, 10, 14);
    else appendCylinderBetween(positions, normals, indices, [0, 0, 0], [0, -1, 0], 0.5, 14);
    geometries[geometry] = {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices)
    };
  }

  const limb = (name, start, end, width, materialIndex) => {
    const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
    const positions = [], normals = [], indices = [];
    appendCylinderBetween(positions, normals, indices, [0, 0, 0], [dx, dy, dz], width / 2, 14);
    // Hands share the forearm's skin material, so bake their visible geometry
    // into that articulated mesh while retaining named hand pose nodes below.
    // This preserves the connected silhouette and saves one draw per hand.
    if (name.endsWith("Forearm")) appendSphere(positions, normals, indices, dx, dy, dz, 0.125, 7, 11);
    const geometryName = `limb-${name}`;
    geometries[geometryName] = {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices)
    };
    return { name, parent: "Root", mesh: [geometryName, materialIndex], translation: start, scale: [1, 1, 1] };
  };
  const leftArm = isShooter
    ? [[-0.3, 1.53, 0], [-0.43, 1.88, -0.04], [-0.48, 2.18, -0.1]]
    : [[-0.3, 1.53, 0], [-0.56, 1.86, 0.02], [-0.5, 2.17, 0.06]];
  const rightArm = isShooter
    ? [[0.3, 1.53, 0], [0.57, 1.8, -0.02], [0.43, 2.08, -0.1]]
    : [[0.3, 1.53, 0], [0.56, 1.86, 0.02], [0.5, 2.17, 0.06]];
  const parts = [
    { name: "Pelvis", parent: "Root", translation: [0, 0.93, 0], scale: [1, 1, 1] },
    { name: "Torso", parent: "Root", mesh: ["box", 0], translation: [0, 1.3, -0.015], scale: [0.56, 0.58, 0.32] },
    { name: "Head", parent: "Root", mesh: ["sphere", 2], translation: [0, 1.82, -0.015], scale: [0.42, 0.5, 0.4] },
    limb("LeftUpperLeg", [-0.16, 0.86, 0], [-0.28, 0.45, 0.05], 0.2, 0),
    limb("LeftLowerLeg", [-0.28, 0.45, 0.05], [-0.34, 0.09, 0.12], 0.17, 2),
    { name: "LeftShoe", parent: "Root", mesh: ["box", 3], translation: [-0.36, 0.055, 0.02], scale: [0.26, 0.11, 0.42] },
    limb("RightUpperLeg", [0.16, 0.86, 0], [0.28, 0.45, -0.04], 0.2, 0),
    limb("RightLowerLeg", [0.28, 0.45, -0.04], [0.34, 0.09, 0.04], 0.17, 2),
    { name: "RightShoe", parent: "Root", mesh: ["box", 3], translation: [0.36, 0.055, -0.07], scale: [0.26, 0.11, 0.42] },
    limb("LeftUpperArm", leftArm[0], leftArm[1], 0.17, 0),
    limb("LeftForearm", leftArm[1], leftArm[2], 0.145, 2),
    { name: "LeftHand", parent: "Root", translation: leftArm[2], scale: [1, 1, 1] },
    limb("RightUpperArm", rightArm[0], rightArm[1], 0.17, 0),
    limb("RightForearm", rightArm[1], rightArm[2], 0.145, 2),
    { name: "RightHand", parent: "Root", translation: rightArm[2], scale: [1, 1, 1] }
  ];
  const nodes = [{ name: "Root", children: [] }];
  const nodeIndex = new Map([["Root", 0]]);
  for (const part of parts) {
    const index = nodes.length;
    nodeIndex.set(part.name, index);
    nodes.push({ name: part.name, translation: part.translation, rotation: part.rotation, scale: part.scale, ...(part.mesh ? { meshKey: `${part.mesh[0]}:${part.mesh[1]}` } : {}), children: [] });
  }
  for (const part of parts) nodes[nodeIndex.get(part.parent)].children.push(nodeIndex.get(part.name));

  const clipDefinitions = isShooter ? [
    { name: "Load", duration: 0.34, rotations: { Torso: [-0.18, 0, 0], LeftUpperArm: [-0.15, 0, -1.7], LeftForearm: [0, 0, -0.55], RightUpperArm: [-0.12, 0, 1.55], RightForearm: [0, 0, 0.62], LeftUpperLeg: [0.3, 0, -0.22], RightUpperLeg: [0.28, 0, 0.22] } },
    { name: "Release", duration: 0.26, rotations: { Torso: [0.06, 0, -0.06], LeftUpperArm: [-0.18, 0, -2.78], LeftForearm: [0, 0, -0.18], RightUpperArm: [-0.1, 0, 2.35], RightForearm: [0, 0, 0.3], LeftUpperLeg: [-0.08, 0, -0.08], RightUpperLeg: [-0.08, 0, 0.08] } },
    { name: "FollowThrough", duration: 0.52, preserveBind: true, rotations: { Torso: [0, 0, 0], LeftUpperArm: [0, 0, 0], LeftForearm: [0, 0, 0], RightUpperArm: [0, 0, 0], RightForearm: [0, 0, 0], LeftHand: [0, 0, 0], RightHand: [0, 0, 0] } }
  ] : [
    { name: "Plant", duration: 0.28, rotations: { Torso: [-0.1, 0, 0], LeftUpperLeg: [0.26, 0, -0.28], RightUpperLeg: [0.26, 0, 0.28], LeftUpperArm: [0, 0, -0.58], RightUpperArm: [0, 0, 0.58] } },
    { name: "Telegraph", duration: 0.38, rotations: { Torso: [-0.2, 0, 0], LeftUpperLeg: [0.38, 0, -0.34], RightUpperLeg: [0.38, 0, 0.34], LeftUpperArm: [-0.1, 0, -1.36], RightUpperArm: [-0.1, 0, 1.36], LeftForearm: [0, 0, -0.34], RightForearm: [0, 0, 0.34] } },
    { name: "Jump", duration: 0.3, translation: [0, 0.36, 0], rotations: { Torso: [0.08, 0, 0], LeftUpperArm: [-0.12, 0, -2.72], RightUpperArm: [-0.12, 0, 2.72], LeftForearm: [0, 0, -0.14], RightForearm: [0, 0, 0.14] } },
    { name: "Contest", duration: 0.5, preserveBind: true, rotations: { Torso: [0, 0, 0], LeftUpperArm: [0, 0, 0], RightUpperArm: [0, 0, 0], LeftForearm: [0, 0, 0], RightForearm: [0, 0, 0], LeftHand: [0, 0, 0], RightHand: [0, 0, 0] } }
  ];

  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;
  const pushData = (array, target, type, componentType, count, min, max) => {
    const padding = (4 - (byteOffset % 4)) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); byteOffset += padding; }
    const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, ...(target ? { target } : {}) });
    chunks.push(buffer); byteOffset += buffer.length;
    const accessor = accessors.length;
    accessors.push({ bufferView: view, componentType, count, type, ...(min ? { min } : {}), ...(max ? { max } : {}) });
    return accessor;
  };
  const geometryAccessors = {};
  for (const [name, geometry] of Object.entries(geometries)) {
    const positionMin = [Infinity, Infinity, Infinity];
    const positionMax = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < geometry.positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        positionMin[axis] = Math.min(positionMin[axis], geometry.positions[index + axis]);
        positionMax[axis] = Math.max(positionMax[axis], geometry.positions[index + axis]);
      }
    }
    const pos = pushData(geometry.positions, 34962, "VEC3", 5126, geometry.positions.length / 3, positionMin, positionMax);
    const norm = pushData(geometry.normals, 34962, "VEC3", 5126, geometry.normals.length / 3);
    const idx = pushData(geometry.indices, 34963, "SCALAR", 5123, geometry.indices.length);
    geometryAccessors[name] = { pos, norm, idx };
  }
  const meshes = [];
  const meshIndex = new Map();
  for (const geometryName of Object.keys(geometries)) {
    for (let materialIndex = 0; materialIndex < materials.length; materialIndex += 1) {
      const key = `${geometryName}:${materialIndex}`;
      const geometry = geometryAccessors[geometryName];
      meshIndex.set(key, meshes.length);
      meshes.push({ name: key, primitives: [{ attributes: { POSITION: geometry.pos, NORMAL: geometry.norm }, indices: geometry.idx, material: materialIndex }] });
    }
  }
  for (const node of nodes) {
    if (node.meshKey) { node.mesh = meshIndex.get(node.meshKey); delete node.meshKey; }
    if (!node.children.length) delete node.children;
  }
  const animations = clipDefinitions.map((clip) => {
    const samplers = [], channels = [];
    const timeAccessor = pushData(new Float32Array([0, clip.duration]), undefined, "SCALAR", 5126, 2, [0], [clip.duration]);
    for (const [name, euler] of Object.entries(clip.rotations)) {
      const target = nodes[nodeIndex.get(name)];
      const start = target.rotation ?? [0, 0, 0, 1];
      const end = clip.preserveBind ? start : quaternionFromEuler(...euler);
      const output = pushData(new Float32Array([...start, ...end]), undefined, "VEC4", 5126, 2);
      const sampler = samplers.length;
      samplers.push({ input: timeAccessor, output, interpolation: "LINEAR" });
      channels.push({ sampler, target: { node: nodeIndex.get(name), path: "rotation" } });
    }
    if (clip.translation) {
      const output = pushData(new Float32Array([0, 0, 0, ...clip.translation]), undefined, "VEC3", 5126, 2);
      const sampler = samplers.length;
      samplers.push({ input: timeAccessor, output, interpolation: "LINEAR" });
      channels.push({ sampler, target: { node: 0, path: "translation" } });
    }
    return { name: clip.name, samplers, channels };
  });
  const binBuffer = Buffer.concat(chunks);
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D Rooftop Buckets Articulated CC0 Synthesizer", extras: { aura3d: { orientation: { forwardAxis: "+Z", upAxis: "+Y" }, articulatedPoseNodes: parts.map((part) => part.name), authoredClips: clipDefinitions.map((clip) => clip.name) } } },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes,
    materials: materials.map((entry) => { const r = parseInt(entry.color.slice(1, 3), 16) / 255, g = parseInt(entry.color.slice(3, 5), 16) / 255, b = parseInt(entry.color.slice(5, 7), 16) / 255; return { name: entry.name, pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1], metallicFactor: 0.04, roughnessFactor: entry.roughness } }; }),
    animations,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuffer.length }]
  };
  const jsonBuffer = Buffer.from(JSON.stringify(gltf), "utf8");
  const paddedJson = Buffer.concat([jsonBuffer, Buffer.alloc((4 - jsonBuffer.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  header.write("glTF", 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + paddedJson.length + 8 + binBuffer.length, 8);
  jsonHeader.writeUInt32LE(paddedJson.length, 0); jsonHeader.write("JSON", 4);
  binHeader.writeUInt32LE(binBuffer.length, 0); binHeader.write("BIN\0", 4);
  return Buffer.concat([header, jsonHeader, paddedJson, binHeader, binBuffer]);
}

function buildGlb(positions, normals, indices, colorHex, roughness, metallic) {
  const r = parseInt(colorHex.slice(1, 3), 16) / 255;
  const g = parseInt(colorHex.slice(3, 5), 16) / 255;
  const b = parseInt(colorHex.slice(5, 7), 16) / 255;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }

  const posByteLength = positions.byteLength;
  const normByteLength = normals.byteLength;
  const idxByteLength = indices.byteLength;

  const posOffset = 0;
  const normOffset = posByteLength;
  const idxOffset = normOffset + normByteLength;
  const totalBinLength = (idxOffset + idxByteLength + 3) & ~3; // 4-byte align

  const binBuffer = Buffer.alloc(totalBinLength);
  Buffer.from(positions.buffer).copy(binBuffer, posOffset);
  Buffer.from(normals.buffer).copy(binBuffer, normOffset);
  Buffer.from(indices.buffer).copy(binBuffer, idxOffset);

  const gltf = {
    asset: {
      version: "2.0",
      generator: "Aura3D Rooftop Buckets Synthesizer",
      extras: { aura3d: { orientation: { forwardAxis: "+Z", upAxis: "+Y" } } }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0
      }]
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, 1.0],
        metallicFactor: metallic,
        roughnessFactor: roughness
      }
    }],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: positions.length / 3,
        type: "VEC3",
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ]
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: normals.length / 3,
        type: "VEC3"
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: indices.length,
        type: "SCALAR"
      }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posOffset, byteLength: posByteLength, target: 34962 },
      { buffer: 0, byteOffset: normOffset, byteLength: normByteLength, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxByteLength, target: 34963 }
    ],
    buffers: [{ byteLength: totalBinLength }]
  };

  const jsonStr = JSON.stringify(gltf);
  const jsonBuffer = Buffer.from(jsonStr, "utf8");
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const paddedJsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);

  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4); // version
  const totalLength = 12 + 8 + paddedJsonBuffer.length + 8 + binBuffer.length;
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(paddedJsonBuffer.length, 0);
  jsonChunkHeader.write("JSON", 4);

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.length, 0);
  binChunkHeader.write("BIN\0", 4);

  return Buffer.concat([header, jsonChunkHeader, paddedJsonBuffer, binChunkHeader, binBuffer]);
}

// 1. rooftopCourt.glb - Asphalt pad with boundary (16m x 12m x 0.2m)
writeFileSync(resolve(MODELS_DIR, "rooftopCourt.glb"), createBoxGlb(16, 0.2, 14, "#1e293b", 0.95, 0.05));
console.log("Wrote rooftopCourt.glb");

// 2. rooftopBall.glb - unit-normalized basketball sphere (R = 0.5)
// The route scales it to the regulation 0.24m diameter used by flight/contact.
writeFileSync(resolve(MODELS_DIR, "rooftopBall.glb"), createSphereGlb(0.5, 14, 18, "#ea580c"));
console.log("Wrote rooftopBall.glb");

// 3. rooftopRim.glb - Steel hoop ring (R = 0.225m)
writeFileSync(resolve(MODELS_DIR, "rooftopRim.glb"), createTorusGlb(0.225, 0.015, 18, 10, "#f97316"));
console.log("Wrote rooftopRim.glb");

// 4. rooftopBackboard.glb - Glass/acrylic backboard (1.8m x 1.05m x 0.05m)
writeFileSync(resolve(MODELS_DIR, "rooftopBackboard.glb"), createBoxGlb(1.8, 1.05, 0.05, "#38bdf8", 0.1, 0.9));
console.log("Wrote rooftopBackboard.glb");

// 5–6. Route-owned articulated athletes expose visible parented limb nodes and
// named action clips while the route's shot and contest math remains authoritative.
writeFileSync(resolve(MODELS_DIR, "rooftopDefender.glb"), createArticulatedPlayerGlb("defender"));
console.log("Wrote rooftopDefender.glb");
writeFileSync(resolve(MODELS_DIR, "rooftopShooter.glb"), createArticulatedPlayerGlb("shooter"));
console.log("Wrote rooftopShooter.glb");

console.log("Rooftop Buckets models synthesized successfully.");
