/**
 * Bunker Zero autopilot: the `?demo=1` / `?autoplay=1` driver, renderer-free so the unit tests can play whole floors with it.
 * It aims at the nearest visible enemy, otherwise walks a BFS route to the next waypoint (weapon or armor nearby, then the key,
 * then the elevator), opening doors on the way.
 */
import { CELL } from "./maps";
import { cellCenter, type Sim, type SimInput } from "./sim";

export interface Autopilot { t: number; }
export const createAutopilot = (): Autopilot => ({ t: 0 });

const NO_INPUT: SimInput = { moveX: 0, moveZ: 0, turn: 0, pitchDelta: 0, fire: false, firePressed: false, reload: false, use: false };

function findCell(s: Sim, ch: string): [number, number] | null {
  for (let z = 0; z < s.state.h; z++) for (let x = 0; x < s.state.w; x++)
    if (s.state.grid[z * s.state.w + x] === ch) return [cellCenter(x), cellCenter(z)];
  return null;
}

/** Next cell centre on a 4-way BFS route from (x,z) to (tx,tz); doors count as walkable (the pilot opens them). */
function routeStep(s: Sim, x: number, z: number, tx: number, tz: number): [number, number] | null {
  const { w, h, grid } = s.state;
  const sx = Math.floor(x / CELL), sz = Math.floor(z / CELL), gx = Math.floor(tx / CELL), gz = Math.floor(tz / CELL);
  if (sx === gx && sz === gz) return [tx, tz];
  const walk = (cx: number, cz: number) => {
    if (cx < 0 || cz < 0 || cx >= w || cz >= h) return false;
    const ch = grid[cz * w + cx]!;
    if (ch === "D") return true;
    return !s.cellBlocked(cx, cz);
  };
  const prev = new Int32Array(w * h).fill(-2);
  const start = sz * w + sx, goal = gz * w + gx;
  prev[start] = -1;
  const q = [start];
  for (let head = 0; head < q.length; head++) {
    const idx = q[head]!;
    if (idx === goal) break;
    const cx = idx % w, cz = (idx / w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx, nz = cz + dz, ni = nz * w + nx;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h || prev[ni] !== -2 || !walk(nx, nz)) continue;
      prev[ni] = idx; q.push(ni);
    }
  }
  if (prev[goal] === -2) return null;
  let cur = goal;
  while (prev[cur] !== start && prev[cur] !== -1) cur = prev[cur]!;
  return [cellCenter(cur % w), cellCenter((cur / w) | 0)];
}

export function autopilotInput(pilot: Autopilot, sim: Sim, dt: number): SimInput {
  pilot.t += dt;
  const p = sim.state.player;
  const inp: SimInput = { ...NO_INPUT };
  if (pilot.t < 0.15) return inp;
  const pcx = Math.floor(p.x / CELL), pcz = Math.floor(p.z / CELL);
  for (const d of sim.state.doors) if (Math.abs(d.cx - pcx) + Math.abs(d.cz - pcz) <= 1 && d.open < 0.2) inp.use = true;

  let target: [number, number] | null = null;
  let best = 1e9;
  for (const e of sim.state.enemies) {
    if (e.state === "dead") continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < best && d < 24 && sim.hasLOS(p.x, p.z, e.x, e.z)) { best = d; target = [e.x, e.z]; }
  }
  let aimOnly = false;
  if (target) aimOnly = true;
  else {
    const pickup = sim.state.pickups.find((k) => (k.kind === "mg" || k.kind === "rocket" || k.kind === "armor" || k.kind === "ammo") && !k.taken && Math.hypot(k.x - p.x, k.z - p.z) < 9);
    const key = !p.key && sim.state.mode === "descent" ? sim.state.pickups.find((k) => k.kind === "key" && !k.taken) : undefined;
    // Kill House: hunt the nearest live enemy before heading for the exit
    // and on the last floor, hunt the Iron Warden once the key is in hand
    const live = sim.state.enemies.filter((e) => e.state !== "dead");
    const hunt = sim.state.mode === "killhouse"
      ? live.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]
      : live.find((e) => e.kind === "boss");
    const goal: [number, number] | null = pickup ? [pickup.x, pickup.z] : key ? [key.x, key.z] : hunt ? [hunt.x, hunt.z] : findCell(sim, "E");
    target = goal ? routeStep(sim, p.x, p.z, goal[0], goal[1]) ?? goal : null;
  }
  if (!target) return inp;
  const ang = Math.atan2(target[0] - p.x, -(target[1] - p.z));
  let d = ang - p.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  inp.turn = Math.max(-3.0 * dt, Math.min(3.0 * dt, d));
  const aligned = Math.abs(d) < 0.35;
  if (aimOnly) {
    inp.moveZ = best < 4.2 && aligned ? 0.2 : aligned || best < 10 ? 1 : 0.55;
    inp.moveX = best < 12 ? Math.sin(pilot.t * 2.2) * 0.45 : 0;
    if (best < 18 && aligned) { inp.fire = true; inp.firePressed = true; }
    // the rocket launcher is for the boss; switch to the best gun with rounds for everything else
    const boss = sim.state.enemies.some((e) => e.kind === "boss" && e.state !== "dead" && Math.hypot(e.x - p.x, e.z - p.z) <= best + 0.01);
    const want = boss && p.weapons.includes("rocket") && (p.ammo.rockets > 0 || (p.weapon === "rocket" && p.mag > 0)) && best > 4
      ? "rocket" : p.weapons.includes("mg") && (p.ammo.bullets > 0 || p.mags.mg > 0) ? "mg" : "pistol";
    if (p.weapon !== want && p.reloading <= 0) inp.weapon = want;
  } else {
    inp.moveZ = aligned ? 1 : 0.25;
  }
  if (p.mag === 0 && p.reloading <= 0) inp.reload = true;
  return inp;
}
