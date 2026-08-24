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

function createDefenderGlb() {
  const positions = [];
  const normals = [];
  const indices = [];
  // A deliberately graphic, low-poly practice standee: separate shoes/legs,
  // jersey torso, raised contest arms, shoulders, neck, and faceted head make
  // the silhouette readable from the fixed shooting camera without implying a
  // skinned or animated character asset.
  appendBox(positions, normals, indices, -0.13, 0.34, 0, 0.18, 0.68, 0.08);
  appendBox(positions, normals, indices,  0.13, 0.34, 0, 0.18, 0.68, 0.08);
  appendBox(positions, normals, indices, -0.15, 0.03, 0.025, 0.28, 0.06, 0.16);
  appendBox(positions, normals, indices,  0.15, 0.03, 0.025, 0.28, 0.06, 0.16);
  appendBox(positions, normals, indices, 0, 1.02, 0, 0.48, 0.72, 0.10);
  appendBox(positions, normals, indices, -0.33, 1.24, 0, 0.16, 0.68, 0.08);
  appendBox(positions, normals, indices,  0.33, 1.24, 0, 0.16, 0.68, 0.08);
  appendBox(positions, normals, indices, 0, 1.42, 0, 0.16, 0.16, 0.08);
  appendSphere(positions, normals, indices, 0, 1.65, 0, 0.15);
  return buildGlb(new Float32Array(positions), new Float32Array(normals), new Uint16Array(indices), "#dc2626", 0.72, 0.08);
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

// 5. rooftopDefender.glb - recognizable 1.8m low-poly contest standee
writeFileSync(resolve(MODELS_DIR, "rooftopDefender.glb"), createDefenderGlb());
console.log("Wrote rooftopDefender.glb");

console.log("Rooftop Buckets models synthesized successfully.");
