import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

interface ProductMaterial {
  readonly name: string;
  readonly baseColor: readonly [number, number, number, number];
  readonly metallic: number;
  readonly roughness: number;
  readonly normalScale?: number;
  readonly emissive?: readonly [number, number, number];
  readonly alphaMode?: "OPAQUE" | "BLEND";
  readonly textureSet: string;
}

interface ProductPart {
  readonly name: string;
  readonly shape: "box" | "cylinder" | "disc" | "sphere";
  readonly material: string;
  readonly translation: Vec3;
  readonly scale: Vec3;
  readonly rotation?: Quat;
  readonly segments?: number;
}

interface ProductDefinition {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly parts: readonly ProductPart[];
  readonly materials: readonly ProductMaterial[];
}

interface MeshData {
  readonly positions: Vec3[];
  readonly normals: Vec3[];
  readonly uvs: Vec2[];
  readonly indices: number[];
}

interface BufferViewRef {
  readonly buffer: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly target?: number;
}

interface AccessorRef {
  readonly bufferView: number;
  readonly componentType: 5123 | 5126;
  readonly count: number;
  readonly type: "SCALAR" | "VEC2" | "VEC3";
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

const ROOT = process.cwd();
const OUT_ROOT = join(ROOT, "fixtures", "product-studio", "products");

const VALID_RGBA_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const PNG_TEXTURES: Record<string, string> = {
  graphite: VALID_RGBA_PNG,
  rubber: VALID_RGBA_PNG,
  metal: VALID_RGBA_PNG,
  glass: VALID_RGBA_PNG,
  screen: VALID_RGBA_PNG,
  grille: VALID_RGBA_PNG,
  satin: VALID_RGBA_PNG,
  dial: VALID_RGBA_PNG,
  strap: VALID_RGBA_PNG,
  face: VALID_RGBA_PNG,
  normal: VALID_RGBA_PNG,
  rough: VALID_RGBA_PNG
};

const PRODUCTS: readonly ProductDefinition[] = [
  {
    id: "camera-kit",
    title: "Studio Camera Kit",
    category: "imaging",
    materials: [
      material("matte-black-body", [0.015, 0.016, 0.018, 1], 0.05, 0.78, "graphite"),
      material("rubber-grip", [0.02, 0.02, 0.019, 1], 0.0, 0.92, "rubber", 0.75),
      material("brushed-metal-dials", [0.74, 0.72, 0.66, 1], 1.0, 0.28, "metal", 0.4),
      material("transparent-lens-glass", [0.5, 0.75, 0.92, 0.36], 0.0, 0.04, "glass", 0.15, undefined, "BLEND"),
      material("emissive-rear-screen", [0.04, 0.08, 0.1, 1], 0.0, 0.22, "screen", 0.2, [0.08, 0.38, 0.7])
    ],
    parts: [
      box("body", "matte-black-body", [0, 0, 0], [2.7, 1.55, 0.82]),
      box("rubber-grip", "rubber-grip", [-1.15, -0.05, 0.38], [0.46, 1.24, 0.28]),
      cyl("lens-barrel", "matte-black-body", [0.42, 0, 0.82], [0.68, 0.68, 0.72], quatX(Math.PI / 2), 48),
      cyl("lens-glass", "transparent-lens-glass", [0.42, 0, 1.23], [0.56, 0.56, 0.08], quatX(Math.PI / 2), 48),
      cyl("top-dial-left", "brushed-metal-dials", [-0.78, 0.86, -0.08], [0.3, 0.3, 0.16], undefined, 36),
      cyl("top-dial-right", "brushed-metal-dials", [0.82, 0.86, -0.08], [0.3, 0.3, 0.16], undefined, 36),
      cyl("shutter-button", "brushed-metal-dials", [1.12, 0.99, 0.16], [0.18, 0.18, 0.08], undefined, 28),
      box("rear-screen", "emissive-rear-screen", [0.22, -0.05, -0.44], [1.25, 0.82, 0.06]),
      box("left-strap-lug", "brushed-metal-dials", [-1.52, 0.18, 0.05], [0.18, 0.42, 0.16]),
      box("right-strap-lug", "brushed-metal-dials", [1.52, 0.18, 0.05], [0.18, 0.42, 0.16]),
      box("tripod-plate", "brushed-metal-dials", [0, -0.86, 0], [0.82, 0.12, 0.38])
    ]
  },
  {
    id: "speaker",
    title: "Bookshelf Speaker",
    category: "audio",
    materials: [
      material("satin-cabinet", [0.42, 0.25, 0.13, 1], 0.0, 0.44, "satin", 0.25),
      material("patterned-grille", [0.03, 0.035, 0.038, 1], 0.2, 0.66, "grille", 0.6),
      material("rubber-cone", [0.015, 0.014, 0.014, 1], 0.0, 0.9, "rubber", 0.55),
      material("metallic-knobs", [0.82, 0.78, 0.68, 1], 1.0, 0.22, "metal", 0.35)
    ],
    parts: [
      box("cabinet", "satin-cabinet", [0, 0, 0], [1.85, 2.85, 1.02]),
      box("front-grille", "patterned-grille", [0, 0.12, 0.55], [1.52, 2.32, 0.08]),
      cyl("woofer-cone", "rubber-cone", [0, -0.36, 0.66], [0.62, 0.62, 0.12], quatX(Math.PI / 2), 64),
      cyl("tweeter", "metallic-knobs", [0, 0.74, 0.68], [0.28, 0.28, 0.08], quatX(Math.PI / 2), 48),
      cyl("left-knob", "metallic-knobs", [-0.47, 1.2, 0.68], [0.12, 0.12, 0.08], quatX(Math.PI / 2), 32),
      cyl("right-knob", "metallic-knobs", [0.47, 1.2, 0.68], [0.12, 0.12, 0.08], quatX(Math.PI / 2), 32),
      cyl("rear-port", "rubber-cone", [0, -0.22, -0.58], [0.34, 0.34, 0.1], quatX(Math.PI / 2), 48),
      box("front-left-rubber-foot", "rubber-cone", [-0.62, -1.52, 0.28], [0.34, 0.12, 0.28]),
      box("front-right-rubber-foot", "rubber-cone", [0.62, -1.52, 0.28], [0.34, 0.12, 0.28]),
      box("rear-left-rubber-foot", "rubber-cone", [-0.62, -1.52, -0.28], [0.34, 0.12, 0.28]),
      box("rear-right-rubber-foot", "rubber-cone", [0.62, -1.52, -0.28], [0.34, 0.12, 0.28])
    ]
  },
  {
    id: "watch",
    title: "Chronograph Watch",
    category: "wearable",
    materials: [
      material("polished-metal-case", [0.84, 0.82, 0.76, 1], 1.0, 0.16, "metal", 0.25),
      material("glass-crystal", [0.72, 0.9, 1.0, 0.35], 0.0, 0.03, "glass", 0.1, undefined, "BLEND"),
      material("matte-face", [0.012, 0.014, 0.018, 1], 0.0, 0.72, "face"),
      material("bright-tick-markers", [0.92, 0.84, 0.5, 1], 1.0, 0.24, "dial", 0.2, [0.18, 0.14, 0.04]),
      material("strap-material", [0.08, 0.05, 0.035, 1], 0.0, 0.86, "strap", 0.6)
    ],
    parts: [
      cyl("case", "polished-metal-case", [0, 0, 0], [0.9, 0.9, 0.22], quatX(Math.PI / 2), 64),
      cyl("bezel", "polished-metal-case", [0, 0, 0.17], [0.98, 0.98, 0.08], quatX(Math.PI / 2), 64),
      cyl("crystal", "glass-crystal", [0, 0, 0.24], [0.8, 0.8, 0.04], quatX(Math.PI / 2), 64),
      cyl("face", "matte-face", [0, 0, 0.22], [0.72, 0.72, 0.03], quatX(Math.PI / 2), 64),
      box("hour-hand", "bright-tick-markers", [-0.1, 0.1, 0.28], [0.09, 0.42, 0.025], quatZ(-0.58)),
      box("minute-hand", "bright-tick-markers", [0.13, 0.04, 0.29], [0.06, 0.62, 0.025], quatZ(0.36)),
      ...tickMarkers(),
      cyl("crown", "polished-metal-case", [1.08, 0, 0.05], [0.16, 0.16, 0.24], quatZ(Math.PI / 2), 32),
      box("upper-strap", "strap-material", [0, 1.28, -0.02], [0.62, 1.7, 0.18]),
      box("lower-strap", "strap-material", [0, -1.28, -0.02], [0.62, 1.7, 0.18])
    ]
  }
];

async function main(): Promise<void> {
  for (const product of PRODUCTS) {
    const directory = join(OUT_ROOT, product.id);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${product.id}.gltf`), JSON.stringify(createGLTF(product), null, 2));
    await writeFile(join(directory, "manifest.json"), JSON.stringify(createManifest(product), null, 2));
  }
}

function createGLTF(product: ProductDefinition): Record<string, unknown> {
  const buffers: Uint8Array[] = [];
  const bufferViews: BufferViewRef[] = [];
  const accessors: AccessorRef[] = [];
  const meshes: unknown[] = [];
  const nodes: unknown[] = [];
  const materialIndex = new Map(product.materials.map((entry, index) => [entry.name, index]));

  product.parts.forEach((part, index) => {
    const mesh = meshForPart(part);
    const position = addFloatAccessor(buffers, bufferViews, accessors, mesh.positions.flat(), "VEC3", 34962, minVec(mesh.positions), maxVec(mesh.positions));
    const normal = addFloatAccessor(buffers, bufferViews, accessors, mesh.normals.flat(), "VEC3", 34962);
    const uv = addFloatAccessor(buffers, bufferViews, accessors, mesh.uvs.flat(), "VEC2", 34962);
    const indices = addIndexAccessor(buffers, bufferViews, accessors, mesh.indices);
    meshes.push({
      name: part.name,
      primitives: [{
        attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: uv },
        indices,
        material: materialIndex.get(part.material) ?? 0
      }]
    });
    nodes.push({
      name: part.name,
      mesh: index,
      translation: part.translation,
      scale: part.scale,
      ...(part.rotation ? { rotation: part.rotation } : {})
    });
  });

  const buffer = concat(buffers);
  const images = product.materials.flatMap((entry) => textureImages(entry));
  const textures = images.map((image, index) => ({ name: image.name, source: index, sampler: 0 }));

  return {
    asset: { version: "2.0", generator: "A3D Product studio product generator" },
    scene: 0,
    scenes: [{ name: `${product.id}-scene`, nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images,
    textures,
    materials: product.materials.map((entry, materialSlot) => ({
      name: entry.name,
      pbrMetallicRoughness: {
        baseColorFactor: entry.baseColor,
        metallicFactor: entry.metallic,
        roughnessFactor: entry.roughness,
        baseColorTexture: { index: materialSlot * 4 },
        metallicRoughnessTexture: { index: materialSlot * 4 + 1 }
      },
      normalTexture: { index: materialSlot * 4 + 2, scale: entry.normalScale ?? 0.35 },
      emissiveTexture: { index: materialSlot * 4 + 3 },
      emissiveFactor: entry.emissive ?? [0, 0, 0],
      alphaMode: entry.alphaMode ?? "OPAQUE",
      doubleSided: true
    })),
    buffers: [{ byteLength: buffer.byteLength, uri: `data:application/octet-stream;base64,${Buffer.from(buffer).toString("base64")}` }],
    bufferViews,
    accessors
  };
}

function createManifest(product: ProductDefinition): Record<string, unknown> {
  return {
    schema: "a3d-product-studio-product-manifest",
    id: product.id,
    title: product.title,
    category: product.category,
    gltf: `${product.id}.gltf`,
    rejectedInputs: [
      "tests/reports/legacy-product-viewer/product-viewer.png",
      "tests/reports/legacy-material-studio/material-studio.png",
      "tests/reports/legacy-asset-viewer/asset-viewer.png",
      "tests/reports/legacy-rendering-showcase/rendering-showcase.png"
    ],
    parts: product.parts.map((entry) => ({
      name: entry.name,
      shape: entry.shape,
      material: entry.material
    })),
    materials: product.materials.map((entry) => ({
      name: entry.name,
      metallic: entry.metallic,
      roughness: entry.roughness,
      alphaMode: entry.alphaMode ?? "OPAQUE",
      textureSet: entry.textureSet
    })),
    requirements: {
      namedNodes: true,
      namedMeshes: true,
      materialTextureSlots: ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "emissiveTexture"],
      generatedFor: "A3D Product Studio Legacy"
    }
  };
}

function textureImages(materialDef: ProductMaterial): readonly Record<string, unknown>[] {
  const keys = [materialDef.textureSet, "rough", "normal", materialDef.emissive ? "screen" : materialDef.textureSet];
  return keys.map((key, index) => ({
    name: `${materialDef.name}-${["base-color", "metallic-roughness", "normal", "emissive"][index]}`,
    mimeType: "image/png",
    uri: `data:image/png;base64,${PNG_TEXTURES[key] ?? PNG_TEXTURES.graphite}`
  }));
}

function addFloatAccessor(
  chunks: Uint8Array[],
  bufferViews: BufferViewRef[],
  accessors: AccessorRef[],
  values: readonly number[],
  type: "VEC2" | "VEC3",
  target: number,
  min?: readonly number[],
  max?: readonly number[]
): number {
  const bytes = new Uint8Array(new Float32Array(values).buffer);
  const bufferView = addBufferView(chunks, bufferViews, bytes, target);
  const accessor = accessors.length;
  accessors.push({ bufferView, componentType: 5126, count: values.length / (type === "VEC3" ? 3 : 2), type, ...(min ? { min } : {}), ...(max ? { max } : {}) });
  return accessor;
}

function addIndexAccessor(chunks: Uint8Array[], bufferViews: BufferViewRef[], accessors: AccessorRef[], values: readonly number[]): number {
  const bytes = new Uint8Array(new Uint16Array(values).buffer);
  const bufferView = addBufferView(chunks, bufferViews, bytes, 34963);
  const accessor = accessors.length;
  accessors.push({ bufferView, componentType: 5123, count: values.length, type: "SCALAR", min: [0], max: [Math.max(...values)] });
  return accessor;
}

function addBufferView(chunks: Uint8Array[], bufferViews: BufferViewRef[], bytes: Uint8Array, target: number): number {
  const offset = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const padding = (4 - (offset % 4)) % 4;
  if (padding) chunks.push(new Uint8Array(padding));
  const byteOffset = offset + padding;
  const index = bufferViews.length;
  chunks.push(bytes);
  bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength, target });
  return index;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function meshForPart(part: ProductPart): MeshData {
  switch (part.shape) {
    case "box":
      return boxMesh();
    case "sphere":
      return sphereMesh(part.segments ?? 32);
    case "disc":
    case "cylinder":
      return cylinderMesh(part.segments ?? 32);
  }
}

function boxMesh(): MeshData {
  const p = [
    [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [0, 0, 1]],
    [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0, 0, -1]],
    [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [1, 0, 0]],
    [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-1, 0, 0]],
    [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [0, 1, 0]],
    [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0, -1, 0]]
  ] as const;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const faceUv: readonly Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  p.forEach((face, faceIndex) => {
    const offset = faceIndex * 4;
    positions.push(face[0] as Vec3, face[1] as Vec3, face[2] as Vec3, face[3] as Vec3);
    normals.push(face[4] as Vec3, face[4] as Vec3, face[4] as Vec3, face[4] as Vec3);
    uvs.push(...faceUv);
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  });
  return { positions, normals, uvs, indices };
}

function cylinderMesh(segments: number): MeshData {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const a = u * Math.PI * 2;
    const x = Math.cos(a) * 0.5;
    const z = Math.sin(a) * 0.5;
    positions.push([x, -0.5, z], [x, 0.5, z]);
    normals.push([Math.cos(a), 0, Math.sin(a)], [Math.cos(a), 0, Math.sin(a)]);
    uvs.push([u, 0], [u, 1]);
  }
  for (let i = 0; i < segments; i += 1) {
    const o = i * 2;
    indices.push(o, o + 3, o + 2, o, o + 1, o + 3);
  }
  const topCenter = positions.length;
  positions.push([0, 0.5, 0]);
  normals.push([0, 1, 0]);
  uvs.push([0.5, 0.5]);
  const bottomCenter = positions.length;
  positions.push([0, -0.5, 0]);
  normals.push([0, -1, 0]);
  uvs.push([0.5, 0.5]);
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2 + 1;
    const b = ((i + 1) % segments) * 2 + 1;
    indices.push(topCenter, a, b);
    indices.push(bottomCenter, b - 1, a - 1);
  }
  return { positions, normals, uvs, indices };
}

function sphereMesh(segments: number): MeshData {
  const rings = Math.max(8, Math.floor(segments / 2));
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rings; r += 1) {
    const v = r / rings;
    const theta = v * Math.PI;
    for (let s = 0; s <= segments; s += 1) {
      const u = s / segments;
      const phi = u * Math.PI * 2;
      const n: Vec3 = [Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
      positions.push([n[0] * 0.5, n[1] * 0.5, n[2] * 0.5]);
      normals.push(n);
      uvs.push([u, v]);
    }
  }
  const stride = segments + 1;
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const a = r * stride + s;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return { positions, normals, uvs, indices };
}

function material(
  name: string,
  baseColor: readonly [number, number, number, number],
  metallic: number,
  roughness: number,
  textureSet: string,
  normalScale?: number,
  emissive?: readonly [number, number, number],
  alphaMode?: "OPAQUE" | "BLEND"
): ProductMaterial {
  return { name, baseColor, metallic, roughness, textureSet, ...(normalScale !== undefined ? { normalScale } : {}), ...(emissive ? { emissive } : {}), ...(alphaMode ? { alphaMode } : {}) };
}

function box(name: string, materialName: string, translation: Vec3, scale: Vec3, rotation?: Quat): ProductPart {
  return { name, material: materialName, shape: "box", translation, scale, ...(rotation ? { rotation } : {}) };
}

function cyl(name: string, materialName: string, translation: Vec3, scale: Vec3, rotation?: Quat, segments?: number): ProductPart {
  return { name, material: materialName, shape: "cylinder", translation, scale, ...(rotation ? { rotation } : {}), ...(segments ? { segments } : {}) };
}

function tickMarkers(): ProductPart[] {
  return Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    return box(`tick-marker-${String(index + 1).padStart(2, "0")}`, "bright-tick-markers", [Math.sin(angle) * 0.58, Math.cos(angle) * 0.58, 0.3], [0.035, index % 3 === 0 ? 0.16 : 0.1, 0.025], quatZ(-angle));
  });
}

function quatX(radians: number): Quat {
  return [Math.sin(radians / 2), 0, 0, Math.cos(radians / 2)];
}

function quatZ(radians: number): Quat {
  return [0, 0, Math.sin(radians / 2), Math.cos(radians / 2)];
}

function minVec(values: readonly Vec3[]): Vec3 {
  return [
    Math.min(...values.map((value) => value[0])),
    Math.min(...values.map((value) => value[1])),
    Math.min(...values.map((value) => value[2]))
  ];
}

function maxVec(values: readonly Vec3[]): Vec3 {
  return [
    Math.max(...values.map((value) => value[0])),
    Math.max(...values.map((value) => value[1])),
    Math.max(...values.map((value) => value[2]))
  ];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
