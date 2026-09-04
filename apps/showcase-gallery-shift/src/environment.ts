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
  readonly floorGrid: ReturnType<typeof geometry.define>;
  readonly floorDark: ReturnType<typeof geometry.define>;
  readonly furniture: ReturnType<typeof geometry.define>;
  readonly cover: ReturnType<typeof geometry.define>;
} {
  const architecture = detailMesh();
  const artwork = detailMesh();
  const luminous = detailMesh();
  const floorGrid = detailMesh();
  const floorDark = detailMesh();
  const furniture = detailMesh();
  const cover = detailMesh();

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

  // Door portals and rotunda columns give the typed cutaway a readable
  // architectural rhythm at the gameplay camera.  These are deliberately
  // inset at the same openings/room edges declared by FloorLayout: they add
  // jambs, caps, and structural depth, but no new wall, collider, route, or
  // line-of-sight occluder.  The GLB remains the world authority beneath this
  // one combined detail mesh.
  const portalSpecs: readonly {
    readonly x: number;
    readonly z: number;
    readonly axis: "x" | "z";
    readonly span: number;
  }[] = [
    { x: -5, z: -1.3, axis: "z", span: 1.32 },
    { x: 5, z: 0.8, axis: "z", span: 1.32 },
    { x: -7.5, z: 1.4, axis: "x", span: 1.32 },
    { x: 7.5, z: -1.3, axis: "x", span: 1.32 }
  ];
  for (const portal of portalSpecs) {
    if (portal.axis === "z") {
      for (const z of [portal.z - portal.span, portal.z + portal.span]) {
        addDetailBox(architecture, [portal.x, 1.42, z], [0.28, 2.72, 0.2]);
        addDetailBox(luminous, [portal.x + (portal.x < 0 ? 0.16 : -0.16), 1.76, z], [0.035, 1.7, 0.035]);
      }
      addDetailBox(architecture, [portal.x, 2.78, portal.z], [0.28, 0.24, portal.span * 2 + 0.36]);
      addDetailBox(artwork, [portal.x + (portal.x < 0 ? 0.16 : -0.16), 2.78, portal.z], [0.035, 0.1, portal.span * 2 - 0.08]);
    } else {
      for (const x of [portal.x - portal.span, portal.x + portal.span]) {
        addDetailBox(architecture, [x, 1.42, portal.z], [0.2, 2.72, 0.28]);
        addDetailBox(luminous, [x, 1.76, portal.z + (portal.z < 0 ? 0.16 : -0.16)], [0.035, 1.7, 0.035]);
      }
      addDetailBox(architecture, [portal.x, 2.78, portal.z], [portal.span * 2 + 0.36, 0.24, 0.28]);
      addDetailBox(artwork, [portal.x, 2.78, portal.z + (portal.z < 0 ? 0.16 : -0.16)], [portal.span * 2 - 0.08, 0.1, 0.035]);
    }
  }

  // Four rotunda columns frame the security desks and establish a scale cue
  // around the live intercept.  Their bases/caps are visual-only and remain
  // outside the central patrol lane, so runtime movement and LOS math still
  // use only FloorLayout's authored geometry.
  for (const [x, z] of [[-4.35, -2.28], [4.35, -2.28], [-4.35, 2.28], [4.35, 2.28]] as const) {
    addDetailBox(architecture, [x, 1.46, z], [0.34, 2.75, 0.34]);
    addDetailBox(architecture, [x, 0.14, z], [0.62, 0.2, 0.62]);
    addDetailBox(architecture, [x, 2.86, z], [0.62, 0.18, 0.62]);
    addDetailBox(luminous, [x, 2.56, z], [0.08, 0.22, 0.08]);
  }

  // Recessed display bays turn the side rooms into authored exhibit suites:
  // each bay is paired with the typed display-case/asset nodes in main.ts,
  // while this shared mesh supplies only a backboard, shelf and trim.  The
  // bays hug the perimeter and do not overlap the real cover/collision cases.
  for (const [x, z, side] of [
    [-8.8, -5.72, -1], [-8.8, 5.52, -1],
    [8.8, -5.72, 1], [8.8, 5.52, 1]
  ] as const) {
    addDetailBox(architecture, [x, 1.28, z], [0.18, 2.08, 1.08]);
    addDetailBox(architecture, [x + side * 0.11, 0.34, z], [0.28, 0.18, 1.36]);
    addDetailBox(artwork, [x + side * 0.12, 1.42, z], [0.035, 1.18, 0.76]);
    addDetailBox(luminous, [x + side * 0.14, 0.82, z - 0.46], [0.04, 0.05, 0.66]);
    addDetailBox(luminous, [x + side * 0.14, 0.82, z + 0.46], [0.04, 0.05, 0.66]);
  }

  // A single, restrained floor-grid mesh makes the cutaway read as a designed
  // museum plan instead of seven untextured colour fields.  These seams sit
  // just above the typed GLB floor and are intentionally inset from every
  // wall/case so they cannot mask the real LOS cover or collision footprint.
  // They are renderer-owned material details, not route or objective guides.
  const floorRooms: readonly { readonly x: number; readonly z: number; readonly halfX: number; readonly halfZ: number; readonly spacing: number }[] = [
    { x: 0, z: 4.65, halfX: 4.45, halfZ: 1.42, spacing: 1.12 },
    { x: 0, z: 0.1, halfX: 4.4, halfZ: 2.72, spacing: 1.2 },
    { x: 0, z: -5.45, halfX: 2.78, halfZ: 1.0, spacing: 1.14 },
    { x: -7.5, z: -2.85, halfX: 2.08, halfZ: 1.72, spacing: 1.08 },
    { x: -7.5, z: 4.05, halfX: 2.08, halfZ: 2.18, spacing: 1.08 },
    { x: 7.5, z: -4.15, halfX: 2.08, halfZ: 1.32, spacing: 1.08 },
    { x: 7.5, z: 2.75, halfX: 2.08, halfZ: 3.62, spacing: 1.08 }
  ];
  for (const room of floorRooms) {
    const left = room.x - room.halfX;
    const right = room.x + room.halfX;
    const north = room.z - room.halfZ;
    const south = room.z + room.halfZ;
    const width = right - left;
    const depth = south - north;
    const inset = 0.08;
    // Perimeter keyline: two narrow rails on each axis establish the room
    // boundary without redrawing a second wall or floor slab.
    addDetailBox(floorGrid, [room.x, 0.094, north + inset], [Math.max(0.4, width - 0.16), 0.026, 0.035]);
    addDetailBox(floorGrid, [room.x, 0.094, south - inset], [Math.max(0.4, width - 0.16), 0.026, 0.035]);
    addDetailBox(floorGrid, [left + inset, 0.094, room.z], [0.035, 0.026, Math.max(0.4, depth - 0.16)]);
    addDetailBox(floorGrid, [right - inset, 0.094, room.z], [0.035, 0.026, Math.max(0.4, depth - 0.16)]);
    // Repeated seams are deliberately sparse in the rotunda, where the
    // existing medallion owns the focal point, and denser in the side wings
    // where they supply the architectural scale Monaco's plan communicates.
    for (let x = left + room.spacing; x < right - 0.24; x += room.spacing) {
      addDetailBox(floorGrid, [x, 0.093, room.z], [0.018, 0.024, Math.max(0.35, depth - 0.28)]);
    }
    if (room.halfZ > 1.3) {
      for (let z = north + room.spacing; z < south - 0.24; z += room.spacing) {
        addDetailBox(floorGrid, [room.x, 0.093, z], [Math.max(0.35, width - 0.28), 0.024, 0.018]);
      }
    }
    // Dark-floor variant plate: a thin matte slab per room, inset from the
    // walls, sitting below the brass keylines (top 0.071 vs grid bottom
    // ~0.08) so the keylines, thresholds, and light pools read against a
    // Monaco-style dark ground instead of the pale typed GLB floor.
    addDetailBox(floorDark, [room.x, 0.062, room.z], [Math.max(0.4, width - 0.1), 0.018, Math.max(0.4, depth - 0.1)]);
  }

  // Brass threshold inserts bridge the exact FloorLayout door openings. They
  // are floor material details (not a second route graph), but the repeated
  // cross-room seams make the authored west/east wings and north service
  // destination read as one walkable museum plan from the review lens.
  for (const [x, z, sx, sz] of [
    [-5.0, -1.3, 0.18, 1.18],
    [5.0, 0.8, 0.18, 1.18],
    [-7.5, 1.4, 1.18, 0.18],
    [7.5, -1.3, 1.18, 0.18]
  ] as const) {
    addDetailBox(floorGrid, [x, 0.101, z], [sx, 0.034, sz]);
  }

  // Wall-hugging furniture and security consoles provide scale cues in the
  // otherwise open side rooms.  Their silhouettes stay outside the authored
  // patrol lanes and all visual information remains in this one shared mesh.
  for (const [x, z, sx, sz] of [
    [-8.36, -1.22, 1.28, 0.42], [-8.36, 2.35, 1.28, 0.42],
    [8.36, -1.82, 1.28, 0.42], [8.36, 3.74, 1.28, 0.42],
    [-2.84, 5.62, 1.18, 0.38], [2.84, 5.62, 1.18, 0.38]
  ] as const) {
    addDetailBox(furniture, [x, 0.34, z], [sx, 0.18, sz]);
    addDetailBox(furniture, [x - sx * 0.32, 0.17, z], [0.09, 0.28, sz * 0.74]);
    addDetailBox(furniture, [x + sx * 0.32, 0.17, z], [0.09, 0.28, sz * 0.74]);
  }
  // Two low console banks face the rotunda. Their stepped tops read as
  // security desks at review scale without introducing another actor or
  // pretending to be a gameplay sensor.
  for (const x of [-3.35, 3.35]) {
    addDetailBox(furniture, [x, 0.36, 2.92], [1.36, 0.38, 0.42]);
    addDetailBox(furniture, [x, 0.62, 2.92], [0.88, 0.16, 0.30]);
    addDetailBox(luminous, [x, 0.72, 2.73], [0.52, 0.035, 0.05]);
  }
  addDetailBox(furniture, [0, 0.34, -5.74], [1.95, 0.38, 0.36]);
  addDetailBox(furniture, [0, 0.60, -5.74], [1.25, 0.16, 0.28]);
  addDetailBox(luminous, [0, 0.70, -5.58], [0.78, 0.035, 0.05]);

  // The four FloorLayout display cases are the real LOS/collision cover. Their
  // source GLB is intentionally glass-forward, so a low opaque plinth and
  // edge rails make the cover footprint read at gameplay scale without
  // inventing a second collider or changing the raycast authority. These
  // coordinates exactly mirror FLOOR_1.cases (±7.2 side wings), keeping the
  // architectural prop, route choice, and visible occlusion in one place.
  for (const [x, z] of [
    [-7.2, 0.15], [-7.2, 3.65],
    [7.2, -2.55], [7.2, 2.85]
  ] as const) {
    addDetailBox(cover, [x, 0.17, z], [1.48, 0.3, 1.48]);
    addDetailBox(cover, [x, 0.35, z], [1.22, 0.06, 1.22]);
    // Two narrow inset rails give the cover a front edge and a cool metal
    // material cue that survives the safe renderer's opaque path.
    addDetailBox(cover, [x - 0.67, 0.38, z], [0.035, 0.06, 1.22]);
    addDetailBox(cover, [x + 0.67, 0.38, z], [0.035, 0.06, 1.22]);
    addDetailBox(cover, [x, 0.38, z - 0.67], [1.22, 0.06, 0.035]);
    addDetailBox(cover, [x, 0.38, z + 0.67], [1.22, 0.06, 0.035]);
    // Raise a narrow rear gallery rail above the plinth.  It follows the same
    // four FloorLayout case footprints that own the real LOS/collision cover,
    // so the rendered obstruction and the raycast authority continue to tell
    // the same story.  The glass case asset remains visible in front of it;
    // this is only a dark architectural backboard and a lit edge, not a new
    // gameplay wall.
    addDetailBox(cover, [x, 0.68, z - 0.57], [1.14, 0.58, 0.08]);
    addDetailBox(luminous, [x, 0.94, z - 0.62], [0.76, 0.035, 0.035]);
  }

  // Final structural pass: connect the north service vault to the rotunda
  // with a visible, roofless vestibule.  The FloorLayout already declares
  // these two alcove walls and the service-exit destination; this jamb/lintel
  // treatment simply makes that connection read from the oblique review lens
  // instead of terminating as a flat dark wall.  It adds no collider, route,
  // sensor, or LOS occluder beyond the existing layout authority.
  for (const x of [-1.8, 1.8] as const) {
    addDetailBox(architecture, [x, 1.42, -5.2], [0.24, 2.72, 0.24]);
    addDetailBox(luminous, [x + (x < 0 ? 0.14 : -0.14), 1.78, -5.06], [0.035, 1.7, 0.035]);
  }
  addDetailBox(architecture, [0, 2.78, -5.2], [3.86, 0.24, 0.24]);
  addDetailBox(artwork, [0, 2.78, -5.04], [2.92, 0.09, 0.035]);
  for (const x of [-1.15, -0.38, 0.38, 1.15] as const) {
    addDetailBox(luminous, [x, 2.67, -5.02], [0.16, 0.045, 0.04]);
  }

  return {
    architecture: geometry.define({ positions: architecture.positions, normals: architecture.normals, indices: architecture.indices }),
    artwork: geometry.define({ positions: artwork.positions, normals: artwork.normals, indices: artwork.indices }),
    luminous: geometry.define({ positions: luminous.positions, normals: luminous.normals, indices: luminous.indices }),
    floorGrid: geometry.define({ positions: floorGrid.positions, normals: floorGrid.normals, indices: floorGrid.indices }),
    floorDark: geometry.define({ positions: floorDark.positions, normals: floorDark.normals, indices: floorDark.indices }),
    furniture: geometry.define({ positions: furniture.positions, normals: furniture.normals, indices: furniture.indices }),
    cover: geometry.define({ positions: cover.positions, normals: cover.normals, indices: cover.indices })
  };
}

