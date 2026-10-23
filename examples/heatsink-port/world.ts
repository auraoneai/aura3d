/**
 * HEATSINK world on the public `@aura3d/engine` surface: road ribbon (`geometry.dynamic` + author attributes +
 * `material.custom`), split-lane dividers, rock massifs, neon crystals, aurora sky dome, checkpoint veils, boost pads,
 * pickups, barrels, the player drone (primitives), exhaust points, chase camera, bloom and vignette. The original's
 * GLB/texture assets are re-created procedurally; see PORTING-NOTES.md.
 */
import { camera, effects, geometry, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import { CFG } from "./config";
import { buildDividers, buildProps, buildRoad, groundQuad, hexLinear, padQuad, veilQuad, type MeshData } from "./meshes";
import { pointsSpec, roadSpec, skySpec, solidSpec, veilSpec, type Rgb } from "./materials";
import { axisRotation, droneEuler, multiplyMat3 } from "./orient";
import type { Race } from "./race";
import { seededRandom } from "./rng";
import { Track, type Frame } from "./track";
import type { HudValues } from "./hud";

type Scene = ReturnType<typeof scene>;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function dynamicFrom(m: MeshData) {
  const attributes: Record<string, { itemSize: 1 | 2 | 3 | 4; data: Float32Array }> = {};
  for (const [k, v] of Object.entries(m.attrs)) if (v.length) attributes[k] = { itemSize: k === "roadUv" ? 2 : 3, data: f32(v) };
  return geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices), attributes });
}

const FOG_NODES: string[] = [];
const fogTracked = <T>(id: string, value: T): T => { FOG_NODES.push(id); return value; };

interface PartSpec { id: string; offset: readonly [number, number, number]; kind: "body" | "nose" | "pod" | "fin" | "core" }
const DRONE_PARTS: readonly PartSpec[] = [
  { id: "drone-body", offset: [0, 0, 0], kind: "body" },
  { id: "drone-nose", offset: [2.9, -0.05, 0], kind: "nose" },
  { id: "drone-pod-l", offset: [-0.6, 0, -1.9], kind: "pod" },
  { id: "drone-pod-r", offset: [-0.6, 0, 1.9], kind: "pod" },
  { id: "drone-fin", offset: [-2.0, 0.8, 0], kind: "fin" },
  { id: "drone-core", offset: [-2.6, 0, 0], kind: "core" }
];

export interface WorldRuntime {
  update(race: Race, hud: HudValues, dt: number, time: number, aspect: number): void;
  resetCamera(): void;
  readonly nodeCount: number;
}

export interface World {
  readonly scene: Scene;
  readonly track: Track;
  bind(app: AuraApp): WorldRuntime;
}

