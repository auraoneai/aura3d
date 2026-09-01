/**
 * 3D Museum Gallery Environment for Gallery Shift.
 * Typed cutaway museum architecture, route-truth wayfinding, exhibition
 * spotlights, and atmosphere.
 */
import { game, geometry, material, lights, model, text3D, type AuraSceneNode } from "@aura3d/engine";
import type { FloorLayout } from "./floor";
import { galleryShiftCutawayMuseumWorld } from "./gallery-world-candidate";

const PATROL_WEDGE_GEOMETRY = geometry.define({
  positions: [[0, 0, 0], [-1, 0, 5.8], [1, 0, 5.8]],
  indices: [0, 1, 2],
  bounds: { min: [-1, 0, 0], max: [1, 0, 5.8] }
});
const ROOM_TONES = {
  foyer: { floor: "#123b45", glow: "#4ce2df", light: "#69fff1" },
  rotunda: { floor: "#19386b", glow: "#68a8ff", light: "#84baff" },
  archive: { floor: "#352459", glow: "#b08cff", light: "#c3a5ff" },
  treasury: { floor: "#5a3517", glow: "#ffb84c", light: "#ffd07c" },
  vault: { floor: "#174839", glow: "#65e7ab", light: "#85f6c3" }
} as const;

/**
 * The museum GLB is intentionally the architectural authority, but its broad
 * planes still need a few authored, production-facing details at the route's
 * oblique review distance.  These meshes are renderer-owned set dressing: they
 * do not create colliders, alter FloorLayout, or participate in LOS.  Keeping
 * the details in three shared custom meshes gives the rooms a coherent art
 * direction without turning the route back into a pile of primitive blockout
 * nodes.
 */
type DetailMesh = {
  readonly positions: Array<readonly [number, number, number]>;
  readonly normals: Array<readonly [number, number, number]>;
  readonly indices: number[];
};

function detailMesh(): DetailMesh {
  return { positions: [], normals: [], indices: [] };
}

