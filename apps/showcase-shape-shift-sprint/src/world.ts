/**
 * Shape Shift Sprint world on the public `@aura3d/engine` surface: kit toon/flat/shadow/sky programs,
 * one merged `geometry.dynamic` batch per pooled entity kind, scrolling-frame uploads (vertices written
 * once at `z - scroll`, the batch node moved by the scroll each frame). Signature look: candy primaries
 * on cream, day gradient sky, hole rims glow on match, morph burst + shape-confetti trail (the trail is
 * presentation-only and draws from its own RNG stream, never the gameplay stream).
 */
import { camera, effects, environments, geometry, group, lights, material, scene, type AuraApp } from "@aura3d/engine";
import {
  Batch, Slots, GameRng, scrollFrameZ, flatSpec, shadowSpec, hexToLinear,
  type CustomSpec, type MeshData, type Rgb
} from "../../../examples/shared/runner-kit/index";
import { CONFIG, POOL, type ShapeShiftSim, type Segment, type Token, type WallRow } from "./sim";
import { LOOK, SHAPE_LINEAR, ROAD_LINEAR, WALL_LINEAR, TOKEN_LINEAR, SUN_DIRECTION } from "./look";
import {
  PIECES, PILLAR_COUNT, PILLAR_SPACING, SEA_TILE, SCENERY, cloudSeaTile, contactSpec, ringSpec, islandMesh, pieceZ, pillarMesh, puffMesh,
  sceneryProgramSpecs, skirtMesh, SKIRT_DIMS, tonedGeometry, toySkySpec, toyToonSpec, wallContactMesh
} from "./scenery";
import {
  playerMesh, wallCellMesh, rimMesh, tokenMesh, roadSegmentMesh, roadTones, confettiMesh, sphereMesh, groundQuad, mergeMeshes
} from "./meshes";
import { WALL_DIMS } from "./meshes";
import { shakeOffset, type CameraPose, type Shown } from "./presentation";

type SceneBuilder = ReturnType<typeof scene>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

const TRAIL_MAX = 24;
/** Gameplay surfaces stay crisp out to the fog start so approaching walls keep full contrast. */
const GAME_FOG_START = 48;
const CLOUD_MAX = 8;
const PLAYER_BASE_Y = [0.55, 0.48, 0.55] as const;
export const BATCH_IDS = ["road", "walls", "rims", "tokens", "particles", "clouds", "wall-contact"] as const;
export const PLAYER_IDS = ["player-0", "player-1", "player-2"] as const;


export type PostMode = "lite" | "full" | "bloom" | "off";

export interface WorldOptions {
  readonly sim: ShapeShiftSim;
  readonly aspect: number;
  /**
   * Post chain: "lite" (default: warm grade + soft vignette), "full" (adds bloom), "bloom" (bloom only) or "off".
   * The toon surfaces are display-referred and shouldered near 1, so bloom on the cream road and walls washes the
   * whole lane white; it stays opt-in for A/B checks (`?post=`).
   */
  readonly post?: PostMode;
}