export function buildWorld(track: Track, quality: "high" | "low" = "high"): World {
  const high = quality === "high";
  let minY = Infinity;
  for (let i = 0; i < track.n; i++) minY = Math.min(minY, track.py[i] as number);
  const b: Scene = scene()
    .background("#02040a")
    .camera(camera.perspective({ position: [0, 40, 0], target: [0, 0, 0], fov: CFG.camera.fovBase, near: 0.3, far: 4200 }));

  b.add(geometry.custom(dynamicFrom(buildRoad(track, high ? 3 : 5)), { name: "road", material: material.custom(roadSpec()) }).runtime({ id: fogTracked("road", "road") }));
  b.add(geometry.custom(dynamicFrom(buildDividers(track, 3, 3)), { name: "dividers", material: material.custom(solidSpec(hexLinear("#2a2f3f"), hexLinear("#40e0ff"), 0.25)) }).runtime({ id: fogTracked("dividers", "dividers") }));
  const props = buildProps(track);
  b.add(geometry.custom(dynamicFrom(props.rocks), { name: "rocks", material: material.custom(solidSpec(hexLinear("#6c7f86"), hexLinear("#2a3a40"), 0.05)) }).runtime({ id: fogTracked("rocks", "rocks") }));
  b.add(geometry.custom(dynamicFrom(props.crystals), { name: "crystals", material: material.custom(solidSpec(hexLinear("#3ad8c8"), hexLinear("#4ff0e0"), 0.9)) }).runtime({ id: fogTracked("crystals", "crystals") }));
  b.add(geometry.custom(dynamicFrom(groundQuad(5000, minY - 90)), { name: "abyss", material: material.custom(solidSpec(hexLinear("#2a3a40"), hexLinear("#0b1a26"), 0.05)) }).runtime({ id: fogTracked("abyss", "abyss") }));
  // size 900 with side "double": a back-culled or 3400-unit dome drew nothing in remote probes (see PORTING-NOTES.md)
  b.add(primitives.sphere({ name: "sky", size: 900, material: material.custom({ ...skySpec(), side: "double" }) }).runtime({ id: "sky" }));

  /* checkpoint gates: veil across the road + two pylons */
  track.checkpoints.forEach((s, i) => {
    const fr = track.frame(s);
    const color = hexLinear(fr.sec.hud.color);
    b.add(geometry.custom(dynamicFrom(veilQuad(track, s, 22)), { name: `gate-veil-${i}`, material: material.custom(veilSpec(color, "gate")) }).runtime({ id: `gate-veil-${i}` }));
    const rot = droneEuler(fr, 0, 0, 0);
    for (const side of [-1, 1]) {
      const lat = side * (fr.hw + 0.6);
      b.add(primitives.cylinder({
        name: `gate-${i}-pylon-${side}`,
        position: [fr.x + fr.rx * lat, fr.y + 11, fr.z + fr.rz * lat],
        rotation: [...rot],
        size: [1.2, 22, 1.2],
        material: material.custom(solidSpec(hexLinear("#1b2036"), color, 1.4))
      }));
    }
  });

  /* boost pads */
  track.boostPads.forEach((p, i) => {
    b.add(geometry.custom(dynamicFrom(padQuad(track, p.s, p.x)), { name: `pad-${i}`, material: material.custom(veilSpec([1, 0.62, 0.15], "pad")) }).runtime({ id: `pad-${i}` }));
  });

  /* pickups and barrels */
  track.pickups.forEach((p, i) => {
    const shield = p.kind === "shield";
    b.add(primitives.polyhedron({
      name: `pickup-${i}`,
      params: { variant: "octahedron", detail: 0, radius: 1.0 },
      material: material.custom(solidSpec(shield ? hexLinear("#5fd0ff") : hexLinear("#6dffb0"), shield ? hexLinear("#5fd0ff") : hexLinear("#6dffb0"), 1.1))
    }).runtime({ id: fogTracked(`pickup-${i}`, `pickup-${i}`) }));
  });
  track.barrels.forEach((_, i) => {
    b.add(primitives.cylinder({
      name: `barrel-${i}`,
      size: [1.5, 2.2, 1.5],
      material: material.custom(solidSpec(hexLinear("#8a2b12"), hexLinear("#ff5a1f"), 0.7))
    }).runtime({ id: fogTracked(`barrel-${i}`, `barrel-${i}`) }));
  });

  /* player drone */
  for (const part of DRONE_PARTS) {
    const hull = hexLinear("#b4531f"), accent = hexLinear("#ff9a4a"), hot = hexLinear("#bff6ff");
    const mat = (base: Rgb, glow: Rgb, amount: number) => material.custom(solidSpec(base, glow, amount));
    const handle = (() => {
      switch (part.kind) {
        case "body": return primitives.box({ name: part.id, size: [5.2, 0.9, 1.9], material: mat(hull, accent, 0.18) });
        case "nose": return primitives.cone({ name: part.id, params: { radius: 0.95, height: 2.4, radialSegments: 6 }, material: mat(hull, accent, 0.3) });
        case "pod": return primitives.box({ name: part.id, size: [3.6, 0.55, 0.9], material: mat(hexLinear("#2a2f36"), accent, 0.15) });
        case "fin": return primitives.box({ name: part.id, size: [1.6, 1.3, 0.12], material: mat(hull, accent, 0.4) });
        default: return primitives.sphere({ name: part.id, size: 0.85, material: mat(hot, hot, 1.8) });
      }
    })();
    b.add(handle.runtime({ id: fogTracked(part.id, part.id) }));
  }

  /* exhaust / dust points */
  const POINTS = 220;
  b.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array<number>(POINTS * 3).fill(0)),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(new Array<number>(POINTS).fill(0)) },
      tint: { itemSize: 3, data: f32(new Array<number>(POINTS * 3).fill(1)) },
      fade: { itemSize: 1, data: f32(new Array<number>(POINTS).fill(0)) }
    }
  }), { name: "exhaust", material: material.custom(pointsSpec()) }).runtime({ id: "exhaust" }));

  b.add(effects.bloom({ name: "bloom", intensity: 0.5, threshold: 1.0, radius: 0.4 }));
  b.add(effects.vignette({ name: "vignette" }));

  return { scene: b, track, bind: (app) => bindRuntime(app, track, POINTS) };
}

function bindRuntime(app: AuraApp, track: Track, points: number): WorldRuntime {
  const cam = app.camera;
  if (!cam) throw new Error("heatsink-port: the app exposes no camera controller");
  const cameraController: NonNullable<typeof cam> = cam;
  const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
  const node = (id: string) => {
    let h = handles.get(id);
    if (!h) handles.set(id, h = app.nodes.require(id));
    return h;
  };
  const gatePulse = track.checkpoints.map(() => 0);
  const padPulse = track.boostPads.map(() => 0);
  let seen = 0;
  const pos = new Float32Array(points * 3);
  const size = new Float32Array(points);
  const fade = new Float32Array(points);
  const tint = new Float32Array(points * 3);
  const age = new Float32Array(points).fill(1);
  const vel = new Float32Array(points * 3);
  let head = 0;
  let budget = 0;
  const rng = seededRandom(4242);
  let rig: [number, number, number] | null = null;
  const frame: Partial<Frame> = {};

  const rotationOf = (e: readonly [number, number, number]) => multiplyMat3(multiplyMat3(axisRotation("z", e[2]), axisRotation("y", e[1])), axisRotation("x", e[0]));

  function update(race: Race, hud: HudValues, dt: number, time: number, aspect: number): void {
    const p = race.player;
    const fr = track.frame(p.s, frame);
    /* drone */
    const euler = droneEuler(fr, p.theta, p.pitch, p.lean);
    const R = rotationOf(euler);
    const heatGlow = Math.min(1, p.heat);
    for (const part of DRONE_PARTS) {
      const h = node(part.id);
      h.setVisible(!p.crashed);
      if (p.crashed) continue;
      const [ox, oy, oz] = part.offset;
      h.setPosition(
        p.position.x + R[0] * ox + R[1] * oy + R[2] * oz,
        p.position.y + R[3] * ox + R[4] * oy + R[5] * oz,
        p.position.z + R[6] * ox + R[7] * oy + R[8] * oz
      );
      h.setRotation(euler[0], euler[1], euler[2]);
      h.setUniform?.("heat", heatGlow);
      h.setUniform?.("flash", p.invuln > 0 ? 0.5 + 0.5 * Math.sin(time * 30) : 0);
    }
    const nose = node("drone-nose");
    if (!p.crashed) nose.setRotation(euler[0], euler[1], euler[2] - Math.PI / 2);

    /* camera */
    const hd = Math.cos(p.theta), hs = Math.sin(p.theta);
    const dir: [number, number, number] = [fr.tx * hd + fr.rx * hs, 0, fr.tz * hd + fr.rz * hs];
    if (!rig) rig = [...dir];
    else {
      const k = 1 - Math.exp(-dt * 6);
      rig = [rig[0] + (dir[0] - rig[0]) * k, 0, rig[2] + (dir[2] - rig[2]) * k];
    }
    const rl = Math.hypot(rig[0], rig[2]) || 1;
    const fx = rig[0] / rl, fz = rig[2] / rl;
    const c = CFG.camera;
    const eye = [p.position.x - fx * c.dist, p.position.y + c.height, p.position.z - fz * c.dist] as const;
    const look = [p.position.x + fx * c.lookAhead, p.position.y + 0.8, p.position.z + fz * c.lookAhead] as const;
    const speed01 = Math.min(1, p.v / CFG.vehicle.maxSpeed);
    const fovBase = c.fovBase + (c.fovMax - c.fovBase) * speed01 * speed01 + (p.rjActive ? c.fovRamjet * 0.35 : 0);
    const fov = Math.min(c.fovMax, aspect < 0.85 ? fovBase + 8 : fovBase);
    cameraController.setPose({ position: [eye[0], eye[1], eye[2]], target: [look[0], look[1], look[2]], up: [0, 1, 0], fov }, { cut: false });
    node("sky").setPosition(eye[0], eye[1], eye[2]);

    /* checkpoint, pad pulses from the sim's events */
    for (; seen < race.events.length; seen++) {
      const e = race.events[seen]!;
      if (e.type === "checkpoint") { const i = track.checkpoints.indexOf(e.detail as number); if (i >= 0) gatePulse[i] = 1; }
      if (e.type === "boostPad") { const i = track.boostPads.findIndex((q) => q.s === e.detail); if (i >= 0) padPulse[i] = 1; }
    }
    if (seen > race.events.length) seen = race.events.length;
    gatePulse.forEach((v, i) => { gatePulse[i] = Math.max(0, v - dt * 0.8); node(`gate-veil-${i}`).setUniform?.("veilPulse", gatePulse[i]!); });
    padPulse.forEach((v, i) => { padPulse[i] = Math.max(0, v - dt * 1.2); node(`pad-${i}`).setUniform?.("veilPulse", padPulse[i]!); });

    /* pickups and barrels */
    track.pickups.forEach((_, i) => {
      const pk = race.pickups[i]!;
      const h = node(`pickup-${i}`);
      h.setVisible(pk.respawn <= 0);
      if (pk.respawn > 0) return;
      const w = track.toWorld(pk.s, pk.x, track.frame(pk.s).y + 1.6 + Math.sin(time * 2 + i) * 0.25);
      h.setPosition(w.x, w.y, w.z);
      h.setRotation(0, time * 1.6 + i, 0);
    });
    race.barrels.forEach((bar, i) => {
      const h = node(`barrel-${i}`);
      h.setVisible(bar.alive);
      if (!bar.alive) return;
      const w = track.toWorld(bar.s, bar.x, bar.y + 1.1);
      h.setPosition(w.x, w.y, w.z);
    });

    /* exhaust */
    if (!p.crashed && p.v > 4) {
      budget += Math.min(0.1, dt) * (p.abActive ? 520 : 90 + p.v * 1.4);
      let spawned = 0;
      while (budget >= 1 && spawned < 14) {
        budget -= 1;
        spawned++;
        const k = head++ % points;
        const back = 2.9 + rng() * 0.4;
        pos[k * 3] = p.position.x - fx * back + (rng() - 0.5) * 0.9;
        pos[k * 3 + 1] = p.position.y + (rng() - 0.5) * 0.5;
        pos[k * 3 + 2] = p.position.z - fz * back + (rng() - 0.5) * 0.9;
        vel[k * 3] = -fx * 4; vel[k * 3 + 1] = 0.4; vel[k * 3 + 2] = -fz * 4;
        const t = p.abActive || p.burstT > 0 ? [1, 0.55, 0.15] : [0.25, 0.8, 1];
        tint[k * 3] = t[0]!; tint[k * 3 + 1] = t[1]!; tint[k * 3 + 2] = t[2]!;
        age[k] = 0;
      }
    }
    for (let k = 0; k < points; k++) {
      age[k]! += dt / 0.5;
      const alive = age[k]! < 1;
      pos[k * 3]! += vel[k * 3]! * dt; pos[k * 3 + 1]! += vel[k * 3 + 1]! * dt; pos[k * 3 + 2]! += vel[k * 3 + 2]! * dt;
      size[k] = alive ? 7 * (1 - age[k]! * 0.5) : 0;
      fade[k] = alive ? (1 - age[k]!) * 0.8 : 0;
    }
    const ex = node("exhaust");
    ex.updateAttribute?.("position", { array: pos, offset: 0 });
    ex.updateAttribute?.("size", { array: size, offset: 0 });
    ex.updateAttribute?.("fade", { array: fade, offset: 0 });
    ex.updateAttribute?.("tint", { array: tint, offset: 0 });
    void hud;
  }

  return { update, resetCamera() { rig = null; seen = 0; }, get nodeCount() { return handles.size; } };
}
