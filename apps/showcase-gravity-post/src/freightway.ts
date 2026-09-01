/**
 * Review-capture freightway for Gravity Post's Rust -> Gale contract.
 *
 * This is renderer-owned architectural geometry, intentionally separate from
 * the authored arcade integrator and sensor bodies.  It derives every point
 * from the live dispatch vector, but cannot block, steer, or otherwise change
 * a courier delivery.  Five merged indexed meshes replace the previous field
 * of individually submitted slabs and service boxes: one continuous terminal
 * district rather than a diagram of unrelated props. The review lens looks
 * down this corridor while the real pod flies its solved Rust -> Gale vector,
 * so the center must remain an unobstructed, readable depth channel. The
 * district is an open terraced causeway rather than a wall-lined trench:
 * broad lit aprons and low cargo terraces keep the route continuous without
 * merging into near-black masses behind the courier.  The intermediate
 * skyline bays below are deliberately structural: they give the route a
 * readable sequence of loading gantries and depth cues while remaining part
 * of the same seven merged meshes and never touching gameplay state.
 */
import { geometry, material, type AuraSceneNode, type AuraRootVec3 } from "@aura3d/engine";

type Mesh = { positions: AuraRootVec3[]; indices: number[] };

interface FreightwayInput {
  readonly origin: readonly [number, number];
  readonly destination: readonly [number, number];
  readonly playPlaneY: number;
}

function mesh(): Mesh { return { positions: [], indices: [] }; }

function appendQuad(target: Mesh, a: AuraRootVec3, b: AuraRootVec3, c: AuraRootVec3, d: AuraRootVec3): void {
  const base = target.positions.length;
  target.positions.push(a, b, c, d);
  target.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** One closed, world-aligned cuboid. The material is shared by its whole merged mesh. */
function appendBox(
  target: Mesh,
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  tangent: readonly [number, number],
  cross: readonly [number, number]
): void {
  const [cx, cy, cz] = center;
  const [length, height, width] = size;
  const lx = length / 2;
  const ly = height / 2;
  const lz = width / 2;
  const point = (x: number, y: number, z: number): AuraRootVec3 => [
    cx + tangent[0] * x + cross[0] * z,
    cy + y,
    cz + tangent[1] * x + cross[1] * z
  ];
  const p000 = point(-lx, -ly, -lz);
  const p100 = point(lx, -ly, -lz);
  const p110 = point(lx, ly, -lz);
  const p010 = point(-lx, ly, -lz);
  const p001 = point(-lx, -ly, lz);
  const p101 = point(lx, -ly, lz);
  const p111 = point(lx, ly, lz);
  const p011 = point(-lx, ly, lz);
  appendQuad(target, p000, p100, p110, p010);
  appendQuad(target, p101, p001, p011, p111);
  appendQuad(target, p001, p000, p010, p011);
  appendQuad(target, p100, p101, p111, p110);
  appendQuad(target, p010, p110, p111, p011);
  appendQuad(target, p001, p101, p100, p000);
}

/**
 * A low-poly catenary-ish arch, extruded down the route direction. Kept for
 * the destination crown only: repeated overhead arches across the active
 * flight path made the freightway read like a dark ceiling instead of a route.
 */
function appendArch(
  target: Mesh,
  center: readonly [number, number, number],
  tangent: readonly [number, number],
  cross: readonly [number, number],
  span: number,
  springY: number,
  rise: number,
  depth: number,
  beam: number
): void {
  const rings: AuraRootVec3[][] = [];
  const samples = 10;
  for (let index = 0; index <= samples; index += 1) {
    const angle = Math.PI - (Math.PI * index) / samples;
    const lateral = Math.cos(angle) * span / 2;
    const y = springY + Math.sin(angle) * rise;
    const x0 = -depth / 2;
    const x1 = depth / 2;
    const z0 = lateral - beam / 2;
    const z1 = lateral + beam / 2;
    const world = (x: number, z: number): AuraRootVec3 => [
      center[0] + tangent[0] * x + cross[0] * z,
      y,
      center[2] + tangent[1] * x + cross[1] * z
    ];
    rings.push([world(x0, z0), world(x1, z0), world(x1, z1), world(x0, z1)]);
  }
  for (let index = 0; index < rings.length - 1; index += 1) {
    const a = rings[index]!;
    const b = rings[index + 1]!;
    appendQuad(target, a[0]!, a[1]!, b[1]!, b[0]!);
    appendQuad(target, a[1]!, a[2]!, b[2]!, b[1]!);
    appendQuad(target, a[2]!, a[3]!, b[3]!, b[2]!);
    appendQuad(target, a[3]!, a[0]!, b[0]!, b[3]!);
  }
}

export function createRustGaleFreightway(input: FreightwayInput): readonly AuraSceneNode[] {
  const [originX, originZ] = input.origin;
  const [destinationX, destinationZ] = input.destination;
  const dx = destinationX - originX;
  const dz = destinationZ - originZ;
  const length = Math.hypot(dx, dz);
  const tangent = [dx / length, dz / length] as const;
  const cross = [-tangent[1], tangent[0]] as const;
  const point = (progress: number, lateral = 0, y = input.playPlaneY): readonly [number, number, number] => [
    originX + dx * progress + cross[0] * lateral,
    y,
    originZ + dz * progress + cross[1] * lateral
  ];

  const structure = mesh();
  const cladding = mesh();
  const windows = mesh();
  const signals = mesh();
  const lane = mesh();
  const laneMarkers = mesh();
  const horizon = mesh();
  const deckY = input.playPlaneY - 0.12;

  // One uninterrupted deck joins exchange and terminal. Two shallow lower
  // tiers expose its silhouette against the sky instead of turning the route
  // into a dark canyon.
  appendBox(structure, point(0.54, 0, deckY), [length * 1.24, 0.16, 2.52], tangent, cross);
  appendBox(structure, point(0.54, 0, deckY - 0.16), [length * 1.18, 0.16, 1.74], tangent, cross);
  appendBox(cladding, point(0.54, 0, input.playPlaneY - 0.025), [length * 1.2, 0.035, 1.94], tangent, cross);
  // A recessed graphite flight lane gives the live pod a continuous surface
  // relationship from Rust to Gale. It is deliberately wide enough to read as
  // freight infrastructure, not a UI line, and remains non-colliding scene
  // geometry underneath the immutable route coordinates.
  appendBox(lane, point(0.54, 0, input.playPlaneY + 0.003), [length * 1.14, 0.022, 0.72], tangent, cross);
  for (let index = 0; index < 7; index += 1) {
    const progress = 0.14 + index * 0.12;
    for (const side of [-1, 1] as const) {
      appendBox(laneMarkers, point(progress, side * 0.3, input.playPlaneY + 0.02), [length * 0.045, 0.018, 0.04], tangent, cross);
    }
  }

  // Alternating cargo terraces form broad, low landmarks. Their bays overlap
  // in progress, visually knitting the whole place together, while the open
  // center and low roofline keep pod and terminal readable.
  for (const [progress, lengthScale, height, lateral] of [
    [0.08, 0.23, 0.26, 1.43],
    [0.25, 0.18, 0.36, 1.48],
    [0.42, 0.26, 0.22, 1.4],
    [0.61, 0.2, 0.42, 1.5],
    [0.79, 0.24, 0.28, 1.42]
  ] as const) {
    for (const side of [-1, 1] as const) {
      appendBox(structure, point(progress, side * lateral, input.playPlaneY + height / 2 - 0.04), [length * lengthScale, height, 0.62], tangent, cross);
      appendBox(cladding, point(progress, side * (lateral - 0.32), input.playPlaneY + 0.08), [length * lengthScale * 0.82, 0.12, 0.12], tangent, cross);
      appendBox(windows, point(progress, side * (lateral - 0.37), input.playPlaneY + 0.17), [length * lengthScale * 0.48, 0.075, 0.025], tangent, cross);
    }
  }

  // Four offset gantry bays establish a freight-city cadence along the real
  // Rust -> Gale vector.  They sit outside the courier channel, alternate
  // sides, and expose a rising/descending skyline in the oblique review lens.
  // This is authored environment geometry (not a screen-space route overlay),
  // merged into the existing structural/window meshes to preserve the low-draw
  // asset contract.
  for (const [progress, lateral, height, width] of [
    [0.16, 1.68, 0.68, 0.48],
    [0.36, -1.72, 0.82, 0.56],
    [0.57, 1.76, 0.92, 0.62],
    [0.78, -1.7, 0.74, 0.52]
  ] as const) {
    const side = lateral < 0 ? -1 : 1;
    appendBox(structure, point(progress, lateral, input.playPlaneY + height / 2 - 0.02), [length * 0.06, height, width], tangent, cross);
    appendBox(structure, point(progress, lateral + side * 0.24, input.playPlaneY + height - 0.06), [length * 0.17, 0.1, 0.1], tangent, cross);
    appendBox(windows, point(progress, lateral - side * 0.05, input.playPlaneY + height * 0.62), [length * 0.035, 0.13, width * 0.56], tangent, cross);
  }

  // Continuous shoulder ribbons make the terraced bays read as one district.
  // They sit below the courier rather than rising into opaque side walls.
  for (const side of [-1, 1] as const) {
    appendBox(structure, point(0.52, side * 1.28, input.playPlaneY + 0.07), [length * 1.24, 0.18, 0.28], tangent, cross);
    appendBox(signals, point(0.52, side * 1.13, input.playPlaneY + 0.17), [length * 1.2, 0.045, 0.055], tangent, cross);
  }

  // Recessed continuous guide rails provide a physical route through the
  // district. They converge naturally at Gale; they are not dotted UI or
  // a row of foreground markers.
  appendBox(signals, point(0.54, -0.74, input.playPlaneY + 0.005), [length * 1.16, 0.035, 0.075], tangent, cross);
  appendBox(signals, point(0.54, 0.74, input.playPlaneY + 0.005), [length * 1.16, 0.035, 0.075], tangent, cross);
  appendBox(signals, point(0.78, 0, input.playPlaneY - 0.005), [length * 0.44, 0.022, 0.052], tangent, cross);

  // Gale is a joined arrival apron, not an isolated ring: the causeway widens
  // into two low wings and a bright crown. Three modest skyline pylons sit
  // behind it, retaining depth without enclosing the objective in black mass.
  appendBox(structure, point(1.02, 0, input.playPlaneY + 0.13), [0.92, 0.26, 3.18], tangent, cross);
  appendBox(cladding, point(1.04, 0, input.playPlaneY + 0.29), [0.72, 0.12, 2.92], tangent, cross);
  appendArch(structure, point(1.02, 0, input.playPlaneY), tangent, cross, 2.78, input.playPlaneY + 0.12, 1.12, 0.2, 0.16);
  appendBox(windows, point(1.03, -1.28, input.playPlaneY + 0.35), [0.48, 0.18, 0.026], tangent, cross);
  appendBox(windows, point(1.03, 1.28, input.playPlaneY + 0.35), [0.48, 0.18, 0.026], tangent, cross);
  appendBox(signals, point(1.0, 0, input.playPlaneY + 1.12), [0.32, 0.07, 2.24], tangent, cross);
  for (const [progress, lateral, height, width] of [[1.25, -2.02, 1.02, 0.56], [1.34, 0, 1.38, 0.72], [1.25, 2.02, 0.94, 0.54]] as const) {
    appendBox(horizon, point(progress, lateral, input.playPlaneY + height / 2), [0.42, height, width], tangent, cross);
    appendBox(windows, point(progress - 0.04, lateral + (lateral === 0 ? 0.01 : Math.sign(lateral) * -0.2), input.playPlaneY + height * 0.7), [0.16, 0.1, 0.026], tangent, cross);
  }

  // A small set of offset logistics towers gives the corridor an actual
  // freight-city skyline instead of a single plane of rails. They are kept
  // outside the ±0.72 courier channel, staggered in depth and height, and
  // broken into facade/window/signals meshes so the oblique lens can read
  // material variation and scale. These are renderer-owned set dressing only.
  for (const [progress, lateral, height, width, facade] of [
    [0.12, -2.38, 1.72, 0.62, "dark"],
    [0.29, 2.28, 1.38, 0.54, "warm"],
    [0.47, -2.52, 2.06, 0.72, "warm"],
    [0.66, 2.44, 1.64, 0.58, "dark"],
    [0.86, -2.34, 1.9, 0.68, "warm"]
  ] as const) {
    const facadeMesh = facade === "warm" ? cladding : structure;
    appendBox(facadeMesh, point(progress, lateral, input.playPlaneY + height / 2 - 0.04), [length * 0.105, height, width], tangent, cross);
    // A recessed dark service spine behind each tower gives the facade a
    // readable second plane instead of a monolithic colored slab.
    appendBox(structure, point(progress + 0.018, lateral + Math.sign(lateral) * 0.04, input.playPlaneY + height * 0.42), [length * 0.058, height * 0.76, width * 0.72], tangent, cross);
    for (let band = 0; band < 4; band += 1) {
      const bandY = input.playPlaneY + 0.24 + band * Math.max(0.22, height * 0.19);
      appendBox(windows, point(progress - 0.056, lateral - Math.sign(lateral) * width * 0.52, bandY), [length * 0.036, 0.095, width * 0.62], tangent, cross);
    }
    appendBox(signals, point(progress + 0.05, lateral - Math.sign(lateral) * width * 0.54, input.playPlaneY + height * 0.82), [length * 0.022, 0.05, width * 0.18], tangent, cross);
  }

  const structuralMaterial = material.pbr({ name: "Gale freightway weathered blue alloy", color: "#31596a", roughness: 0.62, metallic: 0.36, emissive: "#153746", emissiveIntensity: 0.18 });
  const claddingMaterial = material.pbr({ name: "Rust Gale oxidized cargo cladding", color: "#8b523f", roughness: 0.68, metallic: 0.2, emissive: "#48261f", emissiveIntensity: 0.14 });
  const windowMaterial = material.emissive({ name: "Gale terminal cargo windows", color: "#245d68", emissive: "#55bdc9", emissiveIntensity: 0.52, opacity: 0.86 });
  // Signals must read as embedded industrial guidance, not a bright graphic
  // comb that flattens the terminal roof in the chase lens.
  const signalMaterial = material.emissive({ name: "Gale freightway integrated signals", color: "#1b4b58", emissive: "#3ea4b3", emissiveIntensity: 0.4, opacity: 0.82 });
  const laneMaterial = material.pbr({ name: "Rust Gale graphite flight lane", color: "#254454", roughness: 0.72, metallic: 0.28, emissive: "#102b37", emissiveIntensity: 0.1 });
  const laneMarkerMaterial = material.emissive({ name: "Rust Gale inset amber lane markers", color: "#713416", emissive: "#e97324", emissiveIntensity: 0.62, opacity: 0.88 });
  const horizonMaterial = material.pbr({ name: "Gale terminal horizon pylons", color: "#40576b", roughness: 0.64, metallic: 0.28, emissive: "#223747", emissiveIntensity: 0.16 });

  return [
    geometry.custom(geometry.define(structure), { name: "Rust Gale continuous freightway and terminal bulkheads", material: structuralMaterial }).toJSON(),
    geometry.custom(geometry.define(cladding), { name: "Rust Gale freight district bay cladding", material: claddingMaterial }).toJSON(),
    geometry.custom(geometry.define(windows), { name: "Gale Terminal cargo bay glazing", material: windowMaterial }).toJSON(),
    geometry.custom(geometry.define(signals), { name: "Rust Gale integrated freight signals", material: signalMaterial }).toJSON(),
    geometry.custom(geometry.define(lane), { name: "Rust Gale recessed courier flight lane", material: laneMaterial }).toJSON(),
    geometry.custom(geometry.define(laneMarkers), { name: "Rust Gale inset courier lane markers", material: laneMarkerMaterial }).toJSON(),
    geometry.custom(geometry.define(horizon), { name: "Gale Terminal horizon service towers", material: horizonMaterial }).toJSON()
  ];
}
