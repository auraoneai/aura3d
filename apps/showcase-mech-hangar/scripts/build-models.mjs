/**
 * Mech Hangar modular model synth.
 *
 * Generates the sixteen original CC0 GLBs used by the route. These are authored
 * as parts of one family, in metres, around stable part-local origins. They are
 * not whole robots harvested from a catalog and resized until they overlap.
 *
 * Compatibility envelope:
 *   chassis: centered torso; 0.82-1.18m wide, 0.78-0.92m high
 *   arms:    paired shoulder-to-hand module centered on the chest socket
 *   legs:    paired hip-to-foot module centered vertically on the hips socket
 *   weapon:  right-hand module, barrel/working end points toward local +Z
 *
 * Run from the repository root:
 *   node apps/showcase-mech-hangar/scripts/build-models.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/models");
const SEGMENTS = 8;

const COLORS = {
  armor: [0.19, 0.28, 0.36, 1],
  armorLight: [0.35, 0.48, 0.57, 1],
  dark: [0.055, 0.075, 0.095, 1],
  joint: [0.12, 0.14, 0.16, 1],
  cyan: [0.12, 0.9, 0.94, 1],
  amber: [1, 0.48, 0.08, 1],
  red: [0.92, 0.13, 0.18, 1],
  lime: [0.55, 0.95, 0.24, 1]
};

function mesh(name, color, roughness = 0.55, metallic = 0.25) {
  return { name, color, roughness, metallic, positions: [], normals: [], indices: [], nextVertex: 0 };
}

function triangle(p, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  for (const point of [a, b, c]) {
    p.positions.push(...point);
    p.normals.push(nx, ny, nz);
  }
  p.indices.push(p.nextVertex, p.nextVertex + 1, p.nextVertex + 2);
  p.nextVertex += 3;
}

function quad(p, a, b, c, d) {
  triangle(p, a, b, c);
  triangle(p, a, c, d);
}

function box(p, cx, cy, cz, hx, hy, hz) {
  const v = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
    [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]
  ];
  quad(p, v[0], v[3], v[2], v[1]); quad(p, v[4], v[5], v[6], v[7]);
  quad(p, v[1], v[2], v[6], v[5]); quad(p, v[3], v[0], v[4], v[7]);
  quad(p, v[0], v[1], v[5], v[4]); quad(p, v[2], v[3], v[7], v[6]);
}

function taperedBox(p, cx, cy, cz, bottomX, bottomZ, topX, topZ, height) {
  const y0 = cy - height / 2, y1 = cy + height / 2;
  const lower = [[-bottomX, -bottomZ], [bottomX, -bottomZ], [bottomX, bottomZ], [-bottomX, bottomZ]]
    .map(([x, z]) => [cx + x, y0, cz + z]);
  const upper = [[-topX, -topZ], [topX, -topZ], [topX, topZ], [-topX, topZ]]
    .map(([x, z]) => [cx + x, y1, cz + z]);
  quad(p, lower[0], lower[3], lower[2], lower[1]);
  quad(p, upper[0], upper[1], upper[2], upper[3]);
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    quad(p, lower[i], lower[j], upper[j], upper[i]);
  }
}

function ring(axis, coordinate, radius, centerA = 0, centerB = 0) {
  return Array.from({ length: SEGMENTS }, (_, index) => {
    const angle = index / SEGMENTS * Math.PI * 2;
    const a = centerA + Math.cos(angle) * radius;
    const b = centerB + Math.sin(angle) * radius;
    return axis === "x" ? [coordinate, a, b] : axis === "y" ? [a, coordinate, b] : [a, b, coordinate];
  });
}

function cylinder(p, axis, center, length, radius, centerA = 0, centerB = 0, radius2 = radius) {
  const lo = center - length / 2, hi = center + length / 2;
  const a = ring(axis, lo, radius, centerA, centerB);
  const b = ring(axis, hi, radius2, centerA, centerB);
  for (let i = 0; i < SEGMENTS; i += 1) {
    const j = (i + 1) % SEGMENTS;
    quad(p, a[i], a[j], b[j], b[i]);
  }
  const c0 = axis === "x" ? [lo, centerA, centerB] : axis === "y" ? [centerA, lo, centerB] : [centerA, centerB, lo];
  const c1 = axis === "x" ? [hi, centerA, centerB] : axis === "y" ? [centerA, hi, centerB] : [centerA, centerB, hi];
  for (let i = 0; i < SEGMENTS; i += 1) {
    const j = (i + 1) % SEGMENTS;
    triangle(p, c0, a[j], a[i]);
    triangle(p, c1, b[i], b[j]);
  }
}

function chassis(variant) {
  const armor = mesh("torso-armor", variant === 2 ? COLORS.armorLight : COLORS.armor, 0.42, 0.55);
  const frame = mesh("torso-frame", COLORS.dark, 0.7, 0.6);
  const glow = mesh("cockpit-and-reactor", [COLORS.cyan, COLORS.amber, COLORS.lime, COLORS.red][variant], 0.2, 0.15);
  if (variant === 0) {
    taperedBox(armor, 0, 0, 0, 0.52, 0.29, 0.39, 0.25, 0.84);
    box(armor, -0.57, 0.17, 0, 0.13, 0.17, 0.25); box(armor, 0.57, 0.17, 0, 0.13, 0.17, 0.25);
    box(glow, 0, 0.13, 0.285, 0.21, 0.16, 0.025);
  } else if (variant === 1) {
    box(armor, 0, -0.02, 0, 0.43, 0.43, 0.30);
    taperedBox(armor, 0, 0.25, 0.04, 0.55, 0.34, 0.37, 0.25, 0.32);
    box(frame, 0, -0.31, -0.03, 0.52, 0.09, 0.20);
    box(glow, 0, 0.14, 0.325, 0.28, 0.06, 0.025);
  } else if (variant === 2) {
    cylinder(armor, "y", 0, 0.82, 0.39);
    box(armor, -0.45, 0.05, 0, 0.16, 0.27, 0.24); box(armor, 0.45, 0.05, 0, 0.16, 0.27, 0.24);
    cylinder(glow, "z", 0.30, 0.06, 0.16, 0, 0.08);
  } else {
    taperedBox(armor, 0, 0, 0, 0.34, 0.24, 0.50, 0.32, 0.80);
    box(armor, -0.46, -0.19, -0.02, 0.19, 0.08, 0.25); box(armor, 0.46, -0.19, -0.02, 0.19, 0.08, 0.25);
    box(frame, -0.31, 0.38, -0.12, 0.045, 0.12, 0.16); box(frame, 0.31, 0.38, -0.12, 0.045, 0.12, 0.16);
    taperedBox(glow, 0, 0.14, 0.30, 0.20, 0.025, 0.10, 0.025, 0.32);
  }
  box(frame, 0, -0.38, 0, 0.22, 0.07, 0.20);
  return [armor, frame, glow];
}

function arms(variant) {
  const armor = mesh("arm-armor", variant === 1 ? COLORS.armorLight : COLORS.armor, 0.46, 0.48);
  const joint = mesh("arm-joints", COLORS.joint, 0.66, 0.68);
  const accent = mesh("arm-identity", [COLORS.cyan, COLORS.amber, COLORS.lime, COLORS.red][variant], 0.25, 0.2);
  for (const side of [-1, 1]) {
    const sx = side;
    cylinder(joint, "x", sx * 0.49, 0.18, 0.13, 0, 0);
    if (variant === 0) {
      box(armor, sx * 0.67, 0.02, 0, 0.12, 0.23, 0.17);
      box(armor, sx * 0.86, -0.12, 0.02, 0.10, 0.19, 0.14);
      box(accent, sx * 0.68, 0.22, 0.18, 0.08, 0.025, 0.03);
    } else if (variant === 1) {
      box(armor, sx * 0.67, 0.03, 0, 0.17, 0.26, 0.20);
      taperedBox(armor, sx * 0.91, -0.11, 0, 0.14, 0.18, 0.10, 0.13, 0.38);
      box(accent, sx * 0.66, 0.08, 0.215, 0.11, 0.12, 0.025);
    } else if (variant === 2) {
      cylinder(armor, "y", 0.02, 0.46, 0.18, sx * 0.67, 0);
      box(armor, sx * 0.92, -0.12, 0, 0.13, 0.18, 0.13);
      cylinder(accent, "z", 0.155, 0.05, 0.11, sx * 0.67, 0.08);
    } else {
      box(armor, sx * 0.65, 0.05, 0, 0.095, 0.20, 0.12);
      box(armor, sx * 0.86, -0.12, 0, 0.075, 0.18, 0.10);
      for (let finger = -1; finger <= 1; finger += 1) box(accent, sx * (0.98 + finger * 0.015), -0.29, finger * 0.075, 0.045, 0.12, 0.025);
    }
  }
  return [armor, joint, accent];
}

function legs(variant) {
  const armor = mesh("leg-armor", variant === 2 ? COLORS.armorLight : COLORS.armor, 0.5, 0.48);
  const joint = mesh("leg-joints", COLORS.joint, 0.75, 0.55);
  const accent = mesh("leg-identity", [COLORS.cyan, COLORS.amber, COLORS.lime, COLORS.red][variant], 0.28, 0.15);
  for (const side of [-1, 1]) {
    const x = side * 0.27;
    cylinder(joint, "x", x, 0.22, 0.115, 0.13, 0);
    if (variant === 0) {
      taperedBox(armor, x, 0.10, 0, 0.13, 0.13, 0.10, 0.10, 0.38);
      taperedBox(armor, x, -0.22, 0.02, 0.10, 0.10, 0.135, 0.14, 0.28);
      box(armor, x, -0.37, 0.09, 0.17, 0.06, 0.24);
      box(accent, x, 0.20, 0.135, 0.075, 0.08, 0.025);
    } else if (variant === 1) {
      box(armor, x, 0.02, 0, 0.18, 0.27, 0.18);
      box(joint, x, -0.27, 0.02, 0.22, 0.12, 0.23);
      box(accent, x, -0.27, 0.255, 0.16, 0.055, 0.025);
    } else if (variant === 2) {
      cylinder(armor, "y", 0, 0.54, 0.16, x, 0);
      box(armor, x, -0.32, 0.06, 0.19, 0.08, 0.22);
      box(accent, x, 0.17, 0.17, 0.10, 0.12, 0.025);
    } else {
      for (let segment = 0; segment < 3; segment += 1) {
        const y = 0.20 - segment * 0.23;
        box(armor, x + (segment % 2 === 0 ? -side * 0.035 : side * 0.035), y, 0, 0.10, 0.12, 0.105);
      }
      box(armor, x, -0.38, 0.11, 0.14, 0.05, 0.25);
      cylinder(accent, "x", x, 0.10, 0.075, -0.03, 0.15);
    }
  }
  return [armor, joint, accent];
}

function weapon(variant) {
  const body = mesh("weapon-body", variant === 2 ? COLORS.armorLight : COLORS.armor, 0.4, 0.62);
  const dark = mesh("weapon-mechanism", COLORS.dark, 0.62, 0.72);
  const energy = mesh("weapon-energy", [COLORS.cyan, COLORS.amber, COLORS.lime, COLORS.red][variant], 0.16, 0.12);
  if (variant === 0) {
    box(body, 0, 0, 0.05, 0.14, 0.16, 0.34);
    for (const x of [-0.075, 0.075]) cylinder(dark, "z", 0.48, 0.60, 0.045, x, 0.03);
    box(energy, 0, 0.17, 0.10, 0.08, 0.025, 0.18);
  } else if (variant === 1) {
    cylinder(body, "z", 0.08, 0.68, 0.16, 0, 0);
    cylinder(dark, "z", 0.52, 0.28, 0.09, 0, 0);
    cylinder(energy, "z", 0.18, 0.32, 0.07, 0, 0);
  } else if (variant === 2) {
    box(body, 0, 0, 0.10, 0.095, 0.10, 0.40);
    cylinder(energy, "z", 0.52, 0.74, 0.045, 0, 0);
    box(dark, 0, -0.16, -0.02, 0.05, 0.15, 0.10);
    box(body, 0, 0.12, -0.18, 0.24, 0.035, 0.16);
  } else {
    cylinder(dark, "y", -0.05, 0.62, 0.065, 0, -0.12);
    box(body, 0, 0.18, 0.20, 0.32, 0.12, 0.12);
    taperedBox(body, 0, 0.18, 0.39, 0.31, 0.11, 0.17, 0.08, 0.26);
    box(energy, 0, 0.18, 0.53, 0.18, 0.04, 0.025);
  }
  return [body, dark, energy];
}

function writeGlb(path, parts, metadata) {
  const chunks = [], bufferViews = [], accessors = [], meshes = [], nodes = [];
  let offset = 0;
  const materials = parts.map((entry) => ({
    name: entry.name + "-material",
    pbrMetallicRoughness: {
      baseColorFactor: entry.color,
      metallicFactor: entry.metallic,
      roughnessFactor: entry.roughness
    },
    ...(entry.name.includes("identity") || entry.name.includes("energy") || entry.name.includes("reactor")
      ? { emissiveFactor: entry.color.slice(0, 3).map((value) => value * 0.55) }
      : {})
  }));
  const pushView = (array, target) => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const padding = (4 - bytes.length % 4) % 4;
    chunks.push(bytes, ...(padding ? [Buffer.alloc(padding)] : []));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    offset += bytes.length + padding;
    return bufferViews.length - 1;
  };
  for (const [partIndex, entry] of parts.entries()) {
    if (entry.positions.length === 0) continue;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < entry.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], entry.positions[i + axis]);
        max[axis] = Math.max(max[axis], entry.positions[i + axis]);
      }
    }
    const posView = pushView(new Float32Array(entry.positions), 34962);
    const normView = pushView(new Float32Array(entry.normals), 34962);
    const idxView = pushView(new Uint32Array(entry.indices), 34963);
    const base = accessors.length;
    accessors.push(
      { bufferView: posView, componentType: 5126, count: entry.positions.length / 3, type: "VEC3", min, max },
      { bufferView: normView, componentType: 5126, count: entry.normals.length / 3, type: "VEC3" },
      { bufferView: idxView, componentType: 5125, count: entry.indices.length, type: "SCALAR" }
    );
    meshes.push({ name: entry.name, primitives: [{ attributes: { POSITION: base, NORMAL: base + 1 }, indices: base + 2, material: partIndex }] });
    nodes.push({ name: entry.name, mesh: meshes.length - 1 });
  }
  const body = Buffer.concat(chunks);
  const document = {
    asset: {
      version: "2.0",
      generator: "Aura3D Mech Hangar modular family synth (original CC0)",
      extras: { aura3d: { orientation: { forwardAxis: "+Z", upAxis: "+Y" } } }
    },
    extras: { aura3dMechPart: metadata },
    scene: 0,
    scenes: [{ name: "part-root", nodes: nodes.map((_, index) => index) }],
    nodes, meshes, materials, accessors, bufferViews, buffers: [{ byteLength: body.length }]
  };
  const source = Buffer.from(JSON.stringify(document));
  const json = Buffer.concat([source, Buffer.alloc((4 - source.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat([body, Buffer.alloc((4 - body.length % 4) % 4)]);
  const output = Buffer.alloc(12 + 8 + json.length + 8 + bin.length);
  output.write("glTF", 0, "ascii"); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12); output.writeUInt32LE(0x4e4f534a, 16); json.copy(output, 20);
  const binHead = 20 + json.length;
  output.writeUInt32LE(bin.length, binHead); output.writeUInt32LE(0x004e4942, binHead + 4); bin.copy(output, binHead + 8);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, output);
  return output.length;
}

const definitions = [
  { slot: "chassis", socket: "root", build: chassis },
  { slot: "arms", socket: "chest", build: arms },
  { slot: "legs", socket: "hips", build: legs },
  { slot: "weapon", socket: "right-hand", build: weapon }
];

mkdirSync(OUT_DIR, { recursive: true });
for (const definition of definitions) {
  for (let variant = 0; variant < 4; variant += 1) {
    const letter = String.fromCharCode(65 + variant);
    const id = "mech" + definition.slot[0].toUpperCase() + definition.slot.slice(1) + letter;
    const bytes = writeGlb(resolve(OUT_DIR, id + ".glb"), definition.build(variant), {
      schema: "aura3d.mech-hangar.modular-part/1.0",
      family: "MH-2M",
      id,
      slot: definition.slot,
      variant: letter,
      unitMeters: 1,
      origin: "part-center",
      compatibleSocket: definition.socket,
      forwardAxis: "+Z",
      upAxis: "+Y"
    });
    console.log("wrote", id + ".glb", bytes, "bytes");
  }
}
