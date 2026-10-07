// apps/showcase-gallery-shift/src/v2/scene/world.ts — one union scene for both
// floors. The typed cutaway museum GLB + authored detail meshes (floor 1) and
// the primitive Skyline Wing shell (floor 2) are all mounted once; switching
// floors only toggles floor-scoped runtime nodes and re-poses the shared
// pedestal/exhibit/actor slots, so loading.sceneSwaps stays 0 while
// loading.sceneId reports the logical floor.
import type { AuraNodeInput } from "@aura3d/engine";
import { game as engineGame, geometry, model, primitives, shadows, text3D } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { FLOOR_LAYOUTS, CAMERA_RANGE } from "../../gameplay/floor";
import { createGalleryEnvironment } from "../../legacy/environment";
import {
  alarmBeaconMat,
  cameraConeMat,
  cameraMountMat,
  exitPadMat,
  exitSignMat,
  floorSlabMat,
  guardHarnessMat,
  guardRingMat,
  laserMat,
  marbleWallMat,
  objectiveRingMat,
  poolDiscMat,
  threatBeamMat,
  threatLineMat,
  threatTargetMat,
  threatWedgeMat,
  thiefFocusMat,
  thiefHarnessMat,
  thiefVisorMat
} from "./materials";

export const THIEF_ID = "thief";
export const guardNodeId = (guardId: string) => guardId;
export const pedestalNodeId = (slot: number) => `pedestal-${slot}`;
export const exhibitNodeId = (slot: number, variant: "A" | "B" | "C") => `exhibit-${slot}-${variant}`;
export const poolNodeId = (floorId: number, index: number) => `pool-${floorId}-${index}`;
export const caseNodeId = (caseId: string) => `floor1-case-${caseId}`;
export const sightlineNodeId = (guardId: string) => `${guardId} sightline preview`;
export const cameraConeNodeId = (cameraId: string) => `${cameraId} sweep cone`;
export const threatNodeIds = (guardId: string) => ({
  wedge: `${guardId} threat wedge`,
  beam: `${guardId} threat beam`,
  line: `${guardId} threat line`,
  highlight: `${guardId} threat highlight`,
  source: `${guardId} threat source`,
  ring: `${guardId} live ring`
});
export const flashlightNodeId = (guardId: string) => `${guardId} flashlight`;

// Floor-scoped buckets: ids toggled by setVisible on floor change.
const floor1NodeIds: string[] = [];
const floor2NodeIds: string[] = [];
/** Renderer-owned vision-cone nodes (evidence fx.conesVisible counts these). */
const coneNodeIds: string[] = [];

function track(bucket: string[], id: string, tags: readonly string[]) {
  bucket.push(id);
  return engineGame.runtimeNode(id, { tags });
}
const track1 = (id: string, tags: readonly string[]) => track(floor1NodeIds, id, tags);
const track2 = (id: string, tags: readonly string[]) => track(floor2NodeIds, id, tags);
const trackAlways = (id: string, tags: readonly string[]) => engineGame.runtimeNode(id, { tags });
const trackCone = (bucket: string[], id: string, tags: readonly string[]) => {
  coneNodeIds.push(id);
  return track(bucket, id, tags);
};
const trackAlwaysCone = (id: string, tags: readonly string[]) => {
  coneNodeIds.push(id);
  return engineGame.runtimeNode(id, { tags });
};

