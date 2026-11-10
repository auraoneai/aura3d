/**
 * Shape Shift Sprint world on `@aura3d/engine` 5.5.1 (WP-15 kinetic morph-runner overhaul):
 * - Studio hero IBL + 2-cascade 2048 shadowed sun key + cool sky rim fill (zero `lights.ambient`),
 * - Distinct multi-lobe PBR materials across morph states (`carPaint` flake sphere, `clearcoatPaint` cube +
 *   hydro-glow hover cushion, `lacquer` anodized glider-cone),
 * - Molded 3D cutout gates + bevelled collars + 4 sculpted 3D pickup medallions in `CORRIDOR_BOUNDS` batches,
 * - Iridescent thin-film Fresnel shield bubble + `createFlipbookAtlas("plasma")` morph/perfect shockwave +
 *   `effects.auroraRibbon`,
 * - `contactShadows` + `ambientOcclusion` + track `screenSpaceReflections` + `cinematicBloom` + `godRays` + `depthOfField`,
 * - 6 Milestone Toybox Worlds smoothly blended via dual-backend GLSL + WGSL uniforms.
 */
import { camera, effects, environments, geometry, group, lights, material, model, scene, type AuraApp } from "@aura3d/engine";
import { labCameraOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import {
  Batch,
  CORRIDOR_BOUNDS,
  GameRng,
  Slots,
  hexToLinear,
  scrollFrameZ,
  shadowSpec,
  type CustomSpec,
  type MeshData,
  type Rgb
} from "../../../examples/shared/runner-kit/index";
import { createFlipbookAtlas } from "../../showcase-port-shared/vfx-pack";
import { POOL, type Segment, type ShapeShiftSim, type Token, type WallRow } from "./sim";
import {
  LOOK,
  ROAD_LINEAR,
  SHAPE_LINEAR,
  SUN_DIRECTION,
  TOKEN_LINEAR,
  WALL_LINEAR,
  sampleToyboxWorld
} from "./look";
import {
  MESHY_PIECES,
  PILLAR_COUNT,
  PILLAR_SPACING,
  SCENERY,
  SEA_TILE,
  SKIRT_DIMS,
  bubbleShieldSpec,
  cloudSeaTile,
  contactSpec,
  driftSpec,
  hydroGlowSpec,
  layerGeometry,
  meshyPose,
  morphPlasmaSpec,
  pillarMesh,
  ringSpec,
  sceneryProgramSpecs,
  skirtMesh,
  tonedGeometry,
  toySkySpec,
  toyToonSpec,
  wallContactMesh
} from "./scenery";
import {
  WALL_DIMS,
  confettiMesh,
  groundQuad,
  mergeMeshes,
  playerMesh,
  rimMesh,
  roadSegmentMesh,
  roadTones,
  sphereMesh,
  tokenMesh,
  wallCellMesh
} from "./meshes";
import { shakeOffset, type CameraPose, type Shown } from "./presentation";
import { assets as modelAssets } from "./aura-model-assets";

type SceneBuilder = ReturnType<typeof scene>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

const TRAIL_MAX = 24;
/** Gameplay surfaces stay crisp out to the fog start so approaching walls keep full contrast. */
const GAME_FOG_START = 52;
const CLOUD_MAX = 8;
const PLAYER_BASE_Y = [0.55, 0.48, 0.55] as const;
export const BATCH_IDS = ["road", "walls", "rims", "tokens", "particles", "clouds", "wall-contact"] as const;
export const PLAYER_IDS = ["player-0", "player-1", "player-2"] as const;

const MORPH_PLASMA_ATLAS = createFlipbookAtlas("plasma", [255, 236, 178]);

/** Vertical XY billboard quad facing +Z toward the chase camera (for plasma flipbook bursts). */
function billboardQuad(w: number, h: number): MeshData {
  const x = w / 2, y = h / 2;
  return {
    positions: [-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

/** One confetti-trail chip (presentation only). */
export interface TrailChip { life: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; color: number }

/**
 * Advance a live trail chip by `dt`; returns false once its life has run out. A chip whose life reaches exactly 0
 * (or below) must not be drawn: its scale would be 0 (or negative), and `Batch.place` divides normals by the scale,
 * so a zero scale writes NaN normals and the next `flush` throws `attribute "normal" update must contain finite values`.
 */
export function advanceTrailChip(chip: TrailChip, dt: number): boolean {
  chip.life -= dt;
  if (!(chip.life > 0)) return false;
  chip.x += chip.vx * dt;
  chip.y += chip.vy * dt;
  chip.z += chip.vz * dt;
  chip.vy -= 7 * dt;
  return true;
}

/** Draw scale of a live trail chip: shrinks over its last 0.3 s, never below a small positive floor. */
export function trailChipScale(life: number): number {
  return Math.max(1e-3, 0.12 * Math.min(1, life / 0.3));
}

export type PostMode = "lite" | "full" | "bloom" | "off";

export interface WorldOptions {
  readonly sim: ShapeShiftSim;
  readonly aspect: number;
  readonly post?: PostMode;
}

export interface WorldView {
  readonly shown?: Shown;
  readonly camera?: CameraPose;
  readonly reducedMotion?: boolean;
  readonly impactShake?: readonly [number, number, number];
  readonly impactRoll?: number;
  readonly impactFovDeg?: number;
  readonly burstTrigger?: "morph" | "perfect" | null;
}

export interface WorldRuntime {
  update(sim: ShapeShiftSim, aspect: number, view?: WorldView): void;
  warm(on: boolean): void;
  readonly nodeCount: number;
  readonly uploadedVertices: number;
}

export interface World {
  readonly scene: SceneBuilder;
  bind(app: AuraApp): WorldRuntime;
}

const dyn = (m: MeshData) => geometry.dynamic({
  positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals),
  uvs: Float32Array.from(m.uvs), indices: Uint32Array.from(m.indices)
});

const scaled = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const TOKEN_VARIANT_INDEX: Record<Token["type"], number> = { morph: 0, wildcard: 1, shield: 2, x2: 3 };

/** Every distinct `material.custom` program the game draws with (for the GLSL compile & WGSL twin tests). */
export function allProgramSpecs(): readonly { readonly name: string; readonly spec: CustomSpec }[] {
  return [
    ...sceneryProgramSpecs(),
    { name: "bubble-shield", spec: bubbleShieldSpec(hexToLinear(LOOK.tokenColors.shield), 0.52) },
    { name: "hydro-glow", spec: hydroGlowSpec(hexToLinear("#38e8ff"), hexToLinear(LOOK.shapes[1]!), 0.62) },
    { name: "morph-plasma", spec: morphPlasmaSpec(MORPH_PLASMA_ATLAS) },
    { name: "ring-wildcard", spec: ringSpec(hexToLinear(LOOK.tokenColors.wildcard), 0.85) },
    { name: "shadow", spec: shadowSpec() }
  ];
}

export function buildWorld(options: WorldOptions): World {
  const builder = scene()
    .background(LOOK.skyStops[LOOK.skyStops.length - 1]!.hex)
    .camera(camera.perspective({
      ...labCameraOptions(readLabFlags(), "reversed"),
      position: [0, 14, 17],
      target: [0, 0.55, -10],
      fov: 55,
      near: 0.1,
      far: 600
    }));

  // Blended overlays never cast shadows (prevents opaque shadow blocks / DEPTH_ALPHA_HASH_DEGRADED).
  const shadowFlags = (spec: CustomSpec, cast = false, receive = false) =>
    spec.transparent ? { castShadow: false, receiveShadow: false } : { castShadow: cast, receiveShadow: receive };

  const add = (id: string, mesh: MeshData, spec: CustomSpec, cast = false, receive = false): void => {
    builder.add(geometry.custom(dyn(mesh), { name: id, material: material.custom(spec), ...shadowFlags(spec, cast, receive) }).runtime({ id }));
  };
  const addBatch = (id: string, batch: Batch, spec: CustomSpec, cast = false, receive = false): void => {
    builder.add(geometry.custom(batch.geometry(), { name: id, material: material.custom(spec), ...shadowFlags(spec, cast, receive) }).runtime({ id }));
  };

  add("sky", sphereMesh(280, 32, 20), toySkySpec());

  // Studio hero IBL + single 2-cascade 2048 shadowed sun key + cool sky rim fill (ZERO lights.ambient).
  builder.add(environments.productHero({ name: "world-environment", intensity: 0.95, background: false }));
  builder.add(lights.directional({
    name: "sun-key",
    position: [SUN_DIRECTION[0] * 100, SUN_DIRECTION[1] * 100, SUN_DIRECTION[2] * 100],
    target: [0, 0, -8],
    intensity: 1.85,
    color: "#fff6e0",
    shadow: { cascades: 2, mapSize: 2048, maxDistance: 120 }
  }));
  builder.add(lights.directional({
    name: "sky-rim-fill",
    position: [-44, 34, -56],
    target: [0, 0, -10],
    intensity: 0.44,
    color: "#b8dcff"
  }));

  const road = new Batch(roadSegmentMesh(), POOL.segments, roadTones(), CORRIDOR_BOUNDS);
  addBatch("road", road, toyToonSpec(ROAD_LINEAR, { tone: true, rim: 0.06, clearcoat: 0.56, fogStart: GAME_FOG_START }), false, true);
  add("road-skirt", skirtMesh(), toyToonSpec([1, 1, 1], {
    rim: 0.14, clearcoat: 0.34, fogStart: GAME_FOG_START, stripes: [hexToLinear(SCENERY.coral), hexToLinear(SCENERY.cream), SKIRT_DIMS.period]
  }), false, true);

  const wallMeshes = [wallCellMesh(0), wallCellMesh(1), wallCellMesh(2)] as const;
  const walls = new Batch(wallMeshes[0], POOL.rows * 3, null, CORRIDOR_BOUNDS);
  addBatch("walls", walls, toyToonSpec(WALL_LINEAR, { rim: 0.14, clearcoat: 0.38, fogStart: GAME_FOG_START }), true, true);

  const contact = new Batch(wallContactMesh(WALL_DIMS.cellWidth, 1.15), POOL.rows * 3, null, CORRIDOR_BOUNDS);
  addBatch("wall-contact", contact, contactSpec(0.32));

  const rimMeshes = [rimMesh(0), rimMesh(1), rimMesh(2)] as const;
  const rims = new Batch(rimMeshes[0], POOL.rows * 3, [1, 1, 1], CORRIDOR_BOUNDS);
  addBatch("rims", rims, toyToonSpec([1, 1, 1], { tone: true, rim: 0.24, clearcoat: 0.64, fogStart: GAME_FOG_START }), true, false);

  const tokenMeshes = [tokenMesh(0), tokenMesh(1), tokenMesh(2), tokenMesh(3)] as const;
  const tokens = new Batch(tokenMeshes[0], POOL.tokens, [1, 1, 1], CORRIDOR_BOUNDS);
  addBatch("tokens", tokens, toyToonSpec([1, 1, 1], { tone: true, rim: 0.36, clearcoat: 0.68, fogStart: GAME_FOG_START }), true, false);

  // Distinct multi-lobe hero materials across the 3 morph forms:
  // 0: Crimson metallic-flake carPaint sphere
  // 1: Solar clearcoatPaint hover-cube
  // 2: Cobalt anodized lacquer glider-cone
  const playerMaterials = [
    material.carPaint({
      name: "sphere-car-paint",
      color: LOOK.shapes[0],
      roughness: 0.24,
      metallic: 0.52,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.48
    }),
    material.clearcoatPaint({
      name: "cube-clearcoat-paint",
      color: LOOK.shapes[1],
      roughness: 0.08,
      metallic: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.018,
      envMapIntensity: 1.56
    }),
    material.lacquer({
      name: "cone-anodized-lacquer",
      color: LOOK.shapes[2],
      roughness: 0.22,
      metallic: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.024,
      envMapIntensity: 1.42
    })
  ] as const;

  for (let i = 0; i < 3; i++) {
    builder.add(
      geometry.custom(dyn(playerMesh(i)), {
        name: `player-${i}`,
        material: playerMaterials[i]!,
        castShadow: true,
        receiveShadow: true
      }).runtime({ id: `player-${i}` })
    );
  }

  add("ball-shadow", groundQuad(2, 2), shadowSpec());
  add("hydro-glow", groundQuad(2.2, 2.5), hydroGlowSpec(hexToLinear("#38e8ff"), hexToLinear(LOOK.shapes[1]!), 0.62));
  add("shield", sphereMesh(1, 24, 16), bubbleShieldSpec(hexToLinear(LOOK.tokenColors.shield), 0.52));
  add("wildcard-ring", groundQuad(2.05, 2.05), ringSpec(hexToLinear(LOOK.tokenColors.wildcard), 0.88));
  add("morph-plasma", billboardQuad(2.7, 2.7), morphPlasmaSpec(MORPH_PLASMA_ATLAS));

  builder.add(
    effects.auroraRibbon({
      name: "morph-ribbon",
      width: 2.5,
      height: 1.05,
      segments: 48,
      color: "#4be8ff",
      colorTop: "#ff9ce3",
      intensity: 1.25,
      sway: 1.15,
      shimmer: 0.85
    }).position(0, -50, -60).runtime({ id: "morph-ribbon" })
  );

  const particles = new Batch(confettiMesh(), POOL.particles + TRAIL_MAX, [1, 1, 1], CORRIDOR_BOUNDS);
  addBatch("particles", particles, toyToonSpec([1, 1, 1], { tone: true, rim: 0.16, clearcoat: 0.45, fogStart: GAME_FOG_START }));

  const puff = mergeMeshes([sphereMesh(2.2, 12, 8), sphereMesh(1.5, 12, 8, -1.8, -0.4, 0), sphereMesh(1.3, 12, 8, 1.7, -0.6, 0.4)]);
  const clouds = new Batch(puff, CLOUD_MAX, null, CORRIDOR_BOUNDS);
  addBatch("clouds", clouds, toyToonSpec(hexToLinear(LOOK.cloud), { rim: 0.35, clearcoat: 0.18 }));

  /* Toybox Skyway scenery: cloud sea, bridge pillars, floating toy islands, Meshy castles & block towers. */
  const seaTile = cloudSeaTile(SEA_TILE.w, SEA_TILE.d, 3);
  for (let i = 0; i < SEA_TILE.count; i++) {
    builder.add(
      geometry.custom(tonedGeometry(i === 0 ? seaTile : cloudSeaTile(SEA_TILE.w, SEA_TILE.d, 3 + i)), {
        name: `sea-${i}`,
        material: material.custom(toyToonSpec([1, 1, 1], { tone: true, rim: 0.25, clearcoat: 0.12 }))
      }).position(0, SEA_TILE.y, SEA_TILE.d * 0.6 - (i + 0.5) * SEA_TILE.d)
    );
  }
  const pillar = pillarMesh();
  for (let i = 0; i < PILLAR_COUNT; i++) {
    builder.add(
      group(`pillar-${i}`, [
        geometry.custom(tonedGeometry(pillar), {
          name: `pillar-${i}-mesh`,
          material: material.custom(toyToonSpec([1, 1, 1], { tone: true, rim: 0.15, clearcoat: 0.32 })),
          receiveShadow: true
        })
      ]).runtime({ id: `pillar-${i}` })
    );
  }
  for (const layer of [0, 1, 2] as const) {
    builder.add(geometry.custom(layerGeometry(layer), { name: `isles-${layer}`, material: material.custom(driftSpec(0.2)) }));
  }
  for (const p of MESHY_PIECES) {
    const pose = meshyPose(p, 0, false);
    builder.add(
      model(modelAssets[p.kind], { name: p.id, targetMaxDimension: p.size, castShadow: true, receiveShadow: true })
        .position(pose.x, pose.y, pose.z).rotation(0, pose.yaw, 0).scale(pose.scale).runtime({ id: p.id })
    );
  }

  /* Post-processing stack: full skyway studio pipeline by default, ?post=lite|bloom|off supported. */
  const post = options.post ?? "full";
  if (post === "full") {
    builder
      .add(effects.contactShadows({ length: 0.24, thickness: 0.05, steps: 16, intensity: 0.6, lights: "sun" }))
      .add(effects.ambientOcclusion({ name: "toybox ao", intensity: 0.44, radius: 0.38 }))
      .add(effects.screenSpaceReflections({ name: "track ssr", intensity: 0.45, maxDistance: 16, roughness: 0.2, thickness: 0.25 }))
      .add(effects.cinematicBloom({ name: "bloom", threshold: 1.08, intensity: 0.24, radius: 0.38 }))
      .add(effects.godRays({ name: "sun shafts", source: "sun", intensity: 0.16, decay: 0.92, samples: 32, color: "#ffe7bf", medium: 0.1 }))
      .add(effects.depthOfField({ name: "island dof", focusDistance: 26, fStop: 6.4, focalLength: 32, maxBlur: 1.5 }))
      .add(effects.colorGrade({ name: "grade", contrast: 1.08, saturation: 1.12 }))
      .add(effects.vignette({ name: "vignette", intensity: 0.18, color: "#2d2346" }));
  } else if (post === "bloom") {
    builder.add(effects.cinematicBloom({ name: "bloom", threshold: 1.04, intensity: 0.26, radius: 0.38 }));
  } else if (post === "lite") {
    builder
      .add(effects.contactShadows({ length: 0.22, thickness: 0.05, steps: 12, intensity: 0.52, lights: "sun" }))
      .add(effects.colorGrade({ name: "grade", contrast: 1.08, saturation: 1.12 }))
      .add(effects.vignette({ name: "vignette", intensity: 0.18, color: "#2d2346" }));
  }

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, NodeHandle>();
      const node = (id: string): NodeHandle => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const maybeController = app.camera;
      if (!maybeController) throw new Error("shape-shift-sprint: the app exposes no camera controller");
      const controller: NonNullable<typeof maybeController> = maybeController;

      const segSlots = new Slots<Segment>(POOL.segments);
      const rowSlots = new Slots<WallRow>(POOL.rows);
      const tokenSlots = new Slots<Token>(POOL.tokens);
      const rimKey: number[] = Array.from({ length: POOL.rows * 3 }, () => -1);
      const tokenKey: string[] = Array.from({ length: POOL.tokens }, () => "");
      const particleShown: boolean[] = Array.from({ length: POOL.particles + TRAIL_MAX }, () => false);
      const particleColor: string[] = Array.from({ length: POOL.particles + TRAIL_MAX }, () => "");
      let cloudsPlaced = false;
      let lastElapsed = -1;
      let lastDistance = -1;
      let lastShapeIndex = -1;
      let prevPlayerX = 0;
      let steerBank = 0;
      let sphereSpinZ = 0;
      let morphPopTimer = 0;
      let plasmaTimer = 0;
      let plasmaTint: Rgb = SHAPE_LINEAR[0] as Rgb;
      let worldCursor = 0;
      let lastUploadedWorld = -999;

      // Presentation-only confetti trail: its own counted stream, never the gameplay RNG.
      const trailRng = new GameRng(0x511a7);
      const trail: TrailChip[] = Array.from({ length: TRAIL_MAX }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, color: 0 }));
      let trailAcc = 0;
      let trailCursor = 0;

      const worldLitNodes = ["road", "road-skirt", "walls", "rims", "tokens", "particles", "clouds"] as const;
      function syncMilestoneWorld(targetMilestone: number, dt: number, snap: boolean): void {
        if (snap) worldCursor = targetMilestone;
        else worldCursor += (targetMilestone - worldCursor) * Math.min(1, dt * 1.6);
        if (Math.abs(worldCursor - lastUploadedWorld) < 0.003) return;
        lastUploadedWorld = worldCursor;
        const w = sampleToyboxWorld(worldCursor);
        const sky = node("sky");
        sky.setUniform?.("zenithColor", [...w.zenith]);
        sky.setUniform?.("midColor", [...w.mid]);
        sky.setUniform?.("lowColor", [...w.low]);
        sky.setUniform?.("fogColor", [...w.fog]);
        sky.setUniform?.("fogLow", [...w.fogLow]);
        sky.setUniform?.("sunTint", [...w.sunTint]);
        for (const id of worldLitNodes) {
          const h = node(id);
          h.setUniform?.("fogColor", [...w.fog]);
          h.setUniform?.("fogLow", [...w.fogLow]);
          h.setUniform?.("sunTint", [...w.sunTint]);
        }
      }

      function placeClouds(): void {
        const spots: readonly (readonly [number, number, number, number])[] = [
          [-16, 14, -60, 1.4], [18, 17, -80, 1.8], [-26, 19, -110, 2.2], [12, 13, -45, 1.1],
          [30, 21, -125, 2.4], [-10, 16, -95, 1.6], [24, 12, -55, 1.0], [-32, 15, -75, 1.5]
        ];
        spots.forEach(([x, y, z, s], i) => clouds.place(i, x, y, z, 0, s, s * 0.7, s));
        clouds.flush(node("clouds"));
        cloudsPlaced = true;
      }

      function updateScenery(scrollNow: number, elapsedNow: number, reducedNow: boolean): void {
        const pillarSpan = PILLAR_SPACING * PILLAR_COUNT;
        for (let i = 0; i < PILLAR_COUNT; i++) {
          const z = ((((i * PILLAR_SPACING + scrollNow) % pillarSpan) + pillarSpan) % pillarSpan) - pillarSpan + 30;
          node(`pillar-${i}`).setPosition(0, 0, z);
        }
        for (const piece of MESHY_PIECES) {
          const pose = meshyPose(piece, elapsedNow, reducedNow);
          node(piece.id).setPosition(pose.x, pose.y, pose.z).setRotation(0, pose.yaw, 0).setScale(pose.scale);
        }
      }

      function writeParticle(i: number, x: number, y: number, z: number, yaw: number, scale: number, color: string, rgb: Rgb): void {
        particles.place(i, x, y, z, yaw, scale, scale, scale);
        if (particleColor[i] !== color) {
          particles.setTone(i, rgb);
          particleColor[i] = color;
        }
        particleShown[i] = true;
      }

      function update(simNow: ShapeShiftSim, aspect: number, view: WorldView = {}): void {
        const o = simNow.o;
        const elapsed = simNow.elapsed;
        const scroll = simNow.scroll;
        const p = simNow.player;
        const reduced = view.reducedMotion === true;
        const dt = lastElapsed < 0 ? 0 : Math.min(0.1, Math.max(0, elapsed - lastElapsed));
        const restarted = lastDistance < 0 || o.distance < lastDistance - 1;
        if (restarted) {
          for (const chip of trail) chip.life = 0;
          prevPlayerX = p.x;
          steerBank = 0;
          sphereSpinZ = 0;
          morphPopTimer = 0;
          plasmaTimer = 0;
          lastShapeIndex = o.shapeIndex;
        }
        lastElapsed = elapsed;
        lastDistance = o.distance;

        syncMilestoneWorld(o.milestone, dt, restarted || reduced);

        /* Trigger snappy morph/perfect plasma burst + elastic pop */
        if (o.phase === "playing" && o.shapeIndex !== lastShapeIndex && lastShapeIndex >= 0) {
          morphPopTimer = 0.34;
          plasmaTimer = 0.42;
          plasmaTint = SHAPE_LINEAR[o.shapeIndex] as Rgb;
        }
        lastShapeIndex = o.shapeIndex;
        if (view.burstTrigger === "morph" || view.burstTrigger === "perfect") {
          plasmaTimer = 0.42;
          plasmaTint = view.burstTrigger === "perfect" ? hexToLinear("#ffe066") : (SHAPE_LINEAR[o.shapeIndex] as Rgb);
          if (view.burstTrigger === "morph") morphPopTimer = 0.34;
        }

        /* road (scrolling frame) */
        segSlots.retain(simNow.segments, (slot) => road.collapse(slot));
        for (const seg of simNow.segments) {
          const { slot, fresh } = segSlots.use(seg);
          if (slot >= 0 && fresh) road.place(slot, 0, 0, scrollFrameZ(seg.z, scroll), 0, 1, 1, 1);
        }
        node("road").setPosition(0, 0, scroll);
        node("road-skirt").setPosition(0, 0, ((scroll % SKIRT_DIMS.period) + SKIRT_DIMS.period) % SKIRT_DIMS.period);
        road.flush(node("road"), false);

        /* molded 3D cutout wall cells + 3D bevelled shape collars (scrolling frame) */
        let nearestGateDist = 99;
        rowSlots.retain(simNow.rows, (slot) => {
          for (let i = 0; i < 3; i++) {
            walls.collapse(slot * 3 + i);
            contact.collapse(slot * 3 + i);
            rims.collapse(slot * 3 + i);
            rimKey[slot * 3 + i] = -1;
          }
        });
        for (const row of simNow.rows) {
          const dGate = Math.abs(row.z - p.z);
          if (dGate < nearestGateDist) nearestGateDist = dGate;
          const { slot, fresh } = rowSlots.use(row);
          if (slot < 0) continue;
          const z = scrollFrameZ(row.z, scroll);
          row.holes.forEach((hole, i) => {
            const idx = slot * 3 + i;
            if (fresh) {
              walls.place(idx, hole.laneX, 0, z, 0, 1, 1, 1, wallMeshes[hole.shapeIndex]);
              contact.place(idx, hole.laneX, 0.025, z + WALL_DIMS.thickness / 2, 0, 1, 1, 1);
              rims.place(idx, hole.laneX, WALL_DIMS.openingCenterY, z + WALL_DIMS.thickness / 2 + 0.005, 0, 1, 1, 1, rimMeshes[hole.shapeIndex]);
            }
            const fits = hole.shapeIndex === o.shapeIndex || o.wildcardTimer > 0;
            const matched = row.resolved && row.matchedLane === i;
            const pulse = fits && !reduced ? 0.14 * (0.5 + 0.5 * Math.sin(elapsed * 7.5)) : 0;
            const glow = matched ? LOOK.rimGlowMatched : fits ? LOOK.rimGlow + pulse : 0;
            const key = hole.shapeIndex * 200 + Math.round(glow * 50);
            if (rimKey[idx] !== key) {
              rims.setTone(idx, scaled(SHAPE_LINEAR[hole.shapeIndex] as Rgb, 1 + glow));
              rimKey[idx] = key;
            }
          });
        }
        node("walls").setPosition(0, 0, scroll);
        node("wall-contact").setPosition(0, 0, scroll);
        node("rims").setPosition(0, 0, scroll);
        walls.flush(node("walls"));
        contact.flush(node("wall-contact"), false);
        rims.flush(node("rims"));

        /* sculpted 3D pickup medallions (scrolling frame with gentle spin + bob) */
        tokenSlots.retain(simNow.tokens, (slot) => { tokens.collapse(slot); tokenKey[slot] = ""; });
        for (const t of simNow.tokens) {
          const { slot, fresh } = tokenSlots.use(t);
          if (slot < 0) continue;
          const variant = TOKEN_VARIANT_INDEX[t.type];
          const bob = reduced ? 0 : Math.sin(elapsed * 4.2 + t.z * 0.25) * 0.09;
          const yaw = reduced ? 0 : elapsed * 2.4 + t.z * 0.15;
          if (fresh || (!reduced && dt > 0)) {
            tokens.place(slot, t.laneX, t.baseY + bob, scrollFrameZ(t.z, scroll), yaw, 1, 1, 1, tokenMeshes[variant]);
          }
          const morphIndex = Math.floor(elapsed * 2.5) % 3;
          const key = t.type === "morph" ? `morph${morphIndex}` : t.type;
          if (tokenKey[slot] !== key) {
            tokens.setTone(slot, t.type === "morph" ? (SHAPE_LINEAR[morphIndex] as Rgb) : TOKEN_LINEAR[t.type]);
            tokenKey[slot] = key;
          }
        }
        node("tokens").setPosition(0, 0, scroll);
        tokens.flush(node("tokens"));

        /* player forms: cube corner-lift physics, sphere steer roll, cone glider hop+bank, gate squeeze & morph pop */
        if (dt > 0) {
          const vx = Math.max(-18, Math.min(18, (p.x - prevPlayerX) / dt));
          prevPlayerX = p.x;
          steerBank += (vx * 0.038 - steerBank) * Math.min(1, dt * 14);
          sphereSpinZ -= vx * dt * 1.4;
          if (morphPopTimer > 0) morphPopTimer = Math.max(0, morphPopTimer - dt);
          if (plasmaTimer > 0) plasmaTimer = Math.max(0, plasmaTimer - dt);
        }

        const baseY = PLAYER_BASE_Y[o.shapeIndex] as number;
        const gateWave = !reduced && nearestGateDist < 0.95 ? Math.cos((nearestGateDist / 0.95) * (Math.PI / 2)) : 0;
        const popWave = !reduced && morphPopTimer > 0 ? Math.sin((morphPopTimer / 0.34) * Math.PI * 1.5) * (morphPopTimer / 0.34) * 0.22 : 0;
        const syFactor = Math.max(0.75, 1 + 0.12 * gateWave + popWave);
        const sxzFactor = 1 / Math.sqrt(syFactor);

        // Exact cube corner-lift so tumbling bevelled cube corners never clip below y = 0.
        const cubeCornerLift = o.shapeIndex === 1 && !reduced
          ? baseY * p.scale * (Math.SQRT2 - 1) * Math.abs(Math.sin(p.rotX * 2))
          : 0;
        const coneHop = o.shapeIndex === 2 && !reduced && o.phase === "playing"
          ? 0.055 * p.scale * (0.5 + 0.5 * Math.sin(elapsed * 8.5))
          : 0;
        const playerCenterY = baseY * p.scale * syFactor + cubeCornerLift + coneHop;

        for (let i = 0; i < 3; i++) {
          const h = node(`player-${i}`);
          const on = i === o.shapeIndex && p.visible && o.phase !== "splash";
          h.setVisible(on);
          if (on) {
            h.setPosition(p.x, playerCenterY, p.z)
              .setScale([p.scale * sxzFactor, p.scale * syFactor, p.scale * sxzFactor]);
            if (i === 0) {
              h.setRotation(p.rotX, 0, reduced ? 0 : sphereSpinZ);
            } else if (i === 1) {
              h.setRotation(p.rotX, 0, reduced ? 0 : -steerBank * 0.75);
            } else {
              h.setRotation(reduced ? 0 : -0.1, elapsed * 2.2, reduced ? 0 : -steerBank * 1.15);
            }
          }
        }

        const playerShown = p.visible && o.phase !== "splash";
        node("ball-shadow")
          .setVisible(playerShown)
          .setPosition(p.x, 0.035, p.z)
          .setScale(p.scale * 0.9 * sxzFactor);

        const hydroOn = playerShown && o.phase === "playing" && (o.shapeIndex !== 0 || o.multiplier >= 3);
        const hydroNode = node("hydro-glow").setVisible(hydroOn);
        if (hydroOn) {
          const hydroTint = SHAPE_LINEAR[o.shapeIndex] as Rgb;
          hydroNode
            .setPosition(p.x, 0.042, p.z + 0.12)
            .setScale(p.scale * (1.05 + 0.06 * Math.sin(elapsed * 7)));
          hydroNode.setUniform?.("accentColor", [...hydroTint]);
        }

        const shieldOn = o.shieldActive && o.phase === "playing";
        node("shield").setVisible(shieldOn);
        if (shieldOn) {
          node("shield")
            .setPosition(p.x, playerCenterY, p.z)
            .setScale(p.scale * (1.04 + 0.04 * Math.sin(elapsed * 4.5)));
        }

        const ringOn = o.wildcardTimer > 0 && o.phase === "playing";
        node("wildcard-ring").setVisible(ringOn);
        if (ringOn) {
          node("wildcard-ring")
            .setPosition(p.x, 0.065, p.z)
            .setScale(1.04 + 0.08 * Math.sin(elapsed * 6));
        }

        /* 8x4 plasma flipbook burst + aurora shockwave ribbon on morph / PERFECT */
        const plasmaOn = !reduced && plasmaTimer > 0 && o.phase === "playing";
        const plasmaNode = node("morph-plasma").setVisible(plasmaOn);
        const ribbonNode = node("morph-ribbon").setVisible(plasmaOn);
        if (plasmaOn) {
          const progress = Math.min(0.999, Math.max(0, 1 - plasmaTimer / 0.42));
          const burstScale = p.scale * (0.95 + 0.85 * progress);
          plasmaNode
            .setPosition(p.x, playerCenterY + 0.1, p.z + 0.18)
            .setScale(burstScale);
          plasmaNode.setUniform?.("progress", progress);
          plasmaNode.setUniform?.("tintColor", [...plasmaTint]);
          ribbonNode
            .setPosition(p.x, playerCenterY + 0.15, p.z - 0.15)
            .setScale(0.65 + 0.55 * progress);
        }

        /* sim burst particles (world space) */
        simNow.particles.forEach((part, i) => {
          if (part.visible) {
            writeParticle(i, part.x, part.y, part.z, elapsed * 3 + i, part.scale * (0.4 + 0.6 * (part.life / part.max)), part.color, hexToLinear(part.color));
          } else if (particleShown[i]) {
            particles.collapse(i);
            particleShown[i] = false;
          }
        });

        /* shape-confetti trail (presentation only, own RNG stream) */
        if (o.phase === "playing" && !reduced && dt > 0) {
          trailAcc += dt * LOOK.confettiTrailRate;
          while (trailAcc >= 1) {
            trailAcc -= 1;
            const chip = trail[trailCursor % TRAIL_MAX] as (typeof trail)[number];
            trailCursor++;
            chip.life = 0.8;
            chip.x = p.x + (trailRng.next() - 0.5) * 0.5;
            chip.y = 0.25 + trailRng.next() * 0.3;
            chip.z = p.z + 0.5;
            chip.vx = (trailRng.next() - 0.5) * 1.2;
            chip.vy = 1 + trailRng.next() * 1.4;
            chip.vz = o.speed * (0.85 + trailRng.next() * 0.2);
            chip.spin = trailRng.next() * Math.PI * 2;
            chip.color = o.shapeIndex;
          }
        }
        trail.forEach((chip, j) => {
          const i = POOL.particles + j;
          if (chip.life > 0 && dt > 0 && advanceTrailChip(chip, dt)) {
            const color = LOOK.shapes[chip.color] as string;
            writeParticle(i, chip.x, Math.max(0.05, chip.y), chip.z, chip.spin + elapsed * 4, trailChipScale(chip.life), color, SHAPE_LINEAR[chip.color] as Rgb);
          } else if (particleShown[i]) {
            particles.collapse(i);
            particleShown[i] = false;
          }
        });
        particles.flush(node("particles"));

        if (!cloudsPlaced) placeClouds();
        updateScenery(scroll, elapsed, reduced);

        /* camera + real-time ImpactRig trauma & boost FOV kick */
        const pose = view.camera ?? view.shown?.camera ?? { x: 0.5 * p.x, y: p.y + 5, z: p.z + 9, lookX: p.x, lookY: p.y, lookZ: p.z - 10 };
        const shake = reduced ? { x: 0, y: 0 } : shakeOffset(elapsed, o.shakeTimer);
        const rigShake = reduced || !view.impactShake ? [0, 0, 0] as const : view.impactShake;
        const rigRoll = reduced ? 0 : (view.impactRoll ?? 0);
        const rigFov = reduced ? 0 : (view.impactFovDeg ?? 0);
        const baseFov = aspect >= 1 ? 55 : 55 + 25 * Math.min(1, (1 - aspect) / 0.5);
        const fov = Math.max(42, Math.min(92, baseFov + (reduced ? 0 : o.fovPunch * 6) + rigFov));
        const sx = shake.x + rigShake[0];
        const sy = shake.y + rigShake[1];
        controller.setPose({
          position: [pose.x + sx, pose.y + sy, pose.z + rigShake[2]],
          target: [pose.lookX + sx * 0.5, pose.lookY + sy * 0.25, pose.lookZ],
          up: [Math.sin(rigRoll), Math.cos(rigRoll), 0],
          fov
        }, { cut: false });
      }

      const batches = [road, walls, rims, tokens, particles, clouds, contact];
      const warmIds = ["shield", "wildcard-ring", "hydro-glow", "morph-plasma", "morph-ribbon", ...PLAYER_IDS];
      function warm(on: boolean): void {
        const parkY = -50, parkZ = -60;
        for (const id of warmIds) {
          const h = node(id).setVisible(on);
          if (on) h.setPosition(0, parkY, parkZ);
        }
        if (on) {
          road.place(0, 0, parkY, parkZ, 0, 1, 1, 1);
          walls.place(0, 0, parkY, parkZ, 0, 1, 1, 1);
          rims.place(0, 2, parkY, parkZ, 0, 1, 1, 1);
          tokens.place(0, 4, parkY, parkZ, 0, 1, 1, 1);
          particles.place(0, 6, parkY, parkZ, 0, 0.2, 0.2, 0.2);
          clouds.place(0, 8, parkY, parkZ, 0, 1, 1, 1);
          contact.place(0, 12, parkY, parkZ, 0, 1, 1, 1);
          for (const b of batches) b.flush(node(BATCH_IDS[batches.indexOf(b)] as string));
        } else {
          for (const id of warmIds) node(id).setVisible(false);
          road.collapse(0); walls.collapse(0); rims.collapse(0); tokens.collapse(0); particles.collapse(0); clouds.collapse(0);
          contact.collapse(0);
          for (const b of batches) b.flush(node(BATCH_IDS[batches.indexOf(b)] as string));
          cloudsPlaced = false;
        }
      }

      return {
        update,
        warm,
        get nodeCount() { return handles.size; },
        get uploadedVertices() { return batches.reduce((sum, b) => sum + b.uploadedVertices, 0); }
      };
    }
  };
}
