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
// Four-sided bevelled joints keep the family recognisably faceted while staying
// below the 40 KB per-part release budget enforced by the curation gate.  The
// chamfered armour carries the silhouette; these low-sided joints are an
// intentional industrial design choice, not a placeholder primitive subject.
const SEGMENTS = 4;

// The first MH-2M pass was technically modular but visually read as four
// unrelated boxes.  This pass keeps the same metre-scale socket contract and
// authored CC0 provenance while giving every module a shared industrial design
// language: chamfered armour, dark mechanical joints, and one luminous identity
// material.  The geometry is deliberately low-poly and deterministic so the
// curation/probe scripts remain reproducible.
const COLORS = {
  armor: [0.12, 0.22, 0.31, 1],
  armorLight: [0.26, 0.40, 0.50, 1],
  trim: [0.055, 0.085, 0.12, 1],
  joint: [0.075, 0.095, 0.12, 1],
  cyan: [0.16, 0.87, 0.98, 1],
  amber: [1, 0.55, 0.16, 1],
  red: [1, 0.20, 0.32, 1],
  lime: [0.64, 0.96, 0.28, 1]
};

function mesh(name, color, roughness = 0.55, metallic = 0.25, emissive = false) {
  return { name, color, roughness, metallic, emissive, positions: [], normals: [], indices: [], nextVertex: 0 };
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
  // Keep one vertex per corner (rather than six duplicated triangle vertices).
  // The authored parts use broad faceted panels, so a single face normal is
  // exactly the desired hard-surface shading and materially reduces the GLB
  // payload without reducing silhouette detail.
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  const base = p.nextVertex;
  for (const point of [a, b, c, d]) {
    p.positions.push(...point);
    p.normals.push(nx, ny, nz);
  }
  p.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  p.nextVertex += 4;
}

function capFan(p, center, points, normal, reverse = false) {
  const base = p.nextVertex;
  p.positions.push(...center);
  p.normals.push(...normal);
  for (const point of points) {
    p.positions.push(...point);
    p.normals.push(...normal);
  }
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    p.indices.push(
      base,
      base + (reverse ? index + 1 : next + 1),
      base + (reverse ? next + 1 : index + 1)
    );
  }
  p.nextVertex += points.length + 1;
}

function scaleAxis(parts, axis, factor) {
  for (const part of parts) {
    for (let index = axis; index < part.positions.length; index += 3) part.positions[index] *= factor;
  }
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

/** A chamfered rectangular prism gives the armour a readable highlight break. */
function chamferedBox(p, cx, cy, cz, hx, hy, hz, bevel = 0.07, topScale = 1) {
  const bx = Math.min(bevel, hx * 0.72, hz * 0.72);
  const bz = Math.min(bevel, hx * 0.72, hz * 0.72);
  const ring = (y, sx, sz) => [
    [-sx + bx, y, -sz], [sx - bx, y, -sz], [sx, y, -sz + bz], [sx, y, sz - bz],
    [sx - bx, y, sz], [-sx + bx, y, sz], [-sx, y, sz - bz], [-sx, y, -sz + bz]
  ].map(([x, yy, z]) => [cx + x, yy, cz + z]);
  const lower = ring(cy - hy, hx, hz);
  const upper = ring(cy + hy, hx * topScale, hz * topScale);
  for (let index = 0; index < 8; index += 1) {
    const next = (index + 1) % 8;
    quad(p, lower[index], lower[next], upper[next], upper[index]);
  }
  capFan(p, [cx, cy - hy, cz], lower, [0, -1, 0]);
  capFan(p, [cx, cy + hy, cz], upper, [0, 1, 0], true);
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
  const capNormal = axis === "x" ? [1, 0, 0] : axis === "y" ? [0, 1, 0] : [0, 0, 1];
  capFan(p, c0, a, capNormal.map((value) => -value), false);
  capFan(p, c1, b, capNormal, true);
}

function palette(variant) {
  return [COLORS.cyan, COLORS.amber, COLORS.lime, COLORS.red][variant];
}

function chassis(variant) {
  const armor = mesh("torso-armor", variant === 2 ? COLORS.armorLight : COLORS.armor, 0.36, 0.68);
  const frame = mesh("torso-frame", COLORS.trim, 0.68, 0.82);
  const joint = mesh("torso-joints", COLORS.joint, 0.72, 0.72);
  const glow = mesh("cockpit-and-reactor", palette(variant), 0.18, 0.18, true);
  const wide = variant === 1 ? 1.08 : variant === 3 ? 0.93 : 1;
  const tall = variant === 2 ? 1.04 : variant === 3 ? 0.98 : 1;
  // Every variant shares the same shoulders, lower skirt, and chest socket;
  // the controlled width/taper differences are what make a swap a real build
  // change without breaking the family envelope.
  chamferedBox(armor, 0, 0.0, 0, 0.42 * wide, 0.34 * tall, 0.25, 0.08, variant === 3 ? 0.88 : 0.94);
  chamferedBox(armor, 0, 0.30, 0.035, 0.34 * wide, 0.13 * tall, 0.22, 0.06, variant === 0 ? 0.82 : 1);
  chamferedBox(armor, -0.49 * wide, 0.19, 0, 0.13, 0.16, 0.25, 0.045, 0.88);
  chamferedBox(armor, 0.49 * wide, 0.19, 0, 0.13, 0.16, 0.25, 0.045, 0.88);
  chamferedBox(frame, 0, -0.34, -0.01, 0.37 * wide, 0.07, 0.19, 0.035, 1);
  chamferedBox(frame, 0, 0.01, -0.255, 0.28 * wide, 0.10, 0.025, 0.02, 1);
  cylinder(joint, "y", 0.39, 0.10, 0.16, 0, 0);
  cylinder(joint, "x", 0, 1.0, 0.08, 0.16, 0);
  chamferedBox(glow, 0, 0.12, 0.277, 0.22 * wide, 0.13, 0.026, 0.018, variant === 2 ? 0.76 : 0.9);
  cylinder(glow, "z", 0.292, 0.045, 0.105, 0, 0.28);
  for (const side of [-1, 1]) {
    chamferedBox(frame, side * 0.30, -0.02, 0.262, 0.055, 0.13, 0.018, 0.012, 1);
    chamferedBox(glow, side * 0.30, 0.12, 0.295, 0.027, 0.07, 0.012, 0.01, 1);
  }
  return [armor, frame, joint, glow];
}

function arms(variant) {
  const armor = mesh("arm-armor", variant === 1 ? COLORS.armorLight : COLORS.armor, 0.40, 0.66);
  const joint = mesh("arm-joints", COLORS.joint, 0.65, 0.78);
  const accent = mesh("arm-identity", palette(variant), 0.2, 0.18, true);
  const shoulderScale = variant === 1 ? 1.1 : variant === 3 ? 0.93 : 1;
  const gauntletScale = variant === 2 ? 1.12 : variant === 3 ? 0.9 : 1;
  for (const side of [-1, 1]) {
    const sx = side;
    const shoulderX = sx * 0.52;
    const elbowX = sx * (0.72 + (variant === 1 ? 0.02 : 0));
    const wristX = sx * (0.93 + (variant === 3 ? 0.02 : 0));
    cylinder(joint, "x", shoulderX, 0.22, 0.115, 0, 0.12);
    cylinder(joint, "x", elbowX, 0.18, 0.10, 0, -0.02);
    chamferedBox(armor, shoulderX, 0.09, 0, 0.15 * shoulderScale, 0.22, 0.20, 0.055, 0.92);
    chamferedBox(armor, elbowX, -0.08, 0.01, 0.115, 0.19, 0.16, 0.045, 0.82);
    chamferedBox(armor, wristX, -0.23, 0.02, 0.13 * gauntletScale, 0.13, 0.15 * gauntletScale, 0.04, 0.9);
    cylinder(joint, "y", -0.25, 0.10, 0.075, wristX, 0.02);
    chamferedBox(accent, shoulderX, 0.20, 0.205, 0.085 * shoulderScale, 0.035, 0.018, 0.012, 1);
    chamferedBox(accent, wristX, -0.23, 0.18, 0.065 * gauntletScale, 0.035, 0.018, 0.012, 1);
    // Three compact finger plates make the hand/grip socket legible without
    // turning the arm into a noisy silhouette.
    for (let finger = -1; finger <= 1; finger += 1) {
      chamferedBox(accent, wristX + sx * finger * 0.026, -0.37, 0.04 + finger * 0.04, 0.025, 0.06, 0.026, 0.008, 1);
    }
  }
  const parts = [armor, joint, accent];
  scaleAxis(parts, 1, 0.92);
  // The broad barricade variant lands one millimetre over the 2.15 m family
  // envelope before fitting; keep its shoulders inside the authored socket
  // contract rather than weakening the curation bound.
  if (variant === 2) scaleAxis(parts, 0, 0.998);
  return parts;
}

function legs(variant) {
  const armor = mesh("leg-armor", variant === 2 ? COLORS.armorLight : COLORS.armor, 0.44, 0.64);
  const joint = mesh("leg-joints", COLORS.joint, 0.72, 0.82);
  const accent = mesh("leg-identity", palette(variant), 0.22, 0.18, true);
  const kneeWidth = variant === 1 ? 1.1 : variant === 3 ? 0.9 : 1;
  const footLength = variant === 2 ? 1.12 : variant === 3 ? 0.92 : 1;
  for (const side of [-1, 1]) {
    const x = side * 0.255;
    cylinder(joint, "x", x, 0.20, 0.105, 0.0, 0.16);
    chamferedBox(armor, x, 0.10, 0, 0.135, 0.14, 0.14, 0.045, 0.92);
    cylinder(joint, "x", x, 0.19, 0.10, 0, -0.08);
    chamferedBox(armor, x + side * 0.012, -0.12, 0.015, 0.12 * kneeWidth, 0.16, 0.13 * kneeWidth, 0.045, 0.88);
    chamferedBox(armor, x - side * 0.012, -0.31, 0.025, 0.115, 0.12, 0.12, 0.04, 0.84);
    cylinder(joint, "x", x, 0.16, 0.078, 0, -0.43);
    chamferedBox(armor, x, -0.47, 0.085, 0.17, 0.055, 0.22 * footLength, 0.035, 1);
    // Piston and ankle band establish a continuous hips -> knee -> foot line.
    cylinder(joint, "y", -0.22, 0.27, 0.032, x + side * 0.07, 0.12);
    chamferedBox(accent, x, 0.20, 0.14, 0.068, 0.035, 0.018, 0.01, 1);
    chamferedBox(accent, x, -0.10, 0.145, 0.06 * kneeWidth, 0.03, 0.018, 0.01, 1);
    chamferedBox(accent, x, -0.48, 0.31, 0.095, 0.025, 0.018, 0.01, 1);
  }
  const parts = [armor, joint, accent];
  // The ankle actuator is intentionally deep in local space for +Z working
  // orientation; compress the paired module into the documented 0.40–0.52 m
  // depth envelope so the feet sit flush beneath the chassis socket.
  scaleAxis(parts, 1, 0.90);
  scaleAxis(parts, 2, 0.62);
  return parts;
}

function weapon(variant) {
  const body = mesh("weapon-body", variant === 2 ? COLORS.armorLight : COLORS.armor, 0.34, 0.72);
  const dark = mesh("weapon-mechanism", COLORS.trim, 0.58, 0.84);
  const energy = mesh("weapon-energy", palette(variant), 0.14, 0.16, true);
  const barrelLength = variant === 2 ? 0.58 : variant === 3 ? 0.42 : 0.5;
  if (variant === 0) {
    chamferedBox(body, 0, 0.02, 0.04, 0.15, 0.14, 0.24, 0.045, 0.9);
    chamferedBox(dark, 0, -0.20, -0.01, 0.07, 0.10, 0.08, 0.025, 1);
    cylinder(dark, "z", 0.40, barrelLength, 0.045, -0.075, 0.02);
    cylinder(dark, "z", 0.40, barrelLength, 0.045, 0.075, 0.02);
    cylinder(energy, "z", 0.68, 0.065, 0.085, 0, 0);
    chamferedBox(energy, 0, 0.17, 0.12, 0.08, 0.025, 0.14, 0.012, 1);
  } else if (variant === 1) {
    cylinder(body, "z", 0.06, 0.46, 0.17, 0, 0);
    chamferedBox(body, 0, -0.17, -0.01, 0.10, 0.11, 0.12, 0.03, 1);
    cylinder(dark, "z", 0.46, 0.25, 0.10, 0, 0);
    cylinder(energy, "z", 0.21, 0.26, 0.075, 0, 0);
    cylinder(energy, "z", 0.65, 0.06, 0.12, 0, 0);
  } else if (variant === 2) {
    chamferedBox(body, 0, 0.06, 0.08, 0.12, 0.12, 0.30, 0.04, 0.86);
    cylinder(energy, "z", 0.49, barrelLength, 0.05, 0, 0);
    chamferedBox(dark, 0, -0.18, -0.02, 0.06, 0.13, 0.10, 0.025, 1);
    chamferedBox(body, 0, 0.17, -0.18, 0.22, 0.035, 0.14, 0.018, 1);
    cylinder(dark, "z", 0.78, 0.05, 0.085, 0, 0);
  } else {
    chamferedBox(body, 0, 0.05, 0.12, 0.22, 0.13, 0.18, 0.05, 0.9);
    chamferedBox(body, 0, 0.08, 0.38, 0.16, 0.10, 0.15, 0.04, 0.72);
    cylinder(dark, "z", 0.60, barrelLength, 0.075, 0, 0);
    cylinder(energy, "z", 0.56, 0.22, 0.045, 0, 0);
    chamferedBox(energy, 0, 0.18, 0.28, 0.13, 0.03, 0.025, 0.012, 1);
    chamferedBox(dark, 0, -0.19, -0.03, 0.065, 0.12, 0.085, 0.025, 1);
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
