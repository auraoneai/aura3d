/** Cross Hop core: scene builder, pooled visuals, run simulation. */
import {
  game, looks, model, scene, camera, instances,
  primitives, material, type AuraApp
} from "@aura3d/engine";
import { assets } from "../aura-assets";
import {
  COL_MAX, COL_MIN, COL_W, FIELD_HALF, LANE_D, STRIP_W, THEMES,
  themeIndexForRow, type LaneType
} from "./themes";
import { laneFor, laneZ, laneMovers, moverHalf, railCycle, railWarning, writeMat, type Lane } from "./world";
import { loadProfile, saveProfile, type Profile } from "./persistence";

// ---------------- pool capacities ----------------
const CAP = {
  ground: 56, detail: 260, glow: 140,
  car: 46, truck: 18, tram: 12, train: 6, hover: 26,
  log: 48, pad: 48, stone: 48, coin: 26,
  trunk: 64, canopy: 64, dressB: 90
} as const;

export type Mode = "title" | "run" | "dead";
export type RunKind = "quick" | "tour" | "drill";

export interface CritterDef {
  readonly id: string; readonly label: string; readonly asset: keyof typeof assets;
  readonly price: number; readonly tagline: string;
}
export const CRITTERS: readonly CritterDef[] = [
  { id: "hop", label: "Hop", asset: "hop", price: 0, tagline: "The original lane-hopper." },
  { id: "chick", label: "Chick", asset: "chick", price: 60, tagline: "Tiny feet, zero fear." },
  { id: "turtle", label: "Turtle", asset: "turtle", price: 80, tagline: "Slow is a strategy." },
  { id: "bun", label: "Bun", asset: "bun", price: 90, tagline: "Ears up, eyes forward." },
  { id: "axolotl", label: "Axolotl", asset: "axolotl", price: 120, tagline: "Swims rivers in spirit." },
  { id: "ducky", label: "Ducky", asset: "ducky", price: 140, tagline: "Quacken on approach." },
  { id: "roboFrog", label: "Robo-Frog", asset: "roboFrog", price: 180, tagline: "Chrome amphibian v2." },
  { id: "toastCat", label: "Toast Cat", asset: "toastCat", price: 200, tagline: "Lands butter-side up." },
  { id: "mushroomKid", label: "Mushroom Kid", asset: "mushroomKid", price: 220, tagline: "Spore-driven athlete." },
  { id: "knightToad", label: "Knight Toad", asset: "knightToad", price: 260, tagline: "Armored for asphalt." },
  { id: "astroFrog", label: "Astro-Frog", asset: "astroFrog", price: 320, tagline: "One small hop for frogkind." },
  { id: "goldenHop", label: "Golden Hop", asset: "goldenHop", price: 500, tagline: "Legend-tier shine." }
] as const;

export interface DrillDef { readonly id: string; readonly label: string; readonly desc: string; readonly script: readonly LaneType[]; }
export const DRILLS: readonly DrillDef[] = [
  {
    id: "traffic-gaps", label: "Traffic Gaps", desc: "Read the cars, hop the gaps.",
    script: ["meadow", "meadow", "road", "meadow", "road", "road", "meadow", "road", "meadow", "meadow"]
  },
  {
    id: "log-hops", label: "Log Hops", desc: "Ride the river or sleep in it.",
    script: ["meadow", "river", "river", "meadow", "river", "river", "river", "meadow", "meadow", "meadow"]
  },
  {
    id: "train-dodges", label: "Train Dodges", desc: "Horn means move. Now.",
    script: ["meadow", "rail", "meadow", "rail", "rail", "meadow", "lava", "rail", "meadow", "meadow"]
  }
];

export interface Death { kind: "squashed" | "flattened" | "drowned" | "burned" | "snatched"; label: string }

const COLORS = {
  coin: "#ffd94a", pod: "#ff9ed2", carBody: "#e05555", water: "#3f8fd2",
  glow: "#ff8a3d", railSignal: "#ff3355"
};

// ---------------- game state ----------------
export interface GameState {
  mode: Mode;
  runKind: RunKind;
  drill: DrillDef | null;
  profile: Profile;
  seed: number;
  time: number;
  score: number; coins: number; row: number; bestRow: number;
  playerRow: number; playerCol: number;
  hop: { active: boolean; t: number; fromX: number; fromZ: number; toX: number; toZ: number; dir: string };
  idle: number;
  dead: Death | null;
  deadAt: number;
  lanes: Map<number, Lane>;
  critter: CritterDef;
  message: string;
  messageT: number;
  themeIdx: number;
  events: string[];
  podTaken: Set<number>;
  coinTaken: Set<number>;
  autopilot: boolean;
  apTimer: number;
  dressKey: string;
  forceTheme: number | undefined;
}

