/**
 * 3D Museum Gallery Environment for Gallery Shift.
 * Typed cutaway museum architecture, route-truth wayfinding, exhibition
 * spotlights, and atmosphere.
 */
import { game, geometry, primitives, material, lights, model, type AuraSceneNode } from "@aura3d/engine";
import type { FloorLayout } from "./floor";
import { galleryShiftCutawayMuseumWorld } from "./gallery-world-candidate";

const PATROL_WEDGE_GEOMETRY = geometry.define({
  positions: [[0, 0, 0], [-1, 0, 5.8], [1, 0, 5.8]],
  indices: [0, 1, 2],
  bounds: { min: [-1, 0, 0], max: [1, 0, 5.8] }
});
const torus = primitives.torus;

const ROOM_TONES = {
  foyer: { floor: "#123b45", glow: "#4ce2df", light: "#69fff1" },
  rotunda: { floor: "#19386b", glow: "#68a8ff", light: "#84baff" },
  archive: { floor: "#352459", glow: "#b08cff", light: "#c3a5ff" },
  treasury: { floor: "#5a3517", glow: "#ffb84c", light: "#ffd07c" },
  vault: { floor: "#174839", glow: "#65e7ab", light: "#85f6c3" }
} as const;

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

  nodes.push(...tacticalPlanNodes(layout));

  // The typed museum world is the visible architectural authority. Earlier
  // review passes rendered a second slab, room plan, and wall mesh at the
  // exact same coordinates. That caused dark z-fighting and made the hall
  // read like disconnected blocks. Route geometry below is deliberately only
  // wayfinding and feedback that cannot overlap the typed world.
  const objectiveMarker = material.emissive({ name: "museum objective marker", color: "#4c2508", emissive: "#ffc857", emissiveIntensity: 0.82, opacity: 0.92 });
  const sightlineWash = material.emissive({ name: "museum guard sightline wash", color: "#143c57", emissive: "#54d8ff", emissiveIntensity: 0.38, opacity: 0.2 });

  nodes.push(
    // A gold objective ring and beacon frame each wing's exhibit bay. The
    // typed pedestal/exhibit remains the primary subject at runtime.
    ...[-6.5, 6.5].flatMap((x, index) => [
      torus({ name: `museum-objective-ring-${index}`, material: objectiveMarker })
        .position(x, 0.06, -4.2)
        .scale([0.82, 0.82, 0.045])
        .rotate(1.5708, 0, 0)
        .toJSON(),
    ]),
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
      intensity: 1.02
    }).toJSON(),
    // Cool Moonlight Key Light (South-to-North)
    lights.directional({
      name: "museum-moonlight-south",
      color: "#e2e8f0",
      intensity: 1.24
    }).position(-5, 16, 9).toJSON(),
    // Museum Key Light (North-to-South)
    lights.directional({
      name: "museum-moonlight-north",
      color: "#cbd5e1",
      intensity: 1.16
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

  // ---------------- Rotunda Centerpiece Inlay ----------------
  nodes.push(
    // Outer Gold Inlay Ring
    primitives
      .torus({
        name: "rotunda-gold-ring",
        material: material.metal({
          name: "gold-ring-mat",
          color: "#f59e0b",
          roughness: 0.2,
          metallic: 0.95
        })
      })
      .position(0, 0.02, 0)
      .scale([1.62, 1.62, 0.055])
      .rotate(1.5708, 0, 0)
      .toJSON(),
    // Inner Emerald Medallion
    primitives
      .cylinder({
        name: "rotunda-center-medallion",
        material: material.pbr({
          name: "medallion-mat",
          color: "#064e3b",
          roughness: 0.3,
          metallic: 0.4
        })
      })
      .position(0, 0.01, 0)
      .scale([1.18, 0.02, 1.18])
      .toJSON()
  );

  return nodes;
}