function addDetailBox(mesh: DetailMesh, center: readonly [number, number, number], size: readonly [number, number, number]): void {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const min: [number, number, number] = [cx - sx / 2, cy - sy / 2, cz - sz / 2];
  const max: [number, number, number] = [cx + sx / 2, cy + sy / 2, cz + sz / 2];
  const faces: readonly {
    readonly normal: readonly [number, number, number];
    readonly vertices: readonly (readonly [number, number, number])[];
  }[] = [
    { normal: [0, 0, 1], vertices: [[min[0], min[1], max[2]], [max[0], min[1], max[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]]] },
    { normal: [0, 0, -1], vertices: [[max[0], min[1], min[2]], [min[0], min[1], min[2]], [min[0], max[1], min[2]], [max[0], max[1], min[2]]] },
    { normal: [-1, 0, 0], vertices: [[min[0], min[1], min[2]], [min[0], min[1], max[2]], [min[0], max[1], max[2]], [min[0], max[1], min[2]]] },
    { normal: [1, 0, 0], vertices: [[max[0], min[1], max[2]], [max[0], min[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]]] },
    { normal: [0, 1, 0], vertices: [[min[0], max[1], max[2]], [max[0], max[1], max[2]], [max[0], max[1], min[2]], [min[0], max[1], min[2]]] },
    { normal: [0, -1, 0], vertices: [[min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], min[1], max[2]], [min[0], min[1], max[2]]] }
  ];
  for (const face of faces) {
    const base = mesh.positions.length;
    mesh.positions.push(...face.vertices);
    mesh.normals.push(...face.vertices.map(() => face.normal as readonly [number, number, number]));
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function authoredMuseumDetails(): {
  readonly architecture: ReturnType<typeof geometry.define>;
  readonly artwork: ReturnType<typeof geometry.define>;
  readonly luminous: ReturnType<typeof geometry.define>;
} {
  const architecture = detailMesh();
  const artwork = detailMesh();
  const luminous = detailMesh();

  // Tall framed panels make the west/east wings read as galleries rather than
  // colored rectangles.  They sit just inside the existing typed perimeter.
  for (const x of [-9.94, 9.94]) {
    for (const z of [-4.9, -2.4, 2.8, 5.35]) {
      addDetailBox(architecture, [x, 1.58, z], [0.08, 1.82, 1.42]);
      addDetailBox(architecture, [x + (x < 0 ? 0.055 : -0.055), 1.58, z - 0.78], [0.045, 0.1, 1.54]);
      addDetailBox(architecture, [x + (x < 0 ? 0.055 : -0.055), 1.58, z + 0.78], [0.045, 0.1, 1.54]);
      addDetailBox(artwork, [x + (x < 0 ? 0.11 : -0.11), 1.58, z], [0.028, 1.35, 0.98]);
    }
  }

  // North-wall triptych and a real-looking security console give the vault
  // approach a destination, depth, and a warm/cool material hierarchy.
  for (const x of [-3.65, 0, 3.65]) {
    addDetailBox(architecture, [x, 1.62, -7.0], [2.1, 1.9, 0.09]);
    addDetailBox(artwork, [x, 1.62, -6.94], [1.64, 1.38, 0.035]);
    addDetailBox(luminous, [x - 0.78, 1.62, -6.90], [0.035, 1.48, 0.022]);
    addDetailBox(luminous, [x + 0.78, 1.62, -6.90], [0.035, 1.48, 0.022]);
  }
  addDetailBox(architecture, [0, 1.38, -6.87], [2.7, 1.28, 0.22]);
  addDetailBox(architecture, [0, 2.22, -6.72], [2.12, 0.48, 0.18]);
  addDetailBox(artwork, [0, 2.22, -6.61], [1.6, 0.23, 0.035]);
  for (const x of [-0.72, -0.24, 0.24, 0.72]) addDetailBox(luminous, [x, 1.8, -6.58], [0.12, 0.16, 0.04]);

  // A framed entry rhythm anchors the south foyer and separates it from the
  // live intercept without adding another collision wall.
  for (const x of [-3.2, 3.2]) {
    // Keep the entry surround against the south perimeter.  The active
    // intercept starts at z≈4.6, so the lintel must not cut through the live
    // infiltrator/guard silhouettes in the review composition.
    addDetailBox(architecture, [x, 1.42, 6.58], [0.22, 2.66, 0.22]);
    addDetailBox(architecture, [x, 2.70, 6.58], [2.42, 0.22, 0.22]);
    addDetailBox(luminous, [x + (x < 0 ? 0.13 : -0.13), 1.92, 6.46], [0.04, 1.62, 0.035]);
  }

  // Four low architectural plinths and a brass service stripe add visual
  // scale to the central approach while staying outside the authored routes.
  for (const x of [-3.45, 3.45]) {
    addDetailBox(architecture, [x, 0.34, 4.35], [1.18, 0.68, 0.46]);
    addDetailBox(artwork, [x, 0.73, 4.35], [0.72, 0.06, 0.24]);
  }
  for (const z of [3.55, 4.2, 4.85]) addDetailBox(luminous, [0, 0.075, z], [0.055, 0.025, 0.34]);

  // Suspended fixtures are shallow boxes so their glow remains readable in
  // the safe renderer's opaque-material path.
  for (const [x, z] of [[-3.8, 0], [3.8, 0], [0, 3.9], [0, -3.8]] as const) {
    addDetailBox(architecture, [x, 3.08, z], [0.62, 0.12, 0.62]);
    addDetailBox(luminous, [x, 3.0, z], [0.34, 0.035, 0.34]);
  }

  return {
    architecture: geometry.define({ positions: architecture.positions, normals: architecture.normals, indices: architecture.indices }),
    artwork: geometry.define({ positions: artwork.positions, normals: artwork.normals, indices: artwork.indices }),
    luminous: geometry.define({ positions: luminous.positions, normals: luminous.normals, indices: luminous.indices })
  };
}

const MUSEUM_DETAILS = authoredMuseumDetails();

/**
 * Renderer-owned tactical feedback generated from the same FloorLayout door
 * room regions used by collision/LOS/gameplay. The typed candidate already
 * supplies distinct room floors, complete door frames, and readable portal
 * circulation, so this layer deliberately does not redraw architecture or a
 * second route network over the floor.
 */
function tacticalPlanNodes(layout: FloorLayout): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  for (const room of layout.rooms) {
    const tone = ROOM_TONES[room.tone];
    nodes.push(
      lights.point({
        name: `plan-room-${room.id}-practical`,
        color: tone.light,
        intensity: room.tone === "rotunda" ? 1.1 : 0.72
      }).position(room.x, 1.35, room.z).toJSON()
    );
  }

  return nodes;
}