export interface WorldView {
  readonly shown?: Shown;
  readonly camera?: CameraPose;
  readonly reducedMotion?: boolean;
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

/** Every distinct `material.custom` program the game draws with (for the GLSL compile test). */
export function allProgramSpecs(): readonly { readonly name: string; readonly spec: CustomSpec }[] {
  return [
    ...sceneryProgramSpecs(),
    { name: "flat-shield", spec: flatSpec(hexToLinear(LOOK.tokenColors.shield), 0.24) },
    { name: "ring-wildcard", spec: ringSpec(hexToLinear(LOOK.tokenColors.wildcard), 0.85) },
    { name: "shadow", spec: shadowSpec() }
  ];
}

export function buildWorld(options: WorldOptions): World {
  const builder = scene()
    .background(LOOK.skyStops[LOOK.skyStops.length - 1].hex)
    .camera(camera.perspective({ position: [0, 14, 17], target: [0, 0.55, -10], fov: 55, near: 0.1, far: 600 }));

  const add = (id: string, mesh: MeshData, spec: CustomSpec): void => {
    builder.add(geometry.custom(dyn(mesh), { name: id, material: material.custom(spec) }).runtime({ id }));
  };
  const addBatch = (id: string, batch: Batch, spec: CustomSpec): void => {
    builder.add(geometry.custom(batch.geometry(), { name: id, material: material.custom(spec) }).runtime({ id }));
  };

  add("sky", sphereMesh(280, 32, 20), toySkySpec());

  // Engine environment + shadowed sun key for the art-direction contract; the toon programs carry
  // their own lighting, so these only serve the standard-path snapshot and any future PBR props.
  builder.add(environments.neutral({ name: "world-environment", intensity: 0.6 }));
  builder.add(lights.directional({
    name: "sun-key",
    position: [SUN_DIRECTION[0] * 100, SUN_DIRECTION[1] * 100, SUN_DIRECTION[2] * 100],
    target: [0, 0, 0], intensity: 1.4, color: "#fff6e0", shadow: { cascades: 1, maxDistance: 120 }
  }));

  const road = new Batch(roadSegmentMesh(), POOL.segments, roadTones());
  addBatch("road", road, toyToonSpec(ROAD_LINEAR, { tone: true, rim: 0, fogStart: GAME_FOG_START }));
  add("road-skirt", skirtMesh(), toyToonSpec([1, 1, 1], {
    rim: 0.12, fogStart: GAME_FOG_START, stripes: [hexToLinear(SCENERY.coral), hexToLinear(SCENERY.cream), SKIRT_DIMS.period]
  }));

  const walls = new Batch(wallCellMesh(), POOL.rows * 3);
  addBatch("walls", walls, toyToonSpec(WALL_LINEAR, { rim: 0.1, fogStart: GAME_FOG_START }));
  const contact = new Batch(wallContactMesh(WALL_DIMS.cellWidth, 1.1), POOL.rows * 3);
  addBatch("wall-contact", contact, contactSpec(0.3));
  const rimMeshes = [rimMesh(0), rimMesh(1), rimMesh(2)];
  const rims = new Batch(rimMeshes[0] as MeshData, POOL.rows * 3, [1, 1, 1]);
  addBatch("rims", rims, toyToonSpec([1, 1, 1], { tone: true, rim: 0, fogStart: GAME_FOG_START }));

  const tokens = new Batch(tokenMesh(), POOL.tokens, [1, 1, 1]);
  addBatch("tokens", tokens, toyToonSpec([1, 1, 1], { tone: true, rim: 0.3, fogStart: GAME_FOG_START }));

  for (let i = 0; i < 3; i++) add(`player-${i}`, playerMesh(i), toyToonSpec(SHAPE_LINEAR[i] as Rgb, { rim: 0.32, fogStart: GAME_FOG_START }));
  add("ball-shadow", groundQuad(2, 2), shadowSpec());
  add("shield", sphereMesh(1, 20, 14), flatSpec(hexToLinear(LOOK.tokenColors.shield), 0.24));
  add("wildcard-ring", groundQuad(1.9, 1.9), ringSpec(hexToLinear(LOOK.tokenColors.wildcard), 0.85));

  const particles = new Batch(confettiMesh(), POOL.particles + TRAIL_MAX, [1, 1, 1]);
  addBatch("particles", particles, toyToonSpec([1, 1, 1], { tone: true, rim: 0, fogStart: GAME_FOG_START }));

  const puff = mergeMeshes([sphereMesh(2.2, 12, 8), sphereMesh(1.5, 12, 8, -1.8, -0.4, 0), sphereMesh(1.3, 12, 8, 1.7, -0.6, 0.4)]);
  const clouds = new Batch(puff, CLOUD_MAX);
  addBatch("clouds", clouds, toyToonSpec(hexToLinear(LOOK.cloud), { rim: 0.35 }));

  /* Toybox Skyway scenery (presentation only, scenery.ts): cloud sea, bridge pillars, floating toy islands. */
  const seaTile = cloudSeaTile(SEA_TILE.w, SEA_TILE.d, 3);
  for (let i = 0; i < SEA_TILE.count; i++) {
    // Static and without a runtime id: the renderer snapshots every runtime node each frame and re-derives its bounds
    // from all of its vertices, and the sea tiles hold most of the scenery's vertices.
    builder.add(geometry.custom(tonedGeometry(i === 0 ? seaTile : cloudSeaTile(SEA_TILE.w, SEA_TILE.d, 3 + i)), { name: `sea-${i}`, material: material.custom(toyToonSpec([1, 1, 1], { tone: true, rim: 0.25 })) })
      .position(0, SEA_TILE.y, SEA_TILE.d * 0.6 - (i + 0.5) * SEA_TILE.d));
  }
  const pillar = pillarMesh();
  for (let i = 0; i < PILLAR_COUNT; i++) {
    builder.add(group(`pillar-${i}`, [geometry.custom(tonedGeometry(pillar), { name: `pillar-${i}-mesh`, material: material.custom(toyToonSpec([1, 1, 1], { tone: true, rim: 0.15 })) })]).runtime({ id: `pillar-${i}` }));
  }
  for (const piece of PIECES) {
    const mesh = piece.variant === "puff" ? puffMesh(piece.z0 | 0) : islandMesh(piece.variant, Math.round(piece.z0) % 7);
    // A runtime group around a static mesh: the renderer snapshots each runtime node every frame and re-derives a mesh
    // node's bounds from all of its vertices, while a group's snapshot is cheap; moving the group moves the mesh.
    builder.add(group(piece.id, [geometry.custom(tonedGeometry(mesh), { name: `${piece.id}-mesh`, material: material.custom(toyToonSpec([1, 1, 1], { tone: true, rim: piece.variant === "puff" ? 0.35 : 0.2 })) })]).runtime({ id: piece.id }));
  }

  /* Post: gentle bloom on the sun glow, glowing rims and confetti; warm grade; soft vignette. */
  const post = options.post ?? "lite";
  if (post === "full" || post === "bloom") builder.add(effects.bloom({ name: "bloom", intensity: 0.25, threshold: 0.98, scatter: 0.5 }));
  if (post === "full" || post === "lite") {
    builder
      .add(effects.colorGrade({ name: "grade", contrast: 1.06, saturation: 1.08 }))
      .add(effects.vignette({ name: "vignette", intensity: 0.14, color: "#3a2a55" }));
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

      // Presentation-only confetti trail: its own counted stream, never the gameplay RNG.
      const trailRng = new GameRng(0x511a7);
      const trail = Array.from({ length: TRAIL_MAX }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, color: 0 }));
      let trailAcc = 0;
      let trailCursor = 0;