// ---- geometries (ported from the legacy threat/cone feedback shapes) --------
const ALERT_WEDGE_GEOMETRY = geometry.define({
  // One flat triangle in local +Z; runtime guard yaw rotates it with the same
  // authored pose used by the real LOS query.
  positions: [[0, 0, 0], [-1.6, 0, 4.6], [1.6, 0, 4.6]],
  normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0]],
  indices: [0, 1, 2],
  bounds: { min: [-1.6, 0, 0], max: [1.6, 0, 4.6] }
});
const ALERT_BEAM_GEOMETRY = geometry.define({
  positions: [
    [-0.11, 0.05, 0], [0.11, 0.05, 0], [0.11, 1.45, 0], [-0.11, 1.45, 0],
    [-0.11, 0.05, 4.6], [0.11, 0.05, 4.6], [0.11, 1.45, 4.6], [-0.11, 1.45, 4.6]
  ],
  normals: [
    [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1],
    [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]
  ],
  indices: [
    1, 0, 3, 1, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 4, 7, 0, 7, 3,
    5, 1, 2, 5, 2, 6,
    3, 7, 6, 3, 6, 2,
    0, 1, 5, 0, 5, 4
  ],
  bounds: { min: [-0.11, 0.05, 0], max: [0.11, 1.45, 4.6] }
});
const ALERT_LINE_GEOMETRY = geometry.define({
  positions: [[-0.11, 0.065, 0], [0.11, 0.065, 0], [0.11, 0.065, 4.6], [-0.11, 0.065, 4.6]],
  normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]],
  indices: [0, 1, 2, 0, 2, 3],
  bounds: { min: [-0.11, 0.065, 0], max: [0.11, 0.065, 4.6] }
});
const CAMERA_CONE_GEOMETRY = geometry.define({
  // Security-camera sweep wedge: 60° FOV (half-angle tan ≈ 0.577) over range 10.
  positions: [[0, 0, 0], [-5.77, 0, CAMERA_RANGE], [5.77, 0, CAMERA_RANGE]],
  normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0]],
  indices: [0, 1, 2],
  bounds: { min: [-5.77, 0, 0], max: [5.77, 0, CAMERA_RANGE] }
});

// ---- floor 1 environment ----------------------------------------------------
/**
 * The typed museum cutaway GLB and its authored detail meshes come from the
 * same builder the legacy route used. We strip every `light` node out of it:
 * the v2 direction owns lighting (spot key + IBL fill + 6 practicals) in
 * scene/lighting.ts, and ambient/fill sources are banned outright.
 */
function environmentNodes(): AuraNodeInput[] {
  const nodes = createGalleryEnvironment(FLOOR_LAYOUTS[0]!) as readonly (AuraNodeInput & { kind?: string })[];
  return nodes.filter((node) => node.kind !== "light");
}

// ---- floor 2 shell ----------------------------------------------------------
function floor2SetNodes(): AuraNodeInput[] {
  const layout = FLOOR_LAYOUTS[1]!;
  const nodes: AuraNodeInput[] = [
    primitives.box({ name: "floor2-slab", material: floorSlabMat })
      .position(0, -0.25, 0)
      .scale([20.4, 0.5, 14.4])
      .runtime(track2("floor2-slab", ["floor2-set", "slab"]))
  ];
  const walls: readonly { readonly id: string; readonly x: number; readonly z: number; readonly sx: number; readonly sz: number }[] = [
    { id: "north", x: 0, z: -7.2, sx: 20.8, sz: 0.4 },
    { id: "south", x: 0, z: 7.2, sx: 20.8, sz: 0.4 },
    { id: "west", x: -10.2, z: 0, sx: 0.4, sz: 14.8 },
    { id: "east", x: 10.2, z: 0, sx: 0.4, sz: 14.8 },
    { id: "alcove-west", x: -1.8, z: -5.2, sx: 2.0, sz: 0.4 },
    { id: "alcove-east", x: 1.8, z: -5.2, sx: 2.0, sz: 0.4 },
    { id: "room-west", x: -3.2, z: 0, sx: 0.4, sz: 4.4 },
    { id: "room-east", x: 3.2, z: 0, sx: 0.4, sz: 4.4 }
  ];
  for (const wall of walls) {
    nodes.push(
      primitives.box({ name: `floor2-wall-${wall.id}`, material: marbleWallMat })
        .position(wall.x, 1.8, wall.z)
        .scale([wall.sx, 3.6, wall.sz])
        .runtime(track2(`floor2-wall-${wall.id}`, ["floor2-set", "wall"]))
    );
  }
  for (const laser of layout.lasers) {
    nodes.push(
      primitives.box({ name: `laser-${laser.id}`, material: laserMat })
        .position(laser.x, 0.9, laser.z)
        .scale([Math.max(0.05, laser.halfX * 2), 0.05, Math.max(0.05, laser.halfZ * 2)])
        .runtime(track2(`laser-${laser.id}`, ["floor2-set", "sensor-laser"]))
    );
  }
  for (const displayCase of layout.cases) {
    nodes.push(
      model(assets.galleryShiftDisplayCase, { name: `case-${displayCase.id}`, role: "setDressing", scaleMode: "fit", targetMaxDimension: 1.0 })
        .position(displayCase.x, 0, displayCase.z)
        .runtime(track2(`case-${displayCase.id}`, ["floor2-set", "typed-asset", "display-case"]))
    );
  }
  // Security cameras: mount head + sweeping vision cone (runtime yaw driven by
  // the authored sweep in vision.ts's cameraYawAt).
  for (const cam of layout.cameras) {
    nodes.push(
      primitives.box({ name: `${cam.id} mount`, material: cameraMountMat })
        .position(cam.x, cam.height, cam.z)
        .scale([0.34, 0.24, 0.42])
        .runtime(track2(`${cam.id} mount`, ["floor2-set", "security-camera"]))
    );
    nodes.push(
      geometry.custom(CAMERA_CONE_GEOMETRY, { name: `${cam.id} sweep cone`, material: cameraConeMat })
        .position(cam.x, 0.12, cam.z)
        .runtime(trackCone(floor2NodeIds, cameraConeNodeId(cam.id), ["floor2-set", "vision-cone", "camera-cone"]))
    );
  }
  return nodes;
}