const MUSEUM_DETAILS = authoredMuseumDetails();

/**
 * Build a thin, two-rail patrol track from the same waypoint loop that drives
 * GuardAgent.  The mesh is deliberately visual-only: it has no collider,
 * sensor, LOS occluder, or movement authority.  Because the route's waypoint
 * arrays are axis-aligned, each segment can remain a clean museum inlay rather
 * than a screen-space line that would cut through walls or props.
 */
function patrolPathGeometry(route: readonly { readonly x: number; readonly z: number }[]): ReturnType<typeof geometry.define> {
  const mesh = detailMesh();
  if (route.length === 0) return geometry.define({ positions: [], normals: [], indices: [] });
  const railWidth = 0.085;
  const railHeight = 0.035;
  for (let index = 0; index < route.length; index += 1) {
    const point = route[index]!;
    const next = route[(index + 1) % route.length]!;
    addDetailBox(mesh, [point.x, 0.118, point.z], [0.23, 0.055, 0.23]);
    const dx = next.x - point.x;
    const dz = next.z - point.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) continue;
    const center: [number, number, number] = [(point.x + next.x) / 2, 0.118, (point.z + next.z) / 2];
    if (Math.abs(dx) >= Math.abs(dz)) {
      addDetailBox(mesh, center, [Math.max(railWidth, Math.abs(dx)), railHeight, railWidth]);
    } else {
      addDetailBox(mesh, center, [railWidth, railHeight, Math.max(railWidth, Math.abs(dz))]);
    }
  }
  return geometry.define({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices });
}