export function createGalleryEnvironment(layout: FloorLayout): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  // One page-local typed world replaces the earlier catalog shell in place.
  // It is metre-scale, roofless, and follows the same Floor 1 footprint and
  // door openings. FloorLayout remains the sole collision, LOS, patrol, room,
  // objective, and network authority; this node is visual architecture only.
  // Do not add a second room plan, shell, floor slab, or ceiling alongside it.
  nodes.push(
    model(galleryShiftCutawayMuseumWorld, {
      name: "museum-interior",
      role: "primaryWorld",
      scaleMode: "world"
    })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("museum-interior", { tags: ["typed-asset", "museum-interior"] }))
      .toJSON()
  );

  // The typed world remains the single architectural authority. These three
  // authored meshes are a museum-grade finish pass layered on top: wall
  // frames, console/entry structures, artwork insets, and practical light
  // fixtures. They carry no physics bodies and never replace the route's
  // FloorLayout walls or LOS geometry.
  const detailStone = material.metal({
    name: "museum detail graphite and brass",
    // Lift the edge frames above the typed world's near-black perimeter so
    // the roofless cutaway reads as a real exhibition interior at review
    // distance. The museum GLB remains the architectural authority; this is
    // only a renderer-owned material finish on the authored inset details.
    color: "#40576a",
    roughness: 0.28,
    metallic: 0.68
  });
  const detailArtwork = material.pbr({
    name: "museum detail artwork lacquer",
    color: "#254c78",
    roughness: 0.24,
    metallic: 0.3
  });
  const detailGlow = material.emissive({
    name: "museum detail practical glow",
    color: "#77e6e5",
    emissive: "#77e6e5",
    emissiveIntensity: 1.12,
    opacity: 0.94
  });
  nodes.push(
    geometry.custom(MUSEUM_DETAILS.architecture, { name: "museum authored architectural detail", material: detailStone })
      .runtime(game.runtimeNode("museum authored architectural detail", { tags: ["typed-set-dressing", "museum-architecture", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(MUSEUM_DETAILS.artwork, { name: "museum authored artwork insets", material: detailArtwork })
      .runtime(game.runtimeNode("museum authored artwork insets", { tags: ["typed-set-dressing", "museum-artwork", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(MUSEUM_DETAILS.luminous, { name: "museum authored practical fixtures", material: detailGlow })
      .runtime(game.runtimeNode("museum authored practical fixtures", { tags: ["museum-lighting", "renderer-owned"] }))
      .toJSON()
  );

  // Room-wayfinding labels are extruded world geometry, not a DOM overlay.
  // They sit high on the north-facing wall so the player can read the route's
  // two objective wings and service exit in the same frame as the live actors.
  const roomLabelMaterial = material.emissive({
    name: "museum room label glow",
    color: "#ecfffc",
    emissive: "#73f2e2",
    emissiveIntensity: 0.82
  });
  nodes.push(
    text3D("ARCHIVE", { name: "archive room label", size: 0.5, depth: 0.045, letterSpacing: 0.05, material: roomLabelMaterial })
      .position(-8.35, 2.78, -6.83)
      .rotate(0, 0.62, 0)
      .runtime(game.runtimeNode("archive room label", { tags: ["museum-wayfinding", "world-label", "renderer-owned"] }))
      .toJSON(),
    text3D("TREASURY", { name: "treasury room label", size: 0.5, depth: 0.045, letterSpacing: 0.05, material: roomLabelMaterial })
      .position(6.0, 2.78, -6.83)
      .rotate(0, 0.62, 0)
      .runtime(game.runtimeNode("treasury room label", { tags: ["museum-wayfinding", "world-label", "renderer-owned"] }))
      .toJSON(),
    text3D("SERVICE EXIT", { name: "service exit room label", size: 0.42, depth: 0.045, letterSpacing: 0.04, material: roomLabelMaterial })
      .position(-1.35, 2.78, -6.83)
      .rotate(0, 0.62, 0)
      .runtime(game.runtimeNode("service exit room label", { tags: ["museum-wayfinding", "world-label", "renderer-owned"] }))
      .toJSON()
  );

  nodes.push(...tacticalPlanNodes(layout));

  // The typed museum world is the visible architectural authority. Earlier
  // review passes rendered a second slab, room plan, and wall mesh at the
  // exact same coordinates. That caused dark z-fighting and made the hall
  // read like disconnected blocks. Route geometry below is deliberately only
  // wayfinding and feedback that cannot overlap the typed world.
  const sightlineWash = material.emissive({ name: "museum guard sightline wash", color: "#143c57", emissive: "#54d8ff", emissiveIntensity: 0.38, opacity: 0.2 });

  nodes.push(
    // One tapered renderer wedge per patrol makes the authored facing legible
    // without the old stack of overlapping rectangular bands. Runtime sync
    // uses the same guard yaw consumed by the real LOS query; the wedge is
    // presentation feedback, while detection and occlusion remain physics
    // truth in vision.ts.
    ...["guard-1", "guard-2"].map((id) =>
      geometry.custom(PATROL_WEDGE_GEOMETRY, { name: `${id} sightline preview`, material: sightlineWash })
        .position(0, 0.06, -20)
        .scale([1.58, 1, 1])
        .runtime(game.runtimeNode(`${id} sightline preview`, { tags: ["stealth-feedback", "vision-cone", "renderer-owned"] }))
        .toJSON()
    ),
    // The spectator camera includes a little more of the south approach than
    // the typed museum shell's authored slab.  Continue the same subdued slate
    // finish into that non-walkable foreground so the review frame ends in a
    // deliberate architectural apron instead of exposing the scene clear
    // color as a black footer.  This is decorative renderer-owned ground only;
    // movement and collision still belong to the typed museum runtime.
    // No renderer-owned apron extends beyond the asset.  The visible boundary
    // is the actual museum boundary rather than a detached screen-filling bar.
    // Room names remain in FloorLayout/evidence. The exact visual spends its
    // draw budget on spatial walls, openings, cover, and threat readability.
  );

  // ---------------- Lighting ----------------
  nodes.push(
    // Ambient Hall Tone
    lights.ambient({
      name: "museum-ambient",
      color: "#475569",
      // The typed hall carries dark slate materials. Lift the room-level
      // values enough that portals, cover, and room boundaries are readable
      // before a player walks directly beneath a practical.
      intensity: 1.18
    }).toJSON(),
    // Cool Moonlight Key Light (South-to-North)
    lights.directional({
      name: "museum-moonlight-south",
      color: "#e2e8f0",
      intensity: 1.36
    }).position(-5, 16, 9).toJSON(),
    // Museum Key Light (North-to-South)
    lights.directional({
      name: "museum-moonlight-north",
      color: "#cbd5e1",
      intensity: 1.26
    }).position(5, 16, -9).toJSON(),
    // Warm Rotunda Chandelier
    lights.point({
      name: "rotunda-chandelier",
      color: "#fef08a",
      intensity: 1.35
    }).position(0, 4.2, 0).toJSON(),
    // Exit Area Neon Beacon
    lights.point({
      name: "exit-beacon-glow",
      color: "#34d399",
      intensity: 1.7
    }).position(0, 2.4, -6.4).toJSON(),
    lights.point({
      name: "west-objective-gallery-glow",
      color: "#f5bf61",
      intensity: 1.8
    }).position(-6.5, 2.2, -4.2).toJSON(),
    lights.point({
      name: "east-objective-gallery-glow",
      color: "#f5bf61",
      intensity: 1.8
    }).position(6.5, 2.2, -4.2).toJSON(),
    lights.point({
      name: "rotunda-security-glow",
      color: "#5bd8e6",
      intensity: 1.35
    }).position(0, 2.0, 0).toJSON(),
    lights.point({
      name: "west-archive-practical",
      color: "#73d8ff",
      intensity: 1.35
    }).position(-7.25, 2.35, 0.4).toJSON(),
    lights.point({
      name: "east-treasury-practical",
      color: "#ffc56e",
      intensity: 1.4
    }).position(7.25, 2.35, 0.4).toJSON(),
    // Broad overhead softboxes give the exhibits and floor inlays a second
    // readable layer of light, rather than relying on a single point source.
    lights.rect({ name: "museum central north softbox", color: "#d9f7ff", intensity: 0.88, width: 4.8, height: 1.1 })
      .position(0, 4.6, -3.8)
      .toJSON(),
    lights.rect({ name: "museum central south softbox", color: "#fff1c2", intensity: 0.76, width: 4.8, height: 1.1 })
      .position(0, 4.3, 3.8)
      .toJSON(),
    lights.rect({ name: "museum west wing softbox", color: "#78d8ff", intensity: 0.52, width: 3.4, height: 1.5 })
      .position(-6.45, 3.8, 0)
      .toJSON(),
    lights.rect({ name: "museum east wing softbox", color: "#ffc96b", intensity: 0.52, width: 3.4, height: 1.5 })
      .position(6.45, 3.8, 0)
      .toJSON()
  );

  // The metre-scale typed museum GLB owns the visible floor slab and shell.
  // Route primitives below are decorative inlays, frames, and light fixtures;
  // they do not replace the typed world subject.

  return nodes;
}