// ---- light-pool discs (both floors) -----------------------------------------
function lightPoolNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (const layout of FLOOR_LAYOUTS) {
    const bucket = layout.id === 1 ? floor1NodeIds : floor2NodeIds;
    layout.lightPools.forEach((pool, poolIndex) => {
      nodes.push(
        primitives.cylinder({ name: poolNodeId(layout.id, poolIndex), material: poolDiscMat(poolIndex, pool.brightness >= 0.7) })
          .position(pool.x, 0.015, pool.z)
          .scale([pool.radius * 0.9, 0.008, pool.radius * 0.9])
          .runtime(track(bucket, poolNodeId(layout.id, poolIndex), ["light-pool", `floor-${layout.id}`]))
      );
    });
  }
  return nodes;
}

// ---- shared mission slots (pedestals + exhibits, reposed per floor) ---------
function pedestalExhibitNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (let slot = 0; slot < 3; slot += 1) {
    nodes.push(
      model(assets.galleryShiftPedestal, { name: pedestalNodeId(slot), role: "setDressing", scaleMode: "fit", targetMaxDimension: 1.1 })
        .position(0, -20 - slot, 0)
        .runtime(trackAlways(pedestalNodeId(slot), ["typed-asset", "pedestal", "mission-slot"]))
    );
    for (const variant of ["A", "B", "C"] as const) {
      nodes.push(
        model(assets[`galleryShiftExhibit${variant}`], { name: exhibitNodeId(slot, variant), role: "setDressing", scaleMode: "fit", targetMaxDimension: 0.55 })
          .position(0, -20, 0)
          .runtime(trackAlways(exhibitNodeId(slot, variant), ["typed-asset", "exhibit", "mission-slot"]))
      );
    }
  }
  return nodes;
}

// ---- floor-1 display cases + suite displays ---------------------------------
function floor1CaseNodes(): AuraNodeInput[] {
  return FLOOR_LAYOUTS[0]!.cases.map((displayCase) =>
    model(assets.galleryShiftDisplayCase, { name: caseNodeId(displayCase.id), role: "setDressing", scaleMode: "fit", targetMaxDimension: 1.18 })
      .position(displayCase.x, 0, displayCase.z)
      .runtime(track1(caseNodeId(displayCase.id), ["typed-asset", "display-case", "physics-los-cover"]))
  );
}

const SUITE_DISPLAYS: readonly { readonly id: string; readonly x: number; readonly z: number; readonly exhibit: "A" | "B" | "C" }[] = [
  { id: "archive-gallery", x: -8.88, z: -5.72, exhibit: "A" },
  { id: "archive-conservation", x: -8.88, z: 5.52, exhibit: "B" },
  { id: "treasury-vault", x: 8.88, z: -5.72, exhibit: "C" },
  { id: "treasury-exhibition", x: 8.88, z: 5.52, exhibit: "A" },
  { id: "vault-archive", x: -2.25, z: -5.35, exhibit: "C" }
];

function suiteDisplayNodes(): AuraNodeInput[] {
  return SUITE_DISPLAYS.flatMap((display) => [
    model(assets.galleryShiftDisplayCase, { name: `suite-case-${display.id}`, role: "setDressing", scaleMode: "fit", targetMaxDimension: 0.92 })
      .position(display.x, 0, display.z)
      .runtime(track1(`suite-case-${display.id}`, ["typed-asset", "museum-display", "set-dressing"])),
    model(assets[`galleryShiftExhibit${display.exhibit}`], { name: `suite-exhibit-${display.id}`, role: "setDressing", scaleMode: "fit", targetMaxDimension: 0.46 })
      .position(display.x, 0.78, display.z)
      .runtime(track1(`suite-exhibit-${display.id}`, ["typed-asset", "museum-exhibit", "set-dressing"]))
  ]);
}

