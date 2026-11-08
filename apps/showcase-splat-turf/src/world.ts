/**
 * Splat Turf world on the public `@aura3d/engine` surface: kit toon/flat/shadow `material.custom` programs,
 * one `geometry.dynamic` batch per pooled kind. The signature surface is the paint grid: all 1200 x 6
 * cells live in ONE batch with a per-cell `tone` attribute, written once in the scrolling frame; painting
 * and wipes only rewrite tone, and the coverage map persists behind the player for the whole run.
 */
import { camera, environments, geometry, lights, material, scene, type AuraApp, type AuraSceneBuilder } from "@aura3d/engine";
import {
  Batch, flatSpec, gradientSkyFragment, shadowSpec, skySpec, toonSpec, type CustomSpec
} from "../../../examples/shared/runner-kit/index";
import { CONFIG, type SplatTurfSim } from "./sim";
import { LOOK, linear, paintColorFor } from "./look";
import {
  BALL_RADIUS, ballMesh, botMesh, canMesh, cellMesh, edgeMesh, finishMesh, quadMesh, roadMesh, sphereMesh, stripMesh,
  type MeshData
} from "./meshes";
import type { CameraPose, Shown } from "./presentation";

export const CAMERA_FAR = 400;
export const ROAD_WIDTH = 6.4;
export const EDGE_X = 3.35;
export const CELL_Y = 0.02;
export const GRID_CELLS = CONFIG.RUN_LENGTH * CONFIG.GRID_COLS;

export const BATCH_IDS = ["road", "edges", "paint", "strips", "cans", "bots", "particles"] as const;

export interface WorldOptions {
  sim: SplatTurfSim;
  aspect: number;
}

export interface WorldView {
  shown?: Shown;
  camera?: CameraPose;
  reducedMotion?: boolean;
}

export interface WorldRuntime {
  update(sim: SplatTurfSim, aspect: number, view?: WorldView): void;
  warm(on: boolean): void;
  readonly nodeCount: number;
  readonly uploadedVertices: number;
}

export interface World {
  scene: AuraSceneBuilder;
  bind(app: AuraApp): WorldRuntime;
}

/** Every distinct `material.custom` program the game draws with (for the GLSL compile test). */
export function allProgramSpecs(): readonly { readonly name: string; readonly spec: CustomSpec }[] {
  return [
    { name: "sky", spec: skySpec(gradientSkyFragment(LOOK.skyStops)) },
    { name: "toon", spec: toonSpec(linear(LOOK.road)) },
    { name: "toon-tone", spec: toonSpec([1, 1, 1], undefined, [0, 0, 0], true) },
    { name: "flat", spec: flatSpec(linear(LOOK.solvent), 0.55) },
    { name: "shadow", spec: shadowSpec() }
  ];
}

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function dynamicFrom(m: MeshData) {
  return geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });
}

const PARTICLE_COLORS: Record<number, string> = { 1: LOOK.ball, 2: LOOK.can, 3: LOOK.solvent, 4: LOOK.eraser };

