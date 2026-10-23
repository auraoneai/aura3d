/**
 * Rendering for the Kid Goku port: a painted-looking road ribbon along the original's centerline
 * (gaps cut out, bridges as plank strips), Power Pole spans, a cliff wall, a river, Dragon Balls, meat and
 * a placeholder hero on a Nimbus. Everything goes through the public `@aura3d/engine` surface; art is
 * procedural stand-ins (the original's assets and characters are not reproduced).
 */
import { camera, geometry, lights, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import type { Chapter } from "./chapter";
import type { SimState } from "./sim";

export type V3 = readonly [number, number, number];
const ROAD_HALF = 6;

/** Original `Hf` for the `journey` kind: the track centerline at distance `s`. */
export function centerline(s: number): V3 {
  const x = 14 * Math.sin(s * 9e-3) + 5 * Math.sin(s * 0.026);
  const t = Math.min(s, 1880) + Math.max(0, s - 1880) * 0.15;
  return [x, 70 - t * 0.032 + 3 * Math.sin(t * 0.014), -s];
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface Frame { point: V3; forward: V3; right: V3; up: V3 }
/** Original `Gf`/`Kf` for the journey kind (no banking outside walls): frame at `s`, offset by `lane`. */
export function frameAt(s: number, lane = 0): Frame {
  const forward = norm(sub(centerline(s + 0.4), centerline(s - 0.4)));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = norm(cross(right, forward));
  const c = centerline(s);
  return { point: [c[0] + right[0] * lane, c[1] + right[1] * lane, c[2] + right[2] * lane], forward, right, up };
}
const at = (s: number, lane: number, lift = 0): V3 => {
  const f = frameAt(s, lane);
  return [f.point[0] + f.up[0] * lift, f.point[1] + f.up[1] * lift, f.point[2] + f.up[2] * lift];
};

function ribbon(ch: Chapter, from: number, to: number, halfWidth: number, y: number, skipGaps: boolean, step = 2): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  let prev = -1;
  for (let s = from; s <= to + 1e-6; s += step) {
    const inGap = skipGaps && ch.gaps.some((g) => s > g.start - 1e-6 && s < g.end + 1e-6);
    if (inGap) { prev = -1; continue; }
    const l = at(s, -halfWidth, y), r = at(s, halfWidth, y);
    const i = positions.length / 3;
    positions.push(l[0], l[1], l[2], r[0], r[1], r[2]);
    if (prev >= 0) indices.push(prev, prev + 1, i, prev + 1, i + 1, i);
    prev = i;
  }
  return { positions, indices };
}
const ribbonGeometry = (r: { positions: number[]; indices: number[] }, name: string, mat: ReturnType<typeof material.pbr>) =>
  geometry.custom(geometry.dynamic({ positions: Float32Array.from(r.positions), indices: r.indices }), { name, material: mat, side: "double" } as never);

export interface World { readonly scene: ReturnType<typeof scene>; bind(app: AuraApp): WorldRuntime }
export interface WorldRuntime { update(state: SimState, aspect: number): void }

export function buildWorld(ch: Chapter): World {
  const b = scene().background("#9fd4e8").camera(camera.perspective({ position: [0, 74, 8], target: [0, 70, -20], fov: 55, near: 0.2, far: 900 }))
    .add(lights.directional({ name: "sun", position: [60, 190, 40], target: [0, 70, -120], intensity: 2.2, color: "#fff0d0" }))
    .add(lights.hemisphere({ name: "sky", skyColor: "#bfe3f2", groundColor: "#5f7a44", intensity: 0.6 }));
  b.add(ribbonGeometry(ribbon(ch, -30, ch.length + 70, ROAD_HALF, 0, true), "road", material.pbr({ color: "#c9a46a", roughness: 0.92, metallic: 0 })));
  b.add(ribbonGeometry(ribbon(ch, -30, ch.length + 70, ROAD_HALF + 14, -0.6, false, 6), "meadow", material.pbr({ color: "#7fae5b", roughness: 1, metallic: 0 })));
  for (const [i, g] of ch.gaps.entries()) {
    if (g.bridge) b.add(ribbonGeometry(ribbon(ch, g.start, g.end, 1.4, -0.05, false, 1), `bridge-${i}`, material.pbr({ color: "#7a5230", roughness: 0.9, metallic: 0 })));
  }
  for (const [i, w] of ch.waters.entries()) b.add(ribbonGeometry(ribbon(ch, w.start, w.end, ROAD_HALF + 8, -0.3, false, 4), `river-${i}`, material.pbr({ color: "#4aa3d8", roughness: 0.15, metallic: 0 })));
  for (const [i, w] of ch.walls.entries()) b.add(ribbonGeometry(ribbon(ch, w.start, w.end, ROAD_HALF + 1, 6, false, 5), `wall-${i}`, material.pbr({ color: "#d6a64d", roughness: 0.95, metallic: 0 })));
  for (const [i, p] of ch.poles.entries()) {
    for (const [side, edge] of [[0, p.start], [1, p.end]] as const) {
      const pos = at(edge, 0, 4);
      b.add(primitives.cylinder({ name: `pole-${i}-${side}`, size: [0.5, 8, 0.5], material: material.pbr({ color: "#a84f38", roughness: 0.7, metallic: 0 }) }).position(pos[0], pos[1], pos[2]).runtime({ id: `pole-${i}-${side}` }));
    }
  }
  for (const ball of ch.balls) {
    const pos = at(ball.s, ball.lane, ball.height);
    b.add(primitives.sphere({ name: `ball-${ball.star}`, size: 0.9, material: material.emissive({ color: "#f4a21e", emissive: "#ff8a1e" }) }).position(pos[0], pos[1], pos[2]).runtime({ id: `ball-${ball.star}` }));
  }
  for (const [i, m] of ch.meat.entries()) {
    const pos = at(m.s, m.lane, m.height ?? 1.15);
    b.add(primitives.sphere({ name: `meat-${i}`, size: 0.8, material: material.pbr({ color: "#a1522b", roughness: 0.8, metallic: 0 }) }).position(pos[0], pos[1], pos[2]).runtime({ id: `meat-${i}` }));
  }
  b.add(primitives.capsule({ name: "hero", size: [0.9, 1.9, 0.9], material: material.pbr({ color: "#f08a24", roughness: 0.6, metallic: 0 }) }).runtime({ id: "hero" }));
  b.add(primitives.sphere({ name: "nimbus", size: [2.2, 0.7, 2.2], material: material.emissive({ color: "#fff3b0", emissive: "#ffe27a" }) }).runtime({ id: "nimbus" }));

  return {
    scene: b,
    bind(app: AuraApp): WorldRuntime {
      const cam = app.camera;
      if (!cam) throw new Error("kid-goku port: app exposes no camera controller");
      const node = (id: string) => app.nodes.require(id);
      const hero = node("hero"), nimbus = node("nimbus");
      const balls = new Map(ch.balls.map((x) => [x.star, node(`ball-${x.star}`)] as const));
      const meat = ch.meat.map((_, i) => node(`meat-${i}`));
      let eye: V3 | null = null;
      let look: V3 | null = null;
      return {
        update(state, aspect) {
          const f = frameAt(state.s, state.lane);
          const lift = state.jump + 0.95;
          hero.setPosition(f.point[0] + f.up[0] * lift, f.point[1] + f.up[1] * lift, f.point[2] + f.up[2] * lift);
          const riding = state.nimbus.active || state.nimbus.call > 0;
          nimbus.setVisible(riding);
          if (riding) nimbus.setPosition(f.point[0] + f.up[0] * (state.jump - 0.1), f.point[1] + f.up[1] * (state.jump - 0.1), f.point[2] + f.up[2] * (state.jump - 0.1));
          for (const [star, h] of balls) h.setVisible(!state.balls.includes(star));
          meat.forEach((h, i) => h.setVisible(!state.eaten.has((ch.meat[i] as { s: number }).s)));
          // chase camera, as in the original (7.4 back, 3.3 up), eased
          const back = frameAt(state.s - 7.4, state.lane * 0.65), ahead = frameAt(Math.min(ch.length, state.s + 7), state.lane * 0.65);
          const wantEye: V3 = [back.point[0] + back.up[0] * (3.3 + state.jump * 0.35), back.point[1] + back.up[1] * (3.3 + state.jump * 0.35), back.point[2] + back.up[2] * (3.3 + state.jump * 0.35)];
          const wantLook: V3 = [ahead.point[0] + ahead.up[0] * 1.5, ahead.point[1] + ahead.up[1] * 1.5, ahead.point[2] + ahead.up[2] * 1.5];
          eye = eye ? [eye[0] + (wantEye[0] - eye[0]) * 0.35, eye[1] + (wantEye[1] - eye[1]) * 0.35, eye[2] + (wantEye[2] - eye[2]) * 0.35] : wantEye;
          look = look ? [look[0] + (wantLook[0] - look[0]) * 0.35, look[1] + (wantLook[1] - look[1]) * 0.35, look[2] + (wantLook[2] - look[2]) * 0.35] : wantLook;
          cam.setPose({ position: [eye[0], eye[1], eye[2]], target: [look[0], look[1], look[2]], up: [0, 1, 0], fov: aspect < 1 ? 62 : 55 + state.speed * 0.2 }, { cut: false });
        }
      };
    }
  };
}