/**
 * Objective plinths mirror the actual FloorLayout pedestal coordinates.  They
 * are authored museum fixtures around the typed pedestal/exhibit pair, not
 * substitute objectives: lifting, collision and scoring still consume the
 * layout records in floor.ts.  The stepped frame gives each target a readable
 * silhouette and a material hierarchy at the roofless review distance.
 */
function objectiveDetailGeometry(layout: FloorLayout): ReturnType<typeof geometry.define> {
  const mesh = detailMesh();
  layout.pedestals.forEach((pedestal, index) => {
    const accent = index % 2 === 0 ? 1 : -1;
    addDetailBox(mesh, [pedestal.x, 0.12, pedestal.z], [1.74, 0.12, 1.5]);
    addDetailBox(mesh, [pedestal.x - 0.76, 0.22, pedestal.z], [0.055, 0.16, 1.42]);
    addDetailBox(mesh, [pedestal.x + 0.76, 0.22, pedestal.z], [0.055, 0.16, 1.42]);
    addDetailBox(mesh, [pedestal.x, 0.22, pedestal.z - 0.68], [1.48, 0.16, 0.055]);
    addDetailBox(mesh, [pedestal.x, 0.22, pedestal.z + 0.68], [1.48, 0.16, 0.055]);
    // A shallow, open rear portal is set behind the real typed pedestal. Keep
    // the centre open so the actual exhibit remains the hero; the paired
    // rails carry the architectural depth without becoming a solid visual
    // wall or introducing a second gameplay occluder into the LOS world.
    addDetailBox(mesh, [pedestal.x, 0.96, pedestal.z - 0.53], [1.42, 0.08, 0.1]);
    addDetailBox(mesh, [pedestal.x, 1.98, pedestal.z - 0.53], [1.42, 0.08, 0.1]);
    addDetailBox(mesh, [pedestal.x - 0.68, 1.38, pedestal.z - 0.53], [0.08, 2.44, 0.1]);
    addDetailBox(mesh, [pedestal.x + 0.68, 1.38, pedestal.z - 0.53], [0.08, 2.44, 0.1]);
    addDetailBox(mesh, [pedestal.x, 2.58, pedestal.z - 0.53], [1.44, 0.08, 0.1]);
    // Small asymmetry makes the two objective suites feel authored rather than
    // mirrored placeholders while remaining outside the objective footprint.
    addDetailBox(mesh, [pedestal.x + accent * 0.48, 0.46, pedestal.z + 0.48], [0.16, 0.22, 0.16]);
  });
  return geometry.define({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices });
}

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
  const detailFloor = material.metal({
    name: "museum floor inlay grid",
    color: "#376276",
    roughness: 0.46,
    metallic: 0.28
  });
  const detailFloorDark = material.metal({
    name: "museum dark floor finish",
    color: "#10151c",
    roughness: 0.42,
    metallic: 0.32
  });
  const detailFurniture = material.metal({
    name: "museum furniture graphite",
    color: "#1b2d3b",
    roughness: 0.36,
    metallic: 0.5
  });
  const detailCover = material.metal({
    name: "museum LOS cover plinths",
    color: "#33506a",
    roughness: 0.32,
    metallic: 0.55
  });
  const detailGlow = material.emissive({
    name: "museum detail practical glow",
    color: "#77e6e5",
    emissive: "#77e6e5",
    emissiveIntensity: 1.12,
    opacity: 0.94
  });
  const patrolOneMaterial = material.emissive({
    name: "archive patrol track inlay",
    color: "#32152a",
    emissive: "#ff5f99",
    emissiveIntensity: 1.05,
    opacity: 0.76
  });
  const patrolTwoMaterial = material.emissive({
    name: "treasury patrol track inlay",
    color: "#123c4b",
    emissive: "#5ee7ff",
    emissiveIntensity: 1.05,
    opacity: 0.76
  });
  const objectiveFrameMaterial = material.metal({
    name: "objective suite brass frame",
    color: "#78612f",
    roughness: 0.24,
    metallic: 0.78
  });
  nodes.push(
    geometry.custom(MUSEUM_DETAILS.architecture, { name: "museum authored architectural detail", material: detailStone })
      .runtime(game.runtimeNode("museum authored architectural detail", { tags: ["typed-set-dressing", "museum-architecture", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(MUSEUM_DETAILS.artwork, { name: "museum authored artwork insets", material: detailArtwork })
      .runtime(game.runtimeNode("museum authored artwork insets", { tags: ["typed-set-dressing", "museum-artwork", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(MUSEUM_DETAILS.floorGrid, { name: "museum authored floor inlay grid", material: detailFloor })
      .runtime(game.runtimeNode("museum authored floor inlay grid", { tags: ["typed-set-dressing", "museum-floor-detail", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(MUSEUM_DETAILS.floorDark, { name: "museum authored dark floor finish", material: detailFloorDark })
      .runtime(game.runtimeNode("museum authored dark floor finish", { tags: ["typed-set-dressing", "museum-floor-detail", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(MUSEUM_DETAILS.furniture, { name: "museum authored furniture and consoles", material: detailFurniture })
      .runtime(game.runtimeNode("museum authored furniture and consoles", { tags: ["typed-set-dressing", "museum-furniture", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(MUSEUM_DETAILS.cover, { name: "museum authored LOS cover plinths", material: detailCover })
      .runtime(game.runtimeNode("museum authored LOS cover plinths", { tags: ["typed-set-dressing", "museum-cover", "physics-los-cover", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(MUSEUM_DETAILS.luminous, { name: "museum authored practical fixtures", material: detailGlow })
      .runtime(game.runtimeNode("museum authored practical fixtures", { tags: ["museum-lighting", "renderer-owned"] }))
      .toJSON(),
    // The two tracks are direct projections of FLOOR_1.guards[].route. They
    // make patrol ownership and room circulation visible in the same frame as
    // the live guard, while remaining subordinate to the typed museum and
    // preserving the physics/LOS authority in floor.ts.
    geometry.custom(patrolPathGeometry(layout.guards[0]?.route ?? []), { name: "guard-1 authored patrol track", material: patrolOneMaterial })
      .runtime(game.runtimeNode("guard-1 authored patrol track", { tags: ["patrol-path", "derived-floor-layout", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(patrolPathGeometry(layout.guards[1]?.route ?? []), { name: "guard-2 authored patrol track", material: patrolTwoMaterial })
      .runtime(game.runtimeNode("guard-2 authored patrol track", { tags: ["patrol-path", "derived-floor-layout", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(objectiveDetailGeometry(layout), { name: "typed objective suite frames", material: objectiveFrameMaterial })
      .runtime(game.runtimeNode("typed objective suite frames", { tags: ["active-objective-context", "museum-architecture", "renderer-owned"] }))
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
    text3D("ARCHIVE", { name: "archive room label", size: 0.74, depth: 0.055, letterSpacing: 0.05, material: roomLabelMaterial })
      .position(-8.28, 2.78, -6.83)
      .runtime(game.runtimeNode("archive room label", { tags: ["museum-wayfinding", "world-label", "renderer-owned"] }))
      .toJSON(),
    text3D("TREASURY", { name: "treasury room label", size: 0.74, depth: 0.055, letterSpacing: 0.05, material: roomLabelMaterial })
      .position(5.78, 2.78, -6.83)
      .runtime(game.runtimeNode("treasury room label", { tags: ["museum-wayfinding", "world-label", "renderer-owned"] }))
      .toJSON(),
    text3D("ROTUNDA", { name: "rotunda room label", size: 0.68, depth: 0.055, letterSpacing: 0.05, material: roomLabelMaterial })
      .position(-1.1, 2.78, -6.83)
      .runtime(game.runtimeNode("rotunda room label", { tags: ["museum-wayfinding", "world-label", "renderer-owned"] }))
      .toJSON(),
    text3D("SERVICE EXIT", { name: "service exit room label", size: 0.52, depth: 0.055, letterSpacing: 0.04, material: roomLabelMaterial })
      .position(-1.42, 2.17, -6.83)
      .runtime(game.runtimeNode("service exit room label", { tags: ["museum-wayfinding", "world-label", "renderer-owned"] }))
      .toJSON()
  );

  nodes.push(...tacticalPlanNodes(layout));

  // The typed museum world is the visible architectural authority. Earlier
  // review passes rendered a second slab, room plan, and wall mesh at the
  // exact same coordinates. That caused dark z-fighting and made the hall
  // read like disconnected blocks. Route geometry below is deliberately only
  // wayfinding and feedback that cannot overlap the typed world.
  const sightlineWash = material.emissive({ name: "museum guard sightline wash", color: "#143c57", emissive: "#54d8ff", emissiveIntensity: 0.7, opacity: 0.45 });

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
      intensity: 1.55
    }).position(7.25, 2.35, 0.4).toJSON(),
    lights.point({
      name: "service-vault-vestibule-practical",
      color: "#8ef5e3",
      intensity: 1.18
    }).position(0, 2.55, -5.15).toJSON(),
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