export function buildWorld(options: WorldOptions): World {
  void options.aspect;
  const builder: AuraSceneBuilder = scene()
    .background(LOOK.background)
    .camera(camera.perspective({ position: [0, 8, 12], target: [0, 0.5, -10], fov: 55, near: 0.1, far: CAMERA_FAR }));

  // Audit rig: one shadowed key + neutral IBL preset (the toon programs carry their own light terms).
  builder.add(lights.directional({ name: "key", position: [6, 12, 6], target: [0, 0, 0], intensity: 1.2, color: "#ffffff", shadow: { cascades: 1, maxDistance: 120 } }));
  builder.add(environments.neutral({ name: "environment", intensity: 0.6 }));

  const add = (id: string, mesh: MeshData, spec: CustomSpec): void => {
    builder.add(geometry.custom(dynamicFrom(mesh), { name: id, material: material.custom(spec) }).runtime({ id }));
  };
  const addBatch = (id: string, batch: Batch, spec: CustomSpec): void => {
    builder.add(geometry.custom(batch.geometry(), { name: id, material: material.custom(spec) }).runtime({ id }));
  };

  add("sky", sphereMesh(150, 32, 24), skySpec(gradientSkyFragment(LOOK.skyStops)));
  add("ball", ballMesh(), toonSpec(linear(LOOK.ball)));
  add("ball-shadow", quadMesh(1.6, 1.6), shadowSpec());
  add("finish", finishMesh(), toonSpec(linear(LOOK.finish)));

  const road = new Batch(roadMesh(), CONFIG.POOL_SEGMENTS);
  const edges = new Batch(edgeMesh(), CONFIG.POOL_SEGMENTS * 2);
  const paint = new Batch(cellMesh(), GRID_CELLS, [1, 1, 1]);
  const strips = new Batch(stripMesh(), CONFIG.POOL_STRIPS);
  const cans = new Batch(canMesh(), CONFIG.POOL_CANS);
  const bots = new Batch(botMesh(), CONFIG.POOL_BOTS, linear(LOOK.eraser));
  const particles = new Batch(sphereMesh(0.12, 6, 6), CONFIG.POOL_PARTICLES, [1, 1, 1]);

  addBatch("road", road, toonSpec(linear(LOOK.road)));
  addBatch("edges", edges, toonSpec(linear(LOOK.roadEdge)));
  addBatch("paint", paint, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));
  addBatch("strips", strips, flatSpec(linear(LOOK.solvent), 0.55));
  addBatch("cans", cans, toonSpec(linear(LOOK.can)));
  addBatch("bots", bots, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));
  addBatch("particles", particles, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const maybeController = app.camera;
      if (!maybeController) throw new Error("splat-turf: the app exposes no camera controller");
      const controller = maybeController;

      // Paint cells: written once in the scrolling frame (z = -row - 0.5); only tone changes afterwards.
      for (let r = 0; r < CONFIG.RUN_LENGTH; r++) {
        for (let c = 0; c < CONFIG.GRID_COLS; c++) {
          paint.place(r * CONFIG.GRID_COLS + c, c - CONFIG.LANE_LIMIT, CELL_Y, -r - 0.5, 0, 1, 1, 1);
        }
      }
      // 0 = white road, 1 = painted, 2 = solvent wash; -1 forces the first write.
      const cellTone = new Int8Array(GRID_CELLS).fill(-1);
      const segRow = new Float64Array(CONFIG.POOL_SEGMENTS).fill(Number.NaN);
      const stripKey = Array.from({ length: CONFIG.POOL_STRIPS }, () => "");
      const canKey = Array.from({ length: CONFIG.POOL_CANS }, () => "");
      const botShown = Array.from({ length: CONFIG.POOL_BOTS }, () => false);
      const botHit = Array.from({ length: CONFIG.POOL_BOTS }, () => false);
      const particleShown = Array.from({ length: CONFIG.POOL_PARTICLES }, () => false);
      const particleKind = new Int8Array(CONFIG.POOL_PARTICLES).fill(-1);
      let lastDistance = 0;
      let flushedInitial = false;

      const toneFor = (state: number, row: number): readonly [number, number, number] =>
        state === 1 ? linear(paintColorFor(row)) : state === 2 ? linear(LOOK.wipeWash) : [1, 1, 1];

      function updatePaint(sim: SplatTurfSim, distance: number): void {
        const full = distance < lastDistance - 5;
        const from = full ? 0 : Math.max(0, Math.floor(distance) - 25);
        const to = full ? CONFIG.RUN_LENGTH : Math.min(CONFIG.RUN_LENGTH, Math.floor(distance) + 13);
        const washRow = Math.floor(distance);
        for (let r = from; r < to; r++) {
          for (let c = 0; c < CONFIG.GRID_COLS; c++) {
            const idx = r * CONFIG.GRID_COLS + c;
            const painted = sim.grid[idx] === 1;
            const wash = !painted && sim.o.wipeFlash > 0 && r >= washRow - CONFIG.ERASER_WIPE_METERS - 1 && r <= washRow + CONFIG.SOLVENT_LENGTH + 1;
            const state = painted ? 1 : wash ? 2 : 0;
            if (cellTone[idx] === state) continue;
            cellTone[idx] = state;
            paint.setTone(idx, toneFor(state, r));
          }
        }
        lastDistance = distance;
      }

      function update(sim: SplatTurfSim, aspect: number, view: WorldView = {}): void {
        const o = sim.o;
        const distance = view.shown?.distance ?? o.distance;
        const back = view.shown?.back ?? 0;
        const laneOffset = view.shown?.laneOffset ?? o.laneOffset;
        const time = view.shown?.time ?? o.time;
        const roadZ = distance - back;
        const reduced = view.reducedMotion === true;

        // Road + edges: rewritten only when a segment recycles.
        for (let i = 0; i < o.segments.length; i++) {
          const seg = o.segments[i]!;
          if (segRow[i] === seg.row) continue;
          segRow[i] = seg.row;
          road.place(i, 0, -0.15, -seg.row - 0.5, 0, 1, 1, 1);
          edges.place(i * 2, -EDGE_X, -0.12, -seg.row - 0.5, 0, 1, 1, 1);
          edges.place(i * 2 + 1, EDGE_X, -0.12, -seg.row - 0.5, 0, 1, 1, 1);
        }

        updatePaint(sim, distance);

        // Solvent strips and cans: written when they spawn / recycle.
        for (let i = 0; i < o.strips.length; i++) {
          const s = o.strips[i]!;
          const key = s.active ? `${s.row}:${s.col}` : "";
          if (stripKey[i] === key) continue;
          stripKey[i] = key;
          if (s.active) strips.place(i, s.col - CONFIG.LANE_LIMIT, 0.04, -s.row - CONFIG.SOLVENT_LENGTH / 2, 0, 1, 1, 1);
          else strips.collapse(i);
        }
        for (let i = 0; i < o.cans.length; i++) {
          const c = o.cans[i]!;
          const key = c.active ? `${c.row}:${c.col}` : "";
          if (canKey[i] === key) continue;
          canKey[i] = key;
          if (c.active) cans.place(i, c.col - CONFIG.LANE_LIMIT, 0, -c.row - 0.5, c.row * 0.7, 1, 1, 1);
          else cans.collapse(i);
        }

        // Eraser bots lateral-move every frame; particles integrate in the sim.
        for (let i = 0; i < o.bots.length; i++) {
          const b = o.bots[i]!;
          if (!b.active) {
            if (botShown[i]) { bots.collapse(i); botShown[i] = false; }
            continue;
          }
          bots.place(i, b.x, 0, -b.row, 0, 1, 1, 1);
          botShown[i] = true;
          if (botHit[i] !== b.hit) {
            botHit[i] = b.hit;
            bots.setTone(i, b.hit ? [0.25, 0.25, 0.3] : linear(LOOK.eraser));
          }
        }
        for (let i = 0; i < o.particles.length; i++) {
          const p = o.particles[i]!;
          if (!p.active) {
            if (particleShown[i]) { particles.collapse(i); particleShown[i] = false; }
            continue;
          }
          const s = Math.max(0.2, p.life * 1.6);
          particles.place(i, p.x, p.y, -p.z, 0, s, s, s);
          particleShown[i] = true;
          if (particleKind[i] !== p.kind) {
            particleKind[i] = p.kind;
            particles.setTone(i, linear(PARTICLE_COLORS[p.kind] ?? LOOK.ball));
          }
        }

        // Scrolling frame: one node transform per batch.
        for (const id of BATCH_IDS) node(id).setPosition(0, 0, roadZ);
        node("finish").setPosition(0, 0, roadZ - CONFIG.RUN_LENGTH);
        road.flush(node("road"));
        edges.flush(node("edges"));
        paint.flush(node("paint"), false);
        strips.flush(node("strips"), false);
        cans.flush(node("cans"));
        bots.flush(node("bots"));
        particles.flush(node("particles"));
        if (!flushedInitial) flushedInitial = true;

        // Ball: fixed at the origin of the scrolling frame, rolling with the run.
        const bursting = o.phase === "bursting";
        const gone = o.phase === "gameOver";
        const scale = bursting ? 1 + (1 - o.burstTimer / CONFIG.BURST_SECONDS) * 0.6 : 1;
        node("ball").setPosition(laneOffset, BALL_RADIUS * scale, 0).setRotation(distance / BALL_RADIUS, 0, 0).setScale(scale).setVisible(!gone);
        node("ball-shadow").setPosition(laneOffset, 0.01, 0).setScale(scale).setVisible(!gone);

        // Camera: chase pose (presenter-interpolated), deterministic shake, speed FOV — all presentation only.
        const c = view.camera ?? { x: 0.5 * laneOffset, y: 5, z: 9, lookX: laneOffset, lookY: 0.5, lookZ: -10 };
        const shake = reduced ? 0 : o.shake * 0.25;
        const sx = shake * Math.sin(time * 47);
        const sy = shake * Math.cos(time * 53);
        const baseFov = aspect >= 1 ? 55 : 55 + 25 * Math.min(1, (1 - aspect) / 0.5);
        const fov = baseFov + (reduced || o.phase !== "playing" ? 0 : (o.speed - CONFIG.SPEED_INIT) * 0.5);
        controller.setPose({
          position: [c.x + sx, c.y + sy, c.z],
          target: [c.lookX, c.lookY, c.lookZ],
          up: [0, 1, 0],
          fov
        }, { cut: false });
      }

      const batches = [road, edges, paint, strips, cans, bots, particles];
      function warm(on: boolean): void {
        // Park one instance of each pooled batch below the road so every program compiles before frame one.
        if (on) {
          strips.place(0, 0, -50, -60, 0, 1, 1, 1);
          cans.place(0, 0, -50, -60, 0, 1, 1, 1);
          bots.place(0, 0, -50, -60, 0, 1, 1, 1);
          particles.place(0, 0, -50, -60, 0, 1, 1, 1);
        } else {
          strips.collapse(0);
          cans.collapse(0);
          bots.collapse(0);
          particles.collapse(0);
          stripKey.fill("");
          canKey.fill("");
          botShown.fill(false);
          particleShown.fill(false);
        }
        strips.flush(node("strips"), false);
        cans.flush(node("cans"));
        bots.flush(node("bots"));
        particles.flush(node("particles"));
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