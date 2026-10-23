/**
 * Snake Way on the public `@aura3d/engine` surface only: the snake's body as one dynamic ribbon with
 * `material.custom`, a sky/cloud-deck backdrop, Goku with the Kaio-ken aura shell, pooled nodes for
 * the road's entities, and the chase camera. The simulation (`sim.ts`) never imports this file.
 */
import { camera, geometry, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import { PALETTE, auraSpec, glowSpec, hexLinear, roadSpec, skySpec, solidSpec, type CustomSpec, type Rgb } from "./materials";
import { buildRoadMesh, buildRoadSamples, frameAt, onRoad, type RoadFrame, type V3 } from "./road";
import { ROAD_LENGTH, entityHeight, entityLateral, type Entity, type RunState } from "./sim";

type Scene = ReturnType<typeof scene>;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

/** Pool sizes per entity type (the road keeps roughly 900 m of entities alive). */
const POOLS: Readonly<Record<string, number>> = { orb: 150, soul: 40, barrier: 30, arch: 30, oni: 24, sweeper: 8, power: 10, feast: 8 };

const POWER_COLORS: Readonly<Record<string, Rgb>> = {
  kaio: hexLinear(PALETTE.aura), senzu: hexLinear(PALETTE.jade), stamp: hexLinear(PALETTE.gold), pole: hexLinear(PALETTE.lacquer),
  nimbus: hexLinear(PALETTE.kiCore), weights: hexLinear(PALETTE.lacquerDark)
};

/** Matrix columns (x, y, z axes) to the engine's ZYX Euler angles (R = Rz·Ry·Rx). */
function basisToEuler(x: V3, y: V3, z: V3): V3 {
  const m11 = x[0], m12 = y[0], m21 = x[1], m22 = y[1], m31 = x[2], m32 = y[2], m33 = z[2];
  const ey = Math.asin(-Math.max(-1, Math.min(1, m31)));
  if (Math.abs(m31) < 0.9999999) return [Math.atan2(m32, m33), ey, Math.atan2(m21, m11)];
  return [0, ey, Math.atan2(-m12, m22)];
}

/** Orientation whose local Y is the road's up and whose local -Z points down the road (the original's `makeBasis(R, U, -F)`). */
function roadEuler(frame: RoadFrame, yawOffset = 0): V3 {
  let R = frame.R, F = frame.F;
  if (yawOffset) {
    const c = Math.cos(yawOffset), s = Math.sin(yawOffset);
    R = [frame.R[0] * c + frame.F[0] * s, frame.R[1] * c + frame.F[1] * s, frame.R[2] * c + frame.F[2] * s];
    F = [frame.F[0] * c - frame.R[0] * s, frame.F[1] * c - frame.R[1] * s, frame.F[2] * c - frame.R[2] * s];
  }
  return basisToEuler(R, frame.U, [-F[0], -F[1], -F[2]]);
}

export interface WorldRuntime {
  update(state: RunState, dt: number, time: number, aspect: number): void;
  resetCamera(): void;
  readonly nodeCount: number;
  readonly entityNodes: number;
}

export interface World {
  readonly scene: Scene;
  bind(app: AuraApp): WorldRuntime;
}

export function buildWorld(): World {
  const samples = buildRoadSamples();
  const builder: Scene = scene()
    .background("#a8b4e8")
    .camera(camera.perspective({ position: [0, 6, 14], target: [0, 1, 0], fov: 62, near: 0.5, far: 6000 }));

  /* road + sky */
  const mesh = buildRoadMesh(samples);
  builder.add(geometry.custom(geometry.dynamic({ positions: f32(mesh.positions), normals: f32(mesh.normals), uvs: f32(mesh.uvs), indices: Uint32Array.from(mesh.indices) }), { name: "road", material: material.custom(roadSpec()) }));
  builder.add(primitives.sphere({ name: "sky", size: 5200, material: material.custom(skySpec()) }).runtime({ id: "sky" }));

  /* Goku and the aura shell */
  const gi = hexLinear(PALETTE.gi), giDark = hexLinear(PALETTE.giDark), skin = hexLinear(PALETTE.skin), hair = hexLinear(PALETTE.hair), teal = hexLinear(PALETTE.teal);
  const solid = (c: Rgb, glow: Rgb = [0, 0, 0], amount = 0): CustomSpec => solidSpec(c, glow, amount);
  const part = (id: string, node: ReturnType<typeof primitives.capsule>): void => { builder.add(node.runtime({ id })); };
  part("goku-torso", primitives.capsule({ name: "goku-torso", size: [0.9, 1.5, 0.7], material: material.custom(solid(gi)) }));
  part("goku-belt", primitives.cylinder({ name: "goku-belt", size: [0.95, 0.18, 0.75], material: material.custom(solid(teal)) }));
  part("goku-legs", primitives.capsule({ name: "goku-legs", size: [0.85, 1.2, 0.6], material: material.custom(solid(giDark)) }));
  part("goku-head", primitives.sphere({ name: "goku-head", size: 0.62, material: material.custom(solid(skin)) }));
  part("goku-hair", primitives.cone({ name: "goku-hair", params: { radius: 0.42, height: 0.75, radialSegments: 7 }, material: material.custom(solid(hair)) }));
  part("goku-armL", primitives.capsule({ name: "goku-armL", size: [0.28, 0.9, 0.28], material: material.custom(solid(skin)) }));
  part("goku-armR", primitives.capsule({ name: "goku-armR", size: [0.28, 0.9, 0.28], material: material.custom(solid(skin)) }));
  const auraOuter = primitives.cylinder({ name: "aura-outer", size: [3.4, 5.6, 3.4], material: material.custom(auraSpec(hexLinear(PALETTE.auraCore), hexLinear(PALETTE.auraLit), hexLinear(PALETTE.aura), 0.8)) });
  const auraInner = primitives.cylinder({ name: "aura-inner", size: [2.5, 4.8, 2.5], material: material.custom(auraSpec(hexLinear(PALETTE.auraCore), hexLinear(PALETTE.auraLit), hexLinear(PALETTE.aura), 0.8)) });
  builder.add(auraOuter.runtime({ id: "aura-outer" }));
  builder.add(auraInner.runtime({ id: "aura-inner" }));

  /* entity pools */
  const entityMaterial = (type: string): CustomSpec => {
    switch (type) {
      case "orb": return glowSpec(hexLinear(PALETTE.kiCore), hexLinear(PALETTE.ki));
      case "soul": return glowSpec(hexLinear(PALETTE.spirit), hexLinear(PALETTE.bone));
      case "barrier": return solid(hexLinear(PALETTE.teal), hexLinear(PALETTE.jade), 0.15);
      case "arch": return solid(hexLinear(PALETTE.lacquer), hexLinear(PALETTE.lacquerDark), 0.1);
      case "oni": return solid(hexLinear(0xc4503c), [0, 0, 0], 0);
      case "sweeper": return solid(hexLinear(0x6a5b48));
      case "power": return glowSpec(hexLinear(PALETTE.auraCore), hexLinear(PALETTE.aura));
      default: return solid(hexLinear(PALETTE.gold), hexLinear(PALETTE.gold), 0.3);
    }
  };
  const makeEntity = (type: string, id: string) => {
    switch (type) {
      case "orb": return primitives.sphere({ name: id, size: 0.9, material: material.custom(entityMaterial(type)) });
      case "soul": return primitives.sphere({ name: id, size: 1.5, material: material.custom(entityMaterial(type)) });
      case "barrier": return primitives.box({ name: id, size: [3.2, 2.2, 0.7], material: material.custom(entityMaterial(type)) });
      case "arch": return primitives.box({ name: id, size: [4.4, 1.0, 0.9], material: material.custom(entityMaterial(type)) });
      case "oni": return primitives.capsule({ name: id, size: [1.5, 3.0, 1.3], material: material.custom(entityMaterial(type)) });
      case "sweeper": return primitives.box({ name: id, size: [2.6, 1.8, 2.6], material: material.custom(entityMaterial(type)) });
      case "power": return primitives.polyhedron({ name: id, params: { variant: "octahedron", detail: 0, radius: 0.9 }, material: material.custom(entityMaterial(type)) });
      default: return primitives.sphere({ name: id, size: 1.5, material: material.custom(entityMaterial(type)) });
    }
  };
  for (const [type, count] of Object.entries(POOLS)) for (let i = 0; i < count; i++) builder.add(makeEntity(type, `ent-${type}-${i}`).position(0, -500, 0).runtime({ id: `ent-${type}-${i}` }));

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const cameraController = app.camera;
      if (!cameraController) throw new Error("saiyan-snake-way-port: the app exposes no camera controller");
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => {
        let h = handles.get(id);
        if (!h) handles.set(id, h = app.nodes.require(id));
        return h;
      };
      let rig: { f: V3; u: V3 } | null = null;
      let alive = 0;
      const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      const norm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
      const place = (id: string, frame: RoadFrame, lateral: number, up: number, along = 0): void => {
        const base = onRoad(frame, lateral, up);
        const p: V3 = [base[0] + frame.F[0] * along, base[1] + frame.F[1] * along, base[2] + frame.F[2] * along];
        const e = roadEuler(frame);
        node(id).setPosition(p[0], p[1], p[2]).setRotation(e[0], e[1], e[2]).setVisible(true);
      };

      const update = (S: RunState, dt: number, time: number, aspect: number): void => {
        const frame = frameAt(samples, Math.min(S.s, ROAD_LENGTH));
        node("sky").setPosition(frame.p[0], frame.p[1], frame.p[2]);
        node("sky").setUniform?.("skyTime", time);

        /* Goku: parts stacked on the road frame; flight lifts the whole figure */
        const pose = onRoad(frame, S.laneX, S.y);
        const lean = Math.max(-0.35, Math.min(0.35, S.laneVel * 0.02));
        const crouch = S.sliding > 0 ? 0.55 : 1;
        const e = roadEuler(frame, -lean);
        const at = (dx: number, dy: number, dz: number): V3 => [
          pose[0] + frame.R[0] * dx + frame.U[0] * dy + frame.F[0] * dz,
          pose[1] + frame.R[1] * dx + frame.U[1] * dy + frame.F[1] * dz,
          pose[2] + frame.R[2] * dx + frame.U[2] * dy + frame.F[2] * dz
        ];
        const put = (id: string, p: V3): void => { node(id).setPosition(p[0], p[1], p[2]).setRotation(e[0], e[1], e[2]).setVisible(true); };
        put("goku-legs", at(0, 0.7 * crouch, 0));
        put("goku-belt", at(0, 1.35 * crouch, 0));
        put("goku-torso", at(0, 2.1 * crouch, 0));
        put("goku-head", at(0, 3.15 * crouch, 0));
        put("goku-hair", at(0, 3.75 * crouch, 0));
        put("goku-armL", at(-0.62, 2.2 * crouch, 0));
        put("goku-armR", at(0.62, 2.2 * crouch, 0));
        const intensity = S.auraVis === undefined ? 0 : S.auraVis;
        const growth = 1 + 0.14 * S.auraRung + (S.kaio === "power" ? 0.2 : 0);
        for (const [id, scale, solidAmount] of [["aura-outer", growth, 0.8], ["aura-inner", growth * 0.92, 0.55]] as const) {
          const h = node(id);
          h.setPosition(pose[0] + frame.U[0] * 2.4 * crouch, pose[1] + frame.U[1] * 2.4 * crouch, pose[2] + frame.U[2] * 2.4 * crouch).setRotation(e[0], e[1], e[2]).setScale(scale).setVisible(intensity > 4e-3);
          h.setUniform?.("auraTime", id === "aura-inner" ? 1.37 * time + 4 : time);
          h.setUniform?.("auraIntensity", intensity);
          h.setUniform?.("auraSolid", S.nimbus > 0 ? 0.34 : solidAmount);
        }

        /* entities: assign the nearest alive ones to the pooled nodes, hide the rest */
        const used: Record<string, number> = {};
        alive = 0;
        for (const ent of S.ents as readonly Entity[]) {
          if (ent.dead) continue;
          const s = ent.type === "sweeper" || ent.type === "soul" || ent.type === "oni" ? ent.s + ent.rel : ent.s;
          if (s < S.s - 12 || s > S.s + 420) continue;
          const pool = POOLS[ent.type];
          if (!pool) continue;
          const idx = used[ent.type] ?? 0;
          if (idx >= pool) continue;
          used[ent.type] = idx + 1;
          alive++;
          const f = frameAt(samples, Math.min(s, ROAD_LENGTH));
          const lateral = entityLateral(ent);
          const h = ent.type === "arch" ? 2.2 : ent.type === "oni" ? 1.5 : ent.type === "barrier" ? 1.1 : ent.type === "sweeper" ? 0.9 : entityHeight(ent);
          place(`ent-${ent.type}-${idx}`, f, lateral, h);
          if (ent.type === "power" || ent.type === "orb") node(`ent-${ent.type}-${idx}`).setScale(1);
        }
        for (const [type, count] of Object.entries(POOLS)) for (let i = used[type] ?? 0; i < count; i++) node(`ent-${type}-${i}`).setVisible(false);

        /* chase camera */
        const up: V3 = norm3([frame.U[0], frame.U[1], frame.U[2]]);
        if (!rig) rig = { f: [...frame.F], u: up };
        else {
          const k = 1 - Math.exp(-dt * 6);
          rig.f = norm3(lerp3(rig.f, frame.F, k));
          rig.u = norm3(lerp3(rig.u, up, k));
        }
        const flying = S.nimbus > 0;
        const back = flying ? 14 : 10 + Math.min(6, S.speed * 0.05);
        const rise = flying ? 5 : 4.2;
        const eye: V3 = [pose[0] - rig.f[0] * back + rig.u[0] * rise, pose[1] - rig.f[1] * back + rig.u[1] * rise, pose[2] - rig.f[2] * back + rig.u[2] * rise];
        const look: V3 = [pose[0] + rig.f[0] * 12 + rig.u[0] * 1.4, pose[1] + rig.f[1] * 12 + rig.u[1] * 1.4, pose[2] + rig.f[2] * 12 + rig.u[2] * 1.4];
        const fov = (aspect < 0.85 ? 74 : 62) + Math.min(10, Math.max(0, S.speed - 60) * 0.06);
        cameraController.setPose({ position: eye, target: look, up: rig.u, fov }, { cut: false });
        void dt;
      };

      return {
        update,
        resetCamera() { rig = null; },
        get nodeCount() { return handles.size; },
        get entityNodes() { return alive; }
      };
    }
  };
}