export const st: GameState = {
  mode: "title", runKind: "quick", drill: null,
  profile: loadProfile(),
  seed: 1, time: 0,
  score: 0, coins: 0, row: 0, bestRow: 0,
  playerRow: 0, playerCol: 0,
  hop: { active: false, t: 0, fromX: 0, fromZ: 0, toX: 0, toZ: 0, dir: "fwd" },
  idle: 0, dead: null, deadAt: 0,
  lanes: new Map(),
  critter: CRITTERS[0],
  message: "", messageT: 0,
  themeIdx: 0, events: [],
  podTaken: new Set(), coinTaken: new Set(),
  autopilot: false, apTimer: 0, dressKey: "",
  forceTheme: undefined
};

const ROW_AHEAD = 26, ROW_BEHIND = 8;
const HOP_DUR = 0.16;
const HAWK_WARN = 3.0, HAWK_KILL = 5.2;

// scratch buffers — allocated once
const XS = new Float32Array(24);
const POOL = {} as Record<keyof typeof CAP, { mat: Float32Array; col: Float32Array; n: number }>;
for (const k of Object.keys(CAP) as (keyof typeof CAP)[]) {
  POOL[k] = { mat: new Float32Array(CAP[k] * 16), col: new Float32Array(CAP[k] * 4), n: 0 };
}
function P(k: keyof typeof CAP) { return POOL[k]; }
function inst(k: keyof typeof CAP, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, ry = 0): void {
  const p = P(k);
  if (p.n >= CAP[k]) return;
  writeMat(p.mat, p.n, x, y, z, sx, sy, sz, ry);
  const v = parseInt(color.slice(1), 16);
  p.col[p.n * 4] = ((v >> 16) & 255) / 255;
  p.col[p.n * 4 + 1] = ((v >> 8) & 255) / 255;
  p.col[p.n * 4 + 2] = (v & 255) / 255;
  p.col[p.n * 4 + 3] = 1;
  p.n++;
}

function difficulty(): number {
  return Math.min(1, st.playerRow / 220);
}

/** Lane descriptor for row, honoring drill scripts. */
export function lane(row: number): Lane {
  let l = st.lanes.get(row);
  if (!l) {
    if (st.runKind === "drill" && st.drill) {
      const type = st.drill.script[Math.min(row, st.drill.script.length - 1)] ?? "meadow";
      l = laneFor(row, st.seed, difficulty());
      if (row > 1 && row < st.drill.script.length) {
        l = { ...l, type, moverKind: type === "road" ? "car" : type === "tram" ? "tram" : type === "rail" ? "train" : type === "river" ? "log" : type === "lava" ? "stone" : "none", speed: type === "road" ? 3.4 : type === "rail" ? 15 : type === "river" ? 1.8 : type === "lava" ? 1.8 : type === "tram" ? 3.6 : 0, theme: 0 };
      } else {
        l = { ...l, type: "meadow", moverKind: "none", speed: 0, theme: 0 };
      }
    } else {
      l = laneFor(row, st.seed, difficulty(), st.forceTheme);
    }
    st.lanes.set(row, l);
  }
  return l;
}

export function startRun(kind: RunKind, drill: DrillDef | null, seed?: number, forceTheme?: number): void {
  st.runKind = kind; st.drill = drill;
  st.seed = seed ?? ((Math.random() * 0xffffffff) >>> 0);
  st.forceTheme = forceTheme;
  st.time = 0; st.score = 0; st.row = 0;
  st.playerRow = 0; st.playerCol = 0;
  st.hop.active = false; st.idle = 0; st.dead = null;
  st.lanes.clear(); st.podTaken.clear(); st.coinTaken.clear();
  st.events.length = 0;
  st.critter = CRITTERS.find(c => c.id === st.profile.selected) ?? CRITTERS[0];
  st.themeIdx = 0; st.dressKey = "";
  if (forceTheme !== undefined) { st.themeIdx = forceTheme; swapLook(forceTheme); }
  st.mode = "run";
  pushEvent(kind === "drill" ? `Drill: ${drill?.label}` : kind === "tour" ? "World Tour departure" : "Quick Play");
}

export function endToTitle(): void { st.mode = "title"; saveProfile(st.profile); }