      function placeClouds(): void {
        const spots: readonly (readonly [number, number, number, number])[] = [
          [-16, 14, -60, 1.4], [18, 17, -80, 1.8], [-26, 19, -110, 2.2], [12, 13, -45, 1.1],
          [30, 21, -125, 2.4], [-10, 16, -95, 1.6], [24, 12, -55, 1.0], [-32, 15, -75, 1.5]
        ];
        spots.forEach(([x, y, z, s], i) => clouds.place(i, x, y, z, 0, s, s * 0.7, s));
        clouds.flush(node("clouds"));
        cloudsPlaced = true;
      }

      /** Scenery: pure function of the road scroll and the clock (islands bob, puffs drift; reduced motion stills them). */
      function updateScenery(scrollNow: number, t: number, still: boolean): void {
        const bobT = still ? 0 : t;
        for (const piece of PIECES) {
          const z = pieceZ(piece, scrollNow);
          const bob = Math.sin(bobT * 0.7 + piece.z0) * (piece.variant === "puff" ? 0.35 : 0.3 * piece.scale);
          node(piece.id).setPosition(piece.x, piece.y + bob, z).setRotation(0, piece.yaw + bobT * 0.03 * (piece.layer === 0 ? 1 : 0.5), 0).setScale(piece.scale);
        }
        const pillarSpan = PILLAR_SPACING * PILLAR_COUNT;
        for (let i = 0; i < PILLAR_COUNT; i++) {
          const z = ((((i * PILLAR_SPACING + scrollNow) % pillarSpan) + pillarSpan) % pillarSpan) - pillarSpan + 30;
          node(`pillar-${i}`).setPosition(0, 0, z);
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
        if (lastDistance >= 0 && o.distance < lastDistance - 1) {
          for (const chip of trail) chip.life = 0;
        }
        lastElapsed = elapsed;
        lastDistance = o.distance;

        /* road (scrolling frame) */
        segSlots.retain(simNow.segments, (slot) => road.collapse(slot));
        for (const seg of simNow.segments) {
          const { slot, fresh } = segSlots.use(seg);
          if (slot >= 0 && fresh) road.place(slot, 0, 0, scrollFrameZ(seg.z, scroll), 0, 1, 1, 1);
        }
        node("road").setPosition(0, 0, scroll);
        node("road-skirt").setPosition(0, 0, ((scroll % SKIRT_DIMS.period) + SKIRT_DIMS.period) % SKIRT_DIMS.period);
        road.flush(node("road"), false);

        /* wall cells + shape rims (scrolling frame); rims glow when they fit the current shape */
        rowSlots.retain(simNow.rows, (slot) => {
          for (let i = 0; i < 3; i++) {
            walls.collapse(slot * 3 + i);
            contact.collapse(slot * 3 + i);
            rims.collapse(slot * 3 + i);
            rimKey[slot * 3 + i] = -1;
          }
        });
        for (const row of simNow.rows) {
          const { slot, fresh } = rowSlots.use(row);
          if (slot < 0) continue;
          const z = scrollFrameZ(row.z, scroll);
          row.holes.forEach((hole, i) => {
            const idx = slot * 3 + i;
            if (fresh) {
              walls.place(idx, hole.laneX, 0, z, 0, 1, 1, 1);
              contact.place(idx, hole.laneX, 0.03, z + WALL_DIMS.thickness / 2, 0, 1, 1, 1);
              rims.place(idx, hole.laneX, WALL_DIMS.openingCenterY, z + WALL_DIMS.thickness / 2 + 0.03, 0, 1, 1, 1, rimMeshes[hole.shapeIndex] as MeshData);
            }
            const fits = hole.shapeIndex === o.shapeIndex || o.wildcardTimer > 0;
            const matched = row.resolved && row.matchedLane === i;
            const glow = matched ? LOOK.rimGlowMatched : fits ? LOOK.rimGlow : 0;
            const key = hole.shapeIndex * 100 + Math.round(glow * 100);
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

        /* tokens (scrolling frame); morph tokens cycle the shape colours */
        tokenSlots.retain(simNow.tokens, (slot) => { tokens.collapse(slot); tokenKey[slot] = ""; });
        for (const t of simNow.tokens) {
          const { slot, fresh } = tokenSlots.use(t);
          if (slot < 0) continue;
          if (fresh) tokens.place(slot, t.laneX, t.baseY, scrollFrameZ(t.z, scroll), 0, 1, 1, 1);
          const morphIndex = Math.floor(elapsed * 2.5) % 3;
          const key = t.type === "morph" ? `morph${morphIndex}` : t.type;
          if (tokenKey[slot] !== key) {
            tokens.setTone(slot, t.type === "morph" ? (SHAPE_LINEAR[morphIndex] as Rgb) : TOKEN_LINEAR[t.type]);
            tokenKey[slot] = key;
          }
        }
        node("tokens").setPosition(0, 0, scroll);
        tokens.flush(node("tokens"));

        /* player forms */
        const baseY = PLAYER_BASE_Y[o.shapeIndex] as number;
        for (let i = 0; i < 3; i++) {
          const h = node(`player-${i}`);
          const on = i === o.shapeIndex && p.visible && o.phase !== "splash";
          h.setVisible(on);
          if (on) {
            h.setPosition(p.x, baseY * p.scale, p.z).setScale(p.scale);
            if (i === 2) h.setRotation(0, elapsed * 2, 0);
            else h.setRotation(p.rotX, 0, 0);
          }
        }
        node("ball-shadow").setVisible(p.visible && o.phase !== "splash")
          .setPosition(p.x, 0.05, p.z).setScale(p.scale * 0.85);
        const shieldOn = o.shieldActive && o.phase === "playing";
        node("shield").setVisible(shieldOn);
        if (shieldOn) node("shield").setPosition(p.x, baseY * p.scale, p.z).setScale(p.scale * (0.95 + 0.05 * Math.sin(elapsed * 4)));
        const ringOn = o.wildcardTimer > 0 && o.phase === "playing";
        node("wildcard-ring").setVisible(ringOn);
        if (ringOn) node("wildcard-ring").setPosition(p.x, 0.08, p.z).setScale(1 + 0.08 * Math.sin(elapsed * 6));

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
          if (chip.life > 0 && dt > 0) {
            chip.life -= dt;
            chip.x += chip.vx * dt;
            chip.y += chip.vy * dt;
            chip.z += chip.vz * dt;
            chip.vy -= 7 * dt;
            const color = LOOK.shapes[chip.color] as string;
            writeParticle(i, chip.x, Math.max(0.05, chip.y), chip.z, chip.spin + elapsed * 4, 0.12 * Math.min(1, chip.life / 0.3), color, SHAPE_LINEAR[chip.color] as Rgb);
          } else if (particleShown[i]) {
            particles.collapse(i);
            particleShown[i] = false;
          }
        });
        particles.flush(node("particles"));

        if (!cloudsPlaced) placeClouds();
        updateScenery(scroll, elapsed, reduced);

        /* camera */
        const pose = view.camera ?? view.shown?.camera ?? { x: 0.5 * p.x, y: p.y + 5, z: p.z + 9, lookX: p.x, lookY: p.y, lookZ: p.z - 10 };
        const shake = reduced ? { x: 0, y: 0 } : shakeOffset(elapsed, o.shakeTimer);
        const baseFov = aspect >= 1 ? 55 : 55 + 25 * Math.min(1, (1 - aspect) / 0.5);
        const fov = baseFov + (reduced ? 0 : o.fovPunch * 6);
        controller.setPose({
          position: [pose.x + shake.x, pose.y + shake.y, pose.z],
          target: [pose.lookX + shake.x * 0.5, pose.lookY, pose.lookZ],
          up: [0, 1, 0], fov
        }, { cut: false });
      }

      const batches = [road, walls, rims, tokens, particles, clouds, contact];
      function warm(on: boolean): void {
        const parkY = -50, parkZ = -60;
        for (const id of ["shield", "wildcard-ring", ...PLAYER_IDS]) {
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
          for (const id of ["shield", "wildcard-ring", ...PLAYER_IDS]) node(id).setVisible(false);
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