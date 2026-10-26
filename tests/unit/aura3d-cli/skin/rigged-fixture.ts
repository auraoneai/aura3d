/** A small synthetic rigged humanoid-legs GLB (two tube legs, Hips + UpperLeg/LowerLeg/Foot chains, one Run clip) with switchable defects. */
export interface RiggedOptions {
  /** One triangle across the shins joining a left-leg vertex and a right-leg vertex (the thighs swing opposite ways and tear it). */
  readonly bridge?: boolean;
  /** Shift the left leg mesh forward so it is not inside its bones (modelled in another pose). */
  readonly offsetLeftLeg?: boolean;
  /** Vertex weights that do not sum to one. */
  readonly badWeightSum?: boolean;
  /** One long thin triangle sticking out of the left thigh. */
  readonly flap?: boolean;
  /** Bone names that do not look like a humanoid. */
  readonly rename?: boolean;
  /** Leave the animation out. */
  readonly noClip?: boolean;
}

const RINGS = [1.0, 0.75, 0.5, 0.25, 0.0];
const SEG = 14;

export function buildRiggedGlb(options: RiggedOptions = {}): Buffer {
  const names = options.rename
    ? ["root", "bA", "bB", "bC", "bD", "bE", "bF"]
    : ["Hips", "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot"];
  // nodes: 0 hips (0,1,0); 1..3 left chain; 4..6 right chain; 7 mesh node
  const nodes: Record<string, unknown>[] = [
    { name: names[0], translation: [0, 1, 0], children: [1, 4] },
    { name: names[1], translation: [0.1, 0, 0], children: [2] },
    { name: names[2], translation: [0, -0.5, 0], children: [3] },
    { name: names[3], translation: [0, -0.5, 0] },
    { name: names[4], translation: [-0.1, 0, 0], children: [5] },
    { name: names[5], translation: [0, -0.5, 0], children: [6] },
    { name: names[6], translation: [0, -0.5, 0] },
    { name: "Body", mesh: 0, skin: 0 }
  ];
  const jointNodes = [0, 1, 2, 3, 4, 5, 6];
  const bindPos = [[0, 1, 0], [0.1, 1, 0], [0.1, 0.5, 0], [0.1, 0, 0], [-0.1, 1, 0], [-0.1, 0.5, 0], [-0.1, 0, 0]];
  const ibm: number[] = [];
  for (const p of bindPos) ibm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(p[0] as number), -(p[1] as number), -(p[2] as number), 1);

  const positions: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  const indices: number[] = [];
  const addLeg = (side: 0 | 1): void => {
    const cx = side === 0 ? 0.1 : -0.1;
    const up = side === 0 ? 1 : 4;
    const low = up + 1;
    const foot = up + 2;
    const base = positions.length / 3;
    RINGS.forEach((y, ri) => {
      for (let k = 0; k < SEG; k += 1) {
        const a = (k / SEG) * Math.PI * 2;
        const zOff = options.offsetLeftLeg && side === 0 ? 0.3 : 0;
        positions.push(cx + Math.cos(a) * 0.06, y, Math.sin(a) * 0.06 + zOff);
        // weights by ring: y>=0.75 upper leg, 0.5 half/half with lower, 0.25 lower, 0 foot
        let pair: [number, number][];
        if (y >= 0.75) pair = [[up, 1]];
        else if (y === 0.5) pair = [[up, 0.5], [low, 0.5]];
        else if (y === 0.25) pair = [[low, 1]];
        else pair = [[foot, 1]];
        const w = options.badWeightSum && side === 0 && ri === 2 ? 0.5 : 1;
        joints.push(pair[0]![0], pair[1]?.[0] ?? 0, 0, 0);
        weights.push(pair[0]![1] * w, (pair[1]?.[1] ?? 0) * w, 0, 0);
      }
    });
    for (let ri = 0; ri < RINGS.length - 1; ri += 1) for (let k = 0; k < SEG; k += 1) {
      const a = base + ri * SEG + k, b = base + ri * SEG + ((k + 1) % SEG), c = base + (ri + 1) * SEG + k, d = base + (ri + 1) * SEG + ((k + 1) % SEG);
      indices.push(a, b, c, b, d, c);
    }
  };
  addLeg(0);
  addLeg(1);
  const leftBase = 0;
  const rightBase = RINGS.length * SEG;
  if (options.bridge) {
    // shin ring (index 3, y = 0.25) of each leg: left vertex 0 to the opposite right vertex to left vertex 1; the thighs swing opposite ways
    indices.push(leftBase + 3 * SEG + 0, rightBase + 3 * SEG + SEG / 2, leftBase + 3 * SEG + 1);
  }
  if (options.flap) {
    // an extra vertex 0.6 m out from the left thigh, joined to two neighbouring thigh vertices (long, thin)
    const v = positions.length / 3;
    positions.push(0.1, 0.9, 0.7);
    joints.push(1, 0, 0, 0);
    weights.push(1, 0, 0, 0);
    indices.push(leftBase + 1 * SEG + 0, leftBase + 1 * SEG + 1, v);
  }

  // animation: Run swings the thighs (left +40 deg, right -40 deg about X) over one second
  const rot = (deg: number): number[] => [Math.sin((deg * Math.PI) / 360), 0, 0, Math.cos((deg * Math.PI) / 360)];
  const times = [0, 0.5, 1];
  const left = [...rot(0), ...rot(40), ...rot(0)];
  const right = [...rot(0), ...rot(-40), ...rot(0)];

  const chunks: Buffer[] = [];
  const views: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const push = (data: ArrayLike<number>, componentType: number, type: string, target?: number, extra: Record<string, unknown> = {}): number => {
    const size = componentType === 5126 ? 4 : componentType === 5123 ? 2 : 4;
    const buf = Buffer.alloc(data.length * size);
    for (let i = 0; i < data.length; i += 1) {
      if (componentType === 5126) buf.writeFloatLE(data[i] as number, i * 4);
      else if (componentType === 5123) buf.writeUInt16LE(data[i] as number, i * 2);
      else buf.writeUInt32LE(data[i] as number, i * 4);
    }
    const pad = (4 - (chunks.reduce((n, c) => n + c.length, 0) % 4)) % 4;
    if (pad) chunks.push(Buffer.alloc(pad));
    const offset = chunks.reduce((n, c) => n + c.length, 0);
    chunks.push(buf);
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) });
    const comps = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type] as number;
    accessors.push({ bufferView: views.length - 1, componentType, count: data.length / comps, type, ...extra });
    return accessors.length - 1;
  };
  const accPos = push(positions, 5126, "VEC3", 34962, { min: [-1, 0, -1], max: [1, 1, 1] });
  const accJoints = push(joints, 5123, "VEC4", 34962);
  const accWeights = push(weights, 5126, "VEC4", 34962);
  const accIdx = push(indices, 5125, "SCALAR", 34963);
  const accIbm = push(ibm, 5126, "MAT4");
  const accTime = push(times, 5126, "SCALAR", undefined, { min: [0], max: [1] });
  const accLeft = push(left, 5126, "VEC4");
  const accRight = push(right, 5126, "VEC4");
  const animations = options.noClip ? [] : [{
    name: "Run",
    samplers: [{ input: accTime, output: accLeft, interpolation: "LINEAR" }, { input: accTime, output: accRight, interpolation: "LINEAR" }],
    channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }, { sampler: 1, target: { node: 4, path: "rotation" } }]
  }];
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: "2.0", generator: "aura3d-skin-test" },
    scene: 0,
    scenes: [{ nodes: [0, 7] }],
    nodes,
    skins: [{ joints: jointNodes, inverseBindMatrices: accIbm, skeleton: 0 }],
    meshes: [{ name: "Body", primitives: [{ attributes: { POSITION: accPos, JOINTS_0: accJoints, WEIGHTS_0: accWeights }, indices: accIdx, material: 0 }] }],
    materials: [{ name: "kit-skin" }],
    animations,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: bin.length }]
  };
  return packGlb(json, bin);
}

export function buildStaticGlb(): Buffer {
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const bin = Buffer.alloc(positions.length * 4);
  positions.forEach((v, i) => bin.writeFloatLE(v, i * 4));
  return packGlb({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Tri", mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length, target: 34962 }], buffers: [{ byteLength: bin.length }]
  }, bin);
}

function packGlb(json: unknown, bin: Buffer): Buffer {
  let js = Buffer.from(JSON.stringify(json), "utf8");
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const b = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + b.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, b]);
}