export function pushEvent(msg: string): void {
  st.events.push(msg);
  if (st.events.length > 6) st.events.shift();
  st.message = msg; st.messageT = 2.6;
}

function die(kind: Death["kind"], label: string): void {
  if (st.dead) return;
  st.dead = { kind, label };
  st.deadAt = st.time;
  st.mode = "dead";
  const total = st.profile.coins + st.coins;
  st.profile.coins = total;
  if (st.score > st.profile.best) st.profile.best = st.score;
  saveProfile(st.profile);
  pushEvent(`${label} — run over at ${st.score}`);
}

// -------------------- scene --------------------
export function buildScene(): unknown {
  const lookId = THEMES[0].look as Parameters<typeof looks.preset>[0];
  const s = scene()
    .add(looks.preset(lookId, { fogDensityScale: THEMES[0].fogScale, exposureEv: THEMES[0].exposureEv })
      .runtime(game.runtimeNode("look")))
    .camera(camera.perspective({ position: [0, 7.2, 7.4], target: [0, 0.3, -3], fov: 46 }));

  const groundMat = material.pbr({ color: "#ffffff", roughness: 0.92, metalness: 0 });
  const detailMat = material.pbr({ color: "#ffffff", roughness: 0.8, metalness: 0.05 });
  const glowMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.6, roughness: 0.4 });
  const pad = (n: number) => Array.from({ length: n }, () => ({ position: [0, -999, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number] }));
  const zero = new Float32Array(16); writeMat(zero, 0, 0, -999, 0, 0.001, 0.001, 0.001);

  s.addMany([
    instances.box({ name: "lane-ground", size: [1, 1, 1], material: groundMat, transforms: pad(CAP.ground), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-ground")),
    instances.box({ name: "lane-detail", size: [1, 1, 1], material: detailMat, transforms: pad(CAP.detail), castShadow: false, receiveShadow: true }).runtime(game.runtimeNode("pool-detail")),
    instances.box({ name: "lane-glow", size: [1, 1, 1], material: glowMat, transforms: pad(CAP.glow), castShadow: false }).runtime(game.runtimeNode("pool-glow")),
    instances.model(assets.trafficSedan, { name: "m-cars", transforms: pad(CAP.car), targetLength: 2.1, castShadow: true }).runtime(game.runtimeNode("pool-car")),
    instances.model(assets.trafficBoxtruck, { name: "m-trucks", transforms: pad(CAP.truck), targetLength: 3.6, castShadow: true }).runtime(game.runtimeNode("pool-truck")),
    instances.model(assets.tramCar, { name: "m-trams", transforms: pad(CAP.tram), targetLength: 4.6, castShadow: true }).runtime(game.runtimeNode("pool-tram")),
    instances.model(assets.trainCar, { name: "m-trains", transforms: pad(CAP.train), targetLength: 11, castShadow: true }).runtime(game.runtimeNode("pool-train")),
    instances.model(assets.trafficSkyCar, { name: "m-hover", transforms: pad(CAP.hover), targetLength: 2.4, castShadow: true }).runtime(game.runtimeNode("pool-hover")),
    instances.cylinder({ name: "m-logs", size: [1, 1, 1], material: material.pbr({ color: "#7a5230", roughness: 0.95 }), transforms: pad(CAP.log) }).runtime(game.runtimeNode("pool-log")),
    instances.cylinder({ name: "m-pads", size: [1, 1, 1], material: material.pbr({ color: "#4f9e4f", roughness: 0.85 }), transforms: pad(CAP.pad) }).runtime(game.runtimeNode("pool-pad")),
    instances.sphere({ name: "m-stones", size: [1, 1, 1], material: material.pbr({ color: "#4b4b55", roughness: 0.9 }), transforms: pad(CAP.stone) }).runtime(game.runtimeNode("pool-stone")),
    instances.model(assets.coin, { name: "m-coins", transforms: pad(CAP.coin), targetHeight: 0.5 }).runtime(game.runtimeNode("pool-coin")),
    instances.cylinder({ name: "d-trunks", size: [1, 1, 1], material: detailMat, transforms: pad(CAP.trunk) }).runtime(game.runtimeNode("pool-trunk")),
    instances.sphere({ name: "d-canopy", size: [1, 1, 1], material: detailMat, transforms: pad(CAP.canopy) }).runtime(game.runtimeNode("pool-canopy")),
    instances.box({ name: "d-b", size: [1, 1, 1], material: detailMat, transforms: pad(CAP.dressB) }).runtime(game.runtimeNode("pool-dressb")),
    model(assets.hop, { name: "player", targetHeight: 0.42, castShadow: true })
      .position(0, 0.13, 0).rotate(0, Math.PI, 0)
      .animate({ clip: "Idle", loop: true })
      .runtime(game.runtimeNode("player")),
    model(assets.hawk, { name: "hawk", targetHeight: 0.85, castShadow: true })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("hawk")),
    model(assets.rescuePod, { name: "pod", targetHeight: 0.75, castShadow: true })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("pod")),
    primitives.plane({ name: "waterline", size: [STRIP_W + 10, 1, 1], material: material.pbr({ color: "#000000" }) })
      .position(0, -999, 0).rotate(-Math.PI / 2, 0, 0)
      .runtime(game.runtimeNode("skirt"))
  ]);
  return s.toJSON();
}