// ---- exit + alarm -----------------------------------------------------------
function exitAlarmNodes(): AuraNodeInput[] {
  return [
    primitives.box({ name: "exit-pad", material: exitPadMat })
      .position(0, 0.02, -6.3)
      .scale([1.6, 0.03, 1.0])
      .runtime(trackAlways("exit-pad", ["sensor-exit-marker"])),
    primitives.box({ name: "exit-sign", material: exitSignMat })
      .position(0, 2.6, -6.9)
      .scale([1.4, 0.4, 0.08])
      .runtime(trackAlways("exit-sign", ["sensor-exit-marker"])),
    primitives.cylinder({ name: "alarm-beacon", material: alarmBeaconMat })
      .position(0, 3.2, -5.8)
      .scale([0.34, 0.18, 0.34])
      .runtime(trackAlways("alarm-beacon", ["alarm-state"]))
  ];
}

// ---- actors ------------------------------------------------------------------
function thiefNodes(): AuraNodeInput[] {
  const spawn = FLOOR_LAYOUTS[0]!.thiefSpawn;
  return [
    model(assets.showcaseRunnerGirl, { name: THIEF_ID, role: "primaryCharacter", scaleMode: "fit", targetMaxDimension: 2.7 })
      .position(spawn.x, 0, spawn.z)
      .runtime(trackAlways(THIEF_ID, ["typed-asset", "thief", "authored-movement"])),
    primitives.box({ name: "infiltrator identity detail", material: thiefHarnessMat })
      .position(spawn.x, 0, spawn.z)
      .runtime(trackAlways("infiltrator-identity-detail", ["thief-identity", "renderer-owned"])),
    primitives.box({ name: "infiltrator visor signal", material: thiefVisorMat })
      .position(spawn.x, 1.99, spawn.z + 0.19)
      .scale([0.48, 0.07, 0.055])
      .runtime(trackAlways("infiltrator-visor-signal", ["thief-identity", "renderer-owned"])),
    primitives.torus({ name: "thief tactical focus", material: thiefFocusMat })
      .position(spawn.x, 0.07, spawn.z)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.78, 0.78, 0.045])
      .runtime(trackAlways("thief-focus", ["stealth-feedback", "player-focus"])),
    shadows.contact({ name: "thief contact shadow", footprint: [0.88, 0.62], opacity: 0.46, color: "#02040a" })
      .position(spawn.x, 0.018, spawn.z)
      .runtime(trackAlways("thief-contact-shadow", ["stealth-feedback", "contact-grounding"]))
  ];
}

function guardNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (const spawn of FLOOR_LAYOUTS[0]!.guards) {
    const archivePatrol = spawn.id === "guard-1";
    nodes.push(
      model(archivePatrol ? assets.robotcand : assets.showcaseExpressiveRobot, {
        name: spawn.id,
        role: "primaryCharacter",
        scaleMode: "fit",
        targetMaxDimension: archivePatrol ? 3.2 : 3.7
      })
        .position(spawn.x, 0, spawn.z)
        .runtime(trackAlways(spawn.id, ["typed-asset", "guard", "authored-movement"])),
      shadows.contact({
        name: `${spawn.id} contact shadow`,
        footprint: archivePatrol ? [1.58, 1.02] : [0.94, 0.68],
        opacity: 0.5,
        color: "#02040a"
      })
        .position(spawn.x, 0.018, spawn.z)
        .runtime(trackAlways(`${spawn.id}-contact-shadow`, ["stealth-feedback", "contact-grounding"])),
      // The guard's practical flashlight (one of the direction's 6 practicals):
      // a runtime point light the frame loop reposes ahead of the facing.
      primitives.box({ name: `${spawn.id} flashlight`, material: threatTargetMat })
        .position(spawn.x, 1.5, spawn.z)
        .scale([0.12, 0.12, 0.3])
        .runtime(trackAlways(`${spawn.id} flashlight`, ["stealth-feedback", "guard-flashlight"])),
      primitives.torus({ name: threatNodeIds(spawn.id).ring, material: guardRingMat })
        .position(spawn.x, 0.11, spawn.z)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.82, 0.82, 0.065])
        .runtime(trackAlways(threatNodeIds(spawn.id).ring, ["live-stealth-state", "guard-silhouette"]))
    );
    if (!archivePatrol) {
      nodes.push(
        primitives.box({ name: `${spawn.id} sentry identity detail`, material: guardHarnessMat })
          .position(spawn.x, 1.1, spawn.z)
          .scale([0.92, 0.9, 0.92])
          .runtime(trackAlways(`${spawn.id}-sentry-detail`, ["guard-identity", "renderer-owned"]))
      );
    }
    // Real LOS threat feedback (hidden until the same live sighting that
    // drives detection switches them on).
    const ids = threatNodeIds(spawn.id);
    nodes.push(
      geometry.custom(ALERT_WEDGE_GEOMETRY, { name: ids.wedge, material: threatWedgeMat })
        .position(0, 0.16, 0).scale([0.001, 0.001, 0.001])
        .runtime(trackAlwaysCone(ids.wedge, ["stealth-feedback", "vision-cone", "real-los-state"])),
      geometry.custom(ALERT_BEAM_GEOMETRY, { name: ids.beam, material: threatBeamMat })
        .position(0, 0.19, 0).scale([0.001, 0.001, 0.001])
        .runtime(trackAlways(ids.beam, ["stealth-feedback", "vision-centerline", "real-los-state"])),
      geometry.custom(ALERT_LINE_GEOMETRY, { name: ids.line, material: threatLineMat })
        .position(0, 0.08, 0).scale([0.001, 0.001, 0.001])
        .runtime(trackAlways(ids.line, ["stealth-feedback", "vision-floor-rail", "real-los-state"])),
      primitives.torus({ name: ids.highlight, material: threatTargetMat })
        .position(0, 0.08, 0).rotate(Math.PI / 2, 0, 0).scale([0.001, 0.001, 0.06])
        .runtime(trackAlways(ids.highlight, ["stealth-feedback", "vision-target", "real-los-state"])),
      primitives.torus({ name: ids.source, material: threatTargetMat })
        .position(0, 0.12, 0).rotate(Math.PI / 2, 0, 0).scale([0.001, 0.001, 0.08])
        .runtime(trackAlways(ids.source, ["stealth-feedback", "vision-source", "real-los-state"]))
    );
  }
  return nodes;
}

// ---- objective hierarchy -----------------------------------------------------
function objectiveNodes(): AuraNodeInput[] {
  return [
    primitives.torus({ name: "live-objective-ring", material: objectiveRingMat })
      .position(0, -20, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([1.5, 1.5, 0.12])
      .runtime(trackAlways("live-objective-ring", ["live-stealth-state", "active-objective"])),
    text3D("LIFT", { name: "live-lift-label", size: 0.46, depth: 0.05, letterSpacing: 0.04, material: objectiveRingMat, backend: "sdf" })
      .position(0, -20, 0)
      .runtime(trackAlways("live-lift-label", ["live-stealth-state", "world-label"])),
    text3D("EXIT", { name: "live-exit-label", size: 0.46, depth: 0.05, letterSpacing: 0.04, material: objectiveRingMat, backend: "sdf" })
      .position(0, -20, 0)
      .runtime(trackAlways("live-exit-label", ["live-stealth-state", "world-label"]))
  ];
}

// ---- the union scene ----------------------------------------------------------
export interface GalleryWorldNodes {
  readonly nodes: AuraNodeInput[];
  readonly floor1NodeIds: readonly string[];
  readonly floor2NodeIds: readonly string[];
  readonly coneNodeIds: readonly string[];
}

export function galleryWorldNodes(): GalleryWorldNodes {
  const nodes: AuraNodeInput[] = [
    ...environmentNodes(),
    ...floor2SetNodes(),
    ...lightPoolNodes(),
    ...pedestalExhibitNodes(),
    ...floor1CaseNodes(),
    ...suiteDisplayNodes(),
    ...exitAlarmNodes(),
    ...thiefNodes(),
    ...guardNodes(),
    ...objectiveNodes()
  ];
  // Register the floor-1-scoped runtime ids that live inside the shared
  // environment module (typed museum shell + per-guard sightline cones).
  floor1NodeIds.push("museum-interior", sightlineNodeId("guard-1"), sightlineNodeId("guard-2"));
  coneNodeIds.push(sightlineNodeId("guard-1"), sightlineNodeId("guard-2"));
  return {
    nodes,
    floor1NodeIds,
    floor2NodeIds,
    coneNodeIds
  };
}
