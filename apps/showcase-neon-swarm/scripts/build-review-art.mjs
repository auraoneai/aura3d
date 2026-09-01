import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const align4 = (value) => (value + 3) & ~3;
const padded = (bytes, fill = 0) => {
  const output = Buffer.alloc(align4(bytes.length), fill);
  bytes.copy(output);
  return output;
};
const floats = (values) => {
  const output = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => output.writeFloatLE(value, index * 4));
  return output;
};
const ushorts = (values) => {
  const output = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => output.writeUInt16LE(value, index * 2));
  return output;
};

function buildCard({ source, output, name, prompt, role, halfWidth, halfHeight, horizontal = false, alpha = false }) {
  // Opaque horizontal panoramas retain a shallow but release-readable volume;
  // alpha actor cards stay thinner so they remain presentation planes.
  const halfDepth = horizontal && !alpha ? 0.08 : 0.02;
  const positions = horizontal
    ? padded(floats([
      -halfWidth, halfDepth, -halfHeight, halfWidth, halfDepth, -halfHeight,
      halfWidth, halfDepth, halfHeight, -halfWidth, halfDepth, halfHeight,
      -halfWidth, -halfDepth, -halfHeight, halfWidth, -halfDepth, -halfHeight,
      halfWidth, -halfDepth, halfHeight, -halfWidth, -halfDepth, halfHeight
    ]))
    : padded(floats([
      -halfWidth, -halfHeight, halfDepth, halfWidth, -halfHeight, halfDepth,
      halfWidth, halfHeight, halfDepth, -halfWidth, halfHeight, halfDepth,
      -halfWidth, -halfHeight, -halfDepth, halfWidth, -halfHeight, -halfDepth,
      halfWidth, halfHeight, -halfDepth, -halfWidth, halfHeight, -halfDepth
    ]));
  const uvs = padded(floats([0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]));
  const indices = padded(ushorts([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]));
  const image = padded(readFileSync(resolve(source)));
  const offsets = [0, positions.length, positions.length + uvs.length, positions.length + uvs.length + indices.length];
  const binary = Buffer.concat([positions, uvs, indices, image]);
  const min = horizontal ? [-halfWidth, -halfDepth, -halfHeight] : [-halfWidth, -halfHeight, -halfDepth];
  const max = horizontal ? [halfWidth, halfDepth, halfHeight] : [halfWidth, halfHeight, halfDepth];
  const material = {
    name: `${name}-unlit`,
    doubleSided: true,
    ...(alpha ? { alphaMode: "BLEND", alphaCutoff: 0.03 } : {}),
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1
    },
    extensions: { KHR_materials_unlit: {} }
  };
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D Neon Swarm deterministic review-art builder", extras: { source, prompt, license: "CC0-1.0", role } },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ name, nodes: [0] }],
    nodes: [{ name: `${name}-card`, mesh: 0 }],
    meshes: [{ name: `${name}-mesh`, primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [material],
    textures: [{ name: `${name}-texture`, sampler: 0, source: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ name: `${name}-image`, bufferView: 3, mimeType: "image/png" }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: 8, type: "VEC2", min: [0, 0], max: [1, 1] },
      { bufferView: 2, componentType: 5123, count: 12, type: "SCALAR", min: [0], max: [7] }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: uvs.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[2], byteLength: 24, target: 34963 },
      { buffer: 0, byteOffset: offsets[3], byteLength: image.length }
    ],
    buffers: [{ byteLength: binary.length }]
  };
  const json = padded(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
  const body = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
  body.write("glTF", 0, "ascii"); body.writeUInt32LE(2, 4); body.writeUInt32LE(body.length, 8);
  body.writeUInt32LE(json.length, 12); body.writeUInt32LE(0x4e4f534a, 16); json.copy(body, 20);
  const binaryHeader = 20 + json.length;
  body.writeUInt32LE(binary.length, binaryHeader); body.writeUInt32LE(0x004e4942, binaryHeader + 4); binary.copy(body, binaryHeader + 8);
  const target = resolve(output);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
  return { output: target, source: resolve(source), bytes: body.length };
}

const results = [
  buildCard({
    source: "apps/showcase-neon-swarm/assets/neon-rain-garden-arena.png",
    output: "apps/showcase-neon-swarm/generated/neonRainGardenArena.glb",
    name: "Neon Rain Garden Arena", prompt: "apps/showcase-neon-swarm/assets/neon-rain-garden-arena.prompt.md",
    role: "renderer-owned-non-primary-background", halfWidth: 16, halfHeight: 16 * 992 / 1586, horizontal: true
  }),
  buildCard({
    source: "apps/showcase-neon-swarm/assets/neon-rain-courier.png",
    output: "apps/showcase-neon-swarm/generated/neonRainCourier.glb",
    name: "Neon Rain Courier", prompt: "apps/showcase-neon-swarm/assets/neon-rain-courier.prompt.md",
    role: "renderer-owned-primary-character-presentation", halfWidth: (1303 / 1207) / 2, halfHeight: 0.5, horizontal: true, alpha: true
  }),
  buildCard({
    source: "apps/showcase-neon-swarm/assets/neon-crown-moth.png",
    output: "apps/showcase-neon-swarm/generated/neonCrownMoth.glb",
    name: "Neon Crown Moth", prompt: "apps/showcase-neon-swarm/assets/neon-crown-moth.prompt.md",
    role: "renderer-owned-live-elite-presentation", halfWidth: (1133 / 974) / 2, halfHeight: 0.5, horizontal: true, alpha: true
  })
];

console.log(JSON.stringify(results, null, 2));