// -------------------- per-frame --------------------
let app: AuraApp | null = null;
let nodeOk = true;

export function bindApp(a: AuraApp): void { app = a; }

const CAR_KEYS: (keyof typeof assets)[] = ["trafficSedan", "trafficHatch", "trafficSuv", "trafficTaxi", "trafficVan", "trafficPickup"];
const VEHICLE_POOL: Record<string, keyof typeof CAP> = { car: "car", truck: "truck", tram: "tram", train: "train", hover: "hover" };

export function frame(dt: number, input: { buffered(d: string, w: number): boolean }): void {
  st.time += dt;
  if (st.mode === "run") runFrame(dt, input);
  syncVisuals(dt);
}

function runFrame(dt: number, input: { buffered(d: string, w: number): boolean }): void {
  const p = st.playerCol * COL_W, pz = laneZ(st.playerRow);
  const l = lane(st.playerRow);
  st.idle += dt;

  // platform carry (river/lava)
  if (!st.hop.active && (l.type === "river" || l.type === "lava")) {
    const on = platformUnder(l, p);
    if (on < 0) { die(l.type === "river" ? "drowned" : "burned", l.type === "river" ? "Drowned" : "Burned"); return; }
    st.idle = 0; // riding counts as alive
  }
  // hawk pressure
  if (st.idle > HAWK_KILL) { die("snatched", "Snatched by the hawk"); return; }

  // hop trigger
  if (!st.hop.active) {
    let dir: string | null = null;
    if (input.buffered("up", 0.14)) dir = "fwd";
    else if (input.buffered("down", 0.14)) dir = "back";
    else if (input.buffered("left", 0.14)) dir = "left";
    else if (input.buffered("right", 0.14)) dir = "right";
    if (dir) tryHop(dir);
    else if (st.autopilot) autopilot(dt);
  } else {
    st.hop.t += dt / HOP_DUR;
    if (st.hop.t >= 1) landHop();
  }

  // squash check on hazard lanes (while standing, not hopping)
  if (!st.hop.active && !st.dead) {
    const laneType = l.type;
    if (laneType === "road" || laneType === "tram") {
      const n = laneMovers(l, st.time, XS);
      for (let i = 0; i < n; i++) {
        if (Math.abs(XS[i] - p) < moverHalf(l) + 0.3) { die("squashed", "Squashed"); break; }
      }
    } else if (laneType === "rail") {
      const n = laneMovers(l, st.time, XS);
      for (let i = 0; i < n; i++) {
        if (Math.abs(XS[i] - p) < moverHalf(l) + 0.3) { die("flattened", "Flattened by the train"); break; }
      }
    }
    // screen-edge drown
    if (Math.abs(p) > FIELD_HALF) die("drowned", "Swept away");
  }
}

function tryHop(dir: string): void {
  let nr = st.playerRow, nc = st.playerCol;
  if (dir === "fwd") nr++;
  else if (dir === "back") nr = Math.max(0, nr - 1);
  else if (dir === "left") nc = Math.max(COL_MIN, nc - 1);
  else if (dir === "right") nc = Math.min(COL_MAX, nc + 1);
  st.hop = { active: true, t: 0, fromX: st.playerCol * COL_W, fromZ: laneZ(st.playerRow), toX: nc * COL_W, toZ: laneZ(nr), dir };
  st.playerRow = nr; st.playerCol = nc;
  st.idle = 0;
  if (dir === "fwd") { st.score++; st.row = Math.max(st.row, nr); }
}

function landHop(): void {
  st.hop.active = false;
  const l = lane(st.playerRow);
  const x = st.playerCol * COL_W;
  if (l.hasCoin && !st.coinTaken.has(l.row) && l.coinCol === st.playerCol) {
    st.coinTaken.add(l.row); st.coins += 10; st.score += 10;
    pushEvent("+10 coin");
    app?.effects?.burst("pickup", [x, 0.6, laneZ(st.playerRow)], { count: 14, speed: 2.2, scale: 0.5, color: COLORS.coin });
  }
  if (l.hasPod && !st.podTaken.has(l.row) && l.podCol === st.playerCol) {
    st.podTaken.add(l.row); st.score += 50;
    const locked = CRITTERS.filter(c => !st.profile.unlocked.includes(c.id));
    if (locked.length) {
      const pick = locked[Math.floor(Math.random() * locked.length)];
      st.profile.unlocked.push(pick.id);
      pushEvent(`+50 rescue pod — ${pick.label} unlocked!`);
    } else pushEvent("+50 rescue pod");
    app?.effects?.burst("aura-burst", [x, 0.8, laneZ(st.playerRow)], { count: 30, speed: 3, scale: 0.7, color: COLORS.pod });
  }
  if (l.type === "river" || l.type === "lava") {
    if (platformUnder(l, x) < 0) die(l.type === "river" ? "drowned" : "burned", l.type === "river" ? "Drowned" : "Burned");
  }
  // drill completion
  if (st.runKind === "drill" && st.drill && st.playerRow >= st.drill.script.length) {
    if (!st.profile.drills.includes(st.drill.id)) {
      st.profile.drills.push(st.drill.id);
      st.coins += 25;
      pushEvent(`Drill cleared: ${st.drill.label} (+25)`);
    }
    st.mode = "dead";
    st.dead = null; // reuse summary card
    st.profile.coins += st.coins;
    saveProfile(st.profile);
  }
  // theme shift
  const ti = st.runKind === "drill" ? 0 : (st.forceTheme ?? themeIndexForRow(st.playerRow, st.seed));
  if (ti !== st.themeIdx) {
    st.themeIdx = ti;
    swapLook(ti);
    pushEvent(`Theme: ${THEMES[ti].label}`);
  }
}

function platformUnder(l: Lane, x: number): number {
  const n = laneMovers(l, st.time, XS);
  for (let i = 0; i < n; i++) if (Math.abs(XS[i] - x) < moverHalf(l)) return XS[i];
  return -1e9;
}

let apState = 0;
function autopilot(dt: number): void {
  st.apTimer += dt;
  if (st.apTimer < 0.3) return;
  st.apTimer = 0;
  const ahead = lane(st.playerRow + 1);
  const x = st.playerCol * COL_W;
  const safe = (l: Lane, col: number): boolean => {
    const px = col * COL_W;
    if (l.type === "road" || l.type === "tram" || l.type === "rail") {
      const n = laneMovers(l, st.time + HOP_DUR, XS);
      for (let i = 0; i < n; i++) if (Math.abs(XS[i] - px) < moverHalf(l) + 0.9) return false;
      return true;
    }
    if (l.type === "river" || l.type === "lava") {
      const n = laneMovers(l, st.time + HOP_DUR, XS);
      for (let i = 0; i < n; i++) if (Math.abs(XS[i] - px) < moverHalf(l) + 0.2) return true;
      return false;
    }
    return true;
  };
  if (safe(ahead, st.playerCol)) tryHop("fwd");
  else if (safe(lane(st.playerRow), st.playerCol - 1) && st.playerCol > COL_MIN) tryHop("left");
  else if (safe(lane(st.playerRow), st.playerCol + 1) && st.playerCol < COL_MAX) tryHop("right");
  else if (st.idle > 2.6) tryHop("back"); // don't die to the hawk while waiting
}

// -------------------- visuals --------------------
const LOOK_HOLD = new Set<number>();

function swapLook(ti: number): void {
  if (!app) return;
  const th = THEMES[ti];
  try {
    const n0 = app.nodes as unknown as { remove(id: string): void; add(n: never): void };
    n0.remove("look");
    n0.add(looks.preset(th.look as Parameters<typeof looks.preset>[0], { fogDensityScale: th.fogScale, exposureEv: th.exposureEv }).runtime(game.runtimeNode("look")).toJSON() as never);
    try { (app as unknown as { lighting?: { setEnvironmentIntensity?(n:number):void } }).lighting?.setEnvironmentIntensity?.(1); } catch { /* no-op */ }
    LOOK_HOLD.add(ti);
  } catch { /* look swap best-effort */ }
}

function syncVisuals(dt: number): void {
  if (!app) return;
  const nodes = app.nodes;
  if (!nodes) return;

  for (const k of Object.keys(CAP) as (keyof typeof CAP)[]) P(k).n = 0;

  const lo = Math.max(0, st.playerRow - ROW_BEHIND), hi = st.playerRow + ROW_AHEAD;
  for (let r = lo; r <= hi; r++) paintLane(lane(r), r);
  paintDressing(lo, hi);

  // movers
  for (let r = lo; r <= hi; r++) {
    const l = lane(r);
    if (l.moverKind === "none") continue;
    const n = laneMovers(l, st.time, XS);
    const z = laneZ(r);
    for (let i = 0; i < n; i++) {
      const x = XS[i];
      const ry = l.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (l.moverKind === "log") inst("log", x, 0.22, z, 4.4, 0.5, 0.5, "#7a5230", 0);
      else if (l.moverKind === "pad") inst("pad", x, 0.18, z, 1.5, 0.14, 1.5, "#4f9e4f");
      else if (l.moverKind === "stone") inst("stone", x, 0.3, z, 1.6, 0.5, 1.6, "#565660");
      else {
        const th2 = THEMES[l.theme];
        const kind = th2.vehicleSet === "hover" && l.moverKind === "car" ? "hover" : l.moverKind;
        const pool = VEHICLE_POOL[kind];
        const lift = kind === "hover" ? 0.35 : 0;
        inst(pool, x, 0.02 + lift, z, 1, 1, 1, "#ffffff", ry);
      }
    }
  }

  // coins + pod
  for (let r = lo; r <= hi; r++) {
    const l = lane(r);
    if (l.hasCoin && !st.coinTaken.has(r)) inst("coin", l.coinCol * COL_W, 0.45 + Math.sin(st.time * 3 + r) * 0.08, laneZ(r), 1, 1, 1, COLORS.coin, st.time * 1.6);
  }

  // player
  const px = st.hop.active ? st.hop.fromX + (st.hop.toX - st.hop.fromX) * st.hop.t : st.playerCol * COL_W;
  const pz = st.hop.active ? st.hop.fromZ + (st.hop.toZ - st.hop.fromZ) * st.hop.t : laneZ(st.playerRow);
  const arc = st.hop.active ? Math.sin(Math.PI * Math.min(1, st.hop.t)) * 0.62 : 0;
  const squash = st.dead && (st.dead.kind === "squashed" || st.dead.kind === "flattened") ? 0.18 : 1;
  try {
    const h = nodes.require("player");
    h.setPosition(px, 0.13 + arc + (st.dead?.kind === "drowned" ? -0.5 : 0), pz);
    if (st.hop.active) h.setScale(1.0 + Math.sin(Math.PI * st.hop.t) * 0.25);
    else h.setScale(squash);
    if (st.hop.dir === "left") h.setRotation(0, -Math.PI / 2, 0);
    else if (st.hop.dir === "right") h.setRotation(0, Math.PI / 2, 0);
    else if (st.hop.dir === "back") h.setRotation(0, 0, 0);
    else h.setRotation(0, Math.PI, 0);
  } catch { nodeOk = false; }

  // platform carry visual
  const pl = lane(st.playerRow);
  if (!st.hop.active && !st.dead && (pl.type === "river" || pl.type === "lava")) {
    st.playerCol += 0; // carried visually by platform; adjust col when it slides
    const n = laneMovers(pl, st.time, XS);
    for (let i = 0; i < n; i++) {
      if (Math.abs(XS[i] - px) < moverHalf(pl)) {
        st.playerCol = XS[i] / COL_W; // continuous — fractional col is fine for visuals
        break;
      }
    }
  }

  // hawk
  const warn = st.mode === "run" ? Math.min(1, Math.max(0, st.idle - 1.4) / (HAWK_KILL - 1.4)) : 0;
  try {
    const hk = nodes.require("hawk");
    if (warn > 0 && !st.dead) {
      const hy = 9 - warn * 7.4;
      hk.setVisible(true);
      hk.setPosition(px, Math.max(1.1, hy), pz - 2.5 + warn * 1.5);
      hk.setRotation(Math.PI * 0.2 * warn, 0, Math.sin(st.time * 7) * 0.12);
    } else if (st.dead?.kind === "snatched") {
      hk.setVisible(true);
      hk.setPosition(px + Math.sin((st.time - st.deadAt) * 2) * 0.4, 1.2 + (st.time - st.deadAt) * 3.2, pz - 2 - (st.time - st.deadAt) * 4);
      hk.setRotation(-0.3, 0, 0);
      nodes.require("player").setPosition(px, 1.0 + (st.time - st.deadAt) * 3.2, pz - 2 - (st.time - st.deadAt) * 4);
    } else hk.setVisible(false);
    // rescue pod marker
    const pod = nodes.require("pod");
    let podSet = false;
    for (let r = lo; r <= hi; r++) {
      const l = lane(r);
      if (l.hasPod && !st.podTaken.has(r)) {
        pod.setVisible(true); pod.setPosition(l.podCol * COL_W, 0.1, laneZ(r));
        pod.setRotation(0, st.time * 0.8, 0);
        podSet = true; break;
      }
    }
    if (!podSet) pod.setVisible(false);
  } catch { /* non-fatal */ }

  // camera — trailing
  const camZ = pz + 7.6, camY = 6.6 + st.playerRow * 0.004;
  app.camera?.setPose({
    position: [px * 0.45, camY, camZ],
    target: [px * 0.4, 0.4, pz - 3.6],
    fov: 46 + warn * 7
  });
  if (warn > 0.5) app.output?.setOutputOverlay({ vignette: [0.02, 0.02, 0.06, warn * 0.85] });
  else app.output?.setOutputOverlay(st.mode === "dead" ? { fade: [0, 0, 0, 0.25] } : {});

  // submit pools
  for (const k of Object.keys(CAP) as (keyof typeof CAP)[]) {
    const p = P(k);
    try {
      (nodes.require(`pool-${k === "ground" ? "ground" : k === "detail" ? "detail" : k === "glow" ? "glow" : k === "dressB" ? "dressb" : k}`) as unknown as { setInstanceTransforms(m: Float32Array, n: number, c?: Float32Array): void })
        .setInstanceTransforms(p.mat, p.n, p.col);
    } catch { nodeOk = false; }
  }

  if (st.messageT > 0) st.messageT -= dt;
}

function paintLane(l: Lane, r: number): void {
  const z = laneZ(r);
  const th = THEMES[l.theme];
  const pal = th.palette;
  switch (l.type) {
    case "meadow":
      inst("ground", 0, 0, z, STRIP_W, 0.24, LANE_D, pal.meadow);
      break;
    case "road": {
      inst("ground", 0, 0, z, STRIP_W, 0.24, LANE_D, pal.road);
      // center dashes
      for (let x = -16; x < 17; x += 4) inst("detail", x, 0.125, z, 1.4, 0.02, 0.09, "#e8e8e8");
      inst("detail", 0, 0.125, z - LANE_D * 0.44, STRIP_W, 0.02, 0.07, pal.shoulder);
      inst("detail", 0, 0.125, z + LANE_D * 0.44, STRIP_W, 0.02, 0.07, pal.shoulder);
      break;
    }
    case "tram": {
      inst("ground", 0, 0, z, STRIP_W, 0.24, LANE_D, "#8b9099");
      inst("detail", 0, 0.125, z - 0.32, STRIP_W, 0.03, 0.08, "#3a3d44");
      inst("detail", 0, 0.125, z + 0.32, STRIP_W, 0.03, 0.08, "#3a3d44");
      if (railWarning(l, st.time)) inst("glow", 0, 0.14, z, STRIP_W, 0.03, 0.5, "#f2c94c");
      break;
    }
    case "river":
      inst("ground", 0, -0.06, z, STRIP_W, 0.16, LANE_D, pal.water);
      inst("detail", 0, 0.1, z - LANE_D * 0.5, STRIP_W, 0.18, 0.12, pal.meadow);
      inst("detail", 0, 0.1, z + LANE_D * 0.5, STRIP_W, 0.18, 0.12, pal.meadow);
      break;
    case "rail": {
      inst("ground", 0, -0.02, z, STRIP_W, 0.2, LANE_D, pal.railbed);
      inst("detail", 0, 0.1, z - 0.3, STRIP_W, 0.05, 0.07, "#2c2c30");
      inst("detail", 0, 0.1, z + 0.3, STRIP_W, 0.05, 0.07, "#2c2c30");
      for (let x = -16; x < 17; x += 1.6) inst("detail", x, 0.06, z, 0.24, 0.05, 0.9, "#241f1a");
      if (railWarning(l, st.time)) {
        const blink = Math.sin(st.time * 16) > 0;
        inst("glow", -8, 0.6, z - LANE_D * 0.42, 0.24, 0.24, 0.24, blink ? "#ff3355" : "#551122");
        inst("glow", 8, 0.6, z + LANE_D * 0.42, 0.24, 0.24, 0.24, blink ? "#ff3355" : "#551122");
      }
      break;
    }
    case "lava":
      inst("ground", 0, -0.04, z, STRIP_W, 0.2, LANE_D, pal.lava);
      for (let x = -15; x < 16; x += 3.1) inst("detail", x, 0.02, z + (((r * 7 + x) % 3) - 1) * 0.3, 1.5, 0.12, 0.4, pal.crust);
      inst("glow", 0, 0.02, z - LANE_D * 0.46, STRIP_W, 0.04, 0.1, "#ff6a2a");
      inst("glow", 0, 0.02, z + LANE_D * 0.46, STRIP_W, 0.04, 0.1, "#ff6a2a");
      break;
  }
}

function paintDressing(lo: number, hi: number): void {
  const th = THEMES[st.themeIdx];
  const dkey = `${th.dress}-${st.seed}-${lo >> 3}`;
  for (let r = lo; r <= hi; r++) {
    const l = lane(r);
    const z = laneZ(r);
    const rndA = Math.abs(Math.sin(r * 12.9898 + st.seed * 0.37)) % 1;
    const rndB = Math.abs(Math.sin(r * 78.233 + st.seed * 0.11)) % 1;
    const side = rndA < 0.5 ? -1 : 1;
    const off = 8.6 + rndB * 4;
    if (th.dress === "trees" || th.dress === "reeds" || th.dress === "candy") {
      if (rndA < 0.5) {
        inst("trunk", side * off, 0.7, z, 0.22, 1.4, 0.22, th.palette.dressingB);
        inst("canopy", side * off, 1.8, z, 1.1, 0.9, 1.1, th.palette.dressingA);
        inst("trunk", -side * (off + 2.4), 0.7, z, 0.22, 1.4, 0.22, th.palette.dressingB);
        inst("canopy", -side * (off + 2.4), 1.8, z, 1.1, 0.9, 1.1, th.palette.dressingA);
      }
    } else if (th.dress === "city" || th.dress === "neon") {
      const h = 2.2 + rndB * 3.4;
      inst("dressB", side * (off + 2), h / 2, z, 1.8, h, 1.8, th.palette.dressingB);
      if (th.dress === "neon" && rndB < 0.4) inst("glow", side * (off + 2) - 0.95, h / 2, z, 0.06, h * 0.5, 0.4, th.palette.accent);
      inst("dressB", -side * (off + 4.5), (h * 0.7) / 2, z, 2.2, h * 0.7, 2.2, th.palette.dressingA);
    } else if (th.dress === "basalt") {
      inst("dressB", side * off, 0.5 + rndB, z, 0.9, 1 + rndB * 2, 0.9, th.palette.dressingB);
      if (rndA < 0.3) inst("glow", -side * (off + 1.5), 0.3, z, 0.3, 0.3, 0.3, "#ff5a1f");
    }
  }
}

/** Player swap (Player Studio). Rebuilds the player node in place. */
export function swapCritter(c: CritterDef): void {
  st.critter = c;
  st.profile.selected = c.id;
  saveProfile(st.profile);
  if (!app) return;
  try {
    const n0 = app.nodes as unknown as { require(id:string): { setPosition(x:number,y:number,z:number):void }; remove(id: string): void; add(n: never): void };
    const pz = laneZ(st.playerRow);
    n0.remove("player");
    n0.add(
      model(assets[c.asset], { name: "player", targetHeight: 0.42, castShadow: true })
        .position(st.playerCol * COL_W, 0.13, pz).rotate(0, Math.PI, 0)
        .animate({ clip: "Idle", loop: true })
        .runtime(game.runtimeNode("player"))
        .toJSON() as never
    );
  } catch { nodeOk = false; }
}

export function evidenceExtra(): Record<string, unknown> {
  let movers = 0;
  const lo = Math.max(0, st.playerRow - ROW_BEHIND), hi = st.playerRow + ROW_AHEAD;
  for (let r = lo; r <= hi; r++) movers += laneMovers(lane(r), st.time, XS);
  return {
    state: { mode: st.mode, runKind: st.runKind, score: st.score, coins: st.coins, best: st.profile.best, row: st.playerRow, bestRow: st.row, critter: st.critter.id, theme: THEMES[st.themeIdx].label, dead: st.dead?.kind ?? null },
    movers,
    lanesBuffered: st.lanes.size,
    events: st.events.slice(-6),
    unlocked: st.profile.unlocked.length + "/" + CRITTERS.length,
    nodesOk: nodeOk
  };
}
