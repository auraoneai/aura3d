/**
 * Procedural track of the original HEATSINK (Vesper Heights): closed centripetal Catmull-Rom through the map's
 * control points, moving-average smoothing + refit, arc-length resampling, elevation keys, district sections, width
 * blending, split lanes and the seeded gameplay scatter (boost pads, pickups, barrels, checkpoints).
 *
 * Ported from the captured module's track class. The order of every `rng()` call below matters: the scatter rules
 * consume the same seeded stream the original does (32 control-point jitter draws first), so object positions match.
 * Track tables are Float32Array exactly like the original, because `frame()` interpolates the rounded values.
 */
import { CatmullRomCurve3, Vector3 } from "@aura3d/math";
import { CFG } from "./config";
import { VESPER } from "./map";
import { lerp, seededRandom, smoothstep, TAU } from "./rng";

export interface District {
  key: string;
  name: string;
  hw: number;
  ceil: number;
  heat: number;
  cool: number;
  light: number;
  road: readonly number[];
  fog: number;
  hud: { color: string; label: string };
  lava?: boolean;
  water?: boolean;
  env: Record<string, number>;
}

interface Smoothing { samples: number; passes: number; window: number; refitEvery: number; arcDivisions: number; refitArcDivisions: number }
interface ScatterRule {
  type: "boostPad" | "pickup" | "barrels";
  districts: "all" | readonly string[];
  chance: number;
  lateral?: readonly number[] | number;
  clear: number;
  minGap: number;
  kinds?: readonly string[];
  h?: number;
  clearEdge?: number;
  count?: number;
  spacing?: number;
  edgeInset?: number;
  stagger?: number;
  enabled?: boolean;
}
interface MapDef {
  shape: { seed: number; radius: number; step: number; controlPoints: number; harmonics: readonly { amp: number; freq: number; phase: number }[]; jitter: number; points: readonly (readonly number[])[] | null; startPoint?: number; smoothing: Smoothing; startSearch: { window: number }; curvatureWindow: number };
  elevation: { keys?: readonly (readonly number[])[]; keySmooth?: number; waves: readonly { amp: number; freq: number; phase: number }[]; jumps: readonly { point?: number; u?: number; h: number }[]; rampUp: number; rampDown: number };
  districts: Record<string, Omit<District, "key" | "env"> & { env?: Record<string, number> }>;
  sectionsAt: string;
  sections: readonly (readonly [number, string])[];
  widthBlend: number;
  ceilingBlend: number;
  grid?: { x: number; row: number };
  splits?: readonly { s: number; len: number; up: number; down: number; widen?: number; divider?: number; ramp?: number }[];
  gameplay: {
    clear: { jump: number; startAfter: number; endBefore: number; obstacleHx: number };
    obstacles: readonly unknown[];
    scatter: { start: number; endMargin: number; step: number; rules: readonly ScatterRule[] };
    checkpoints: { offset: number; skipCovered: boolean };
    extraObstacles: readonly { s?: number; point?: number; ds?: number; x: number; hx: number; hs: number; h: number; kind?: string }[];
    extraLavaPools: readonly { s: number; x: number; hx: number; hs: number }[];
    extraBoostPads: readonly { s?: number; point?: number; ds?: number; x: number }[];
    extraPickups: readonly { s?: number; point?: number; ds?: number; x: number; kind?: string; h?: number }[];
    extraBarrels: readonly { s?: number; point?: number; ds?: number; x: number }[];
    extraCheckpoints: readonly (number | { s?: number; point?: number; ds?: number })[];
  };
}

export const MAP = VESPER as unknown as MapDef;

export interface Frame {
  s: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  rx: number;
  rz: number;
  psi: number;
  kappa: number;
  hw: number;
  sec: District;
  slope: number;
  ceil: number;
}

export interface Obstacle { s: number; x: number; hx: number; hs: number; h: number; kind?: string }
export interface Pickup { s: number; x: number; kind: string; h: number; respawn: number }
export interface Barrel { s: number; x: number; alive: boolean; respawn: number }
export interface Split { s0: number; s1: number; len: number; up: number; down: number; widen: number; dw: number; ramp: number }

const unwrapAngles = (angles: number[]): number[] => {
  const e = angles.slice();
  for (let t = 1; t < e.length; t++) {
    let s = (e[t] as number) - (e[t - 1] as number);
    while (s > Math.PI) { e[t] = (e[t] as number) - TAU; s -= TAU; }
    while (s < -Math.PI) { e[t] = (e[t] as number) + TAU; s += TAU; }
  }
  return e;
};

function smoothAndRefit(curve: CatmullRomCurve3, cfg: Smoothing): CatmullRomCurve3 {
  const samples = cfg.samples;
  const win = cfg.window;
  let xs: number[] = [];
  let zs: number[] = [];
  curve.arcLengthDivisions = cfg.arcDivisions;
  for (let c = 0; c < samples; c++) {
    const p = curve.getPointAt(c / samples);
    xs.push(p.x);
    zs.push(p.z);
  }
  for (let pass = 0; pass < cfg.passes; pass++) {
    const nx = new Array<number>(samples);
    const nz = new Array<number>(samples);
    for (let d = 0; d < samples; d++) {
      let sx = 0;
      let sz = 0;
      for (let m = -win; m <= win; m++) {
        sx += xs[(d + m + samples) % samples] as number;
        sz += zs[(d + m + samples) % samples] as number;
      }
      nx[d] = sx / (2 * win + 1);
      nz[d] = sz / (2 * win + 1);
    }
    xs = nx;
    zs = nz;
  }
  const pts: Vector3[] = [];
  for (let c = 0; c < samples; c += cfg.refitEvery) pts.push(new Vector3(xs[c] as number, 0, zs[c] as number));
  const refit = new CatmullRomCurve3(pts, true, "centripetal");
  refit.arcLengthDivisions = cfg.refitArcDivisions;
  return refit;
}

const matches = (districts: "all" | readonly string[], key: string): boolean => districts === "all" || districts.includes(key);

export class Track {
  readonly length: number;
  readonly n: number;
  readonly step: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  readonly psi: Float64Array;
  readonly kap: Float32Array;
  readonly hw: Float32Array;
  readonly secIdx: Uint8Array;
  readonly ceilSmooth: Float32Array;
  readonly typeList: District[];
  readonly sections: { start: number; end: number; type: District }[];
  readonly splits: Split[];
  readonly pointS: number[];
  readonly jumps: { s: number; h: number }[] = [];
  elevTab: Float32Array | null = null;
  obstacles: Obstacle[] = [];
  lavaPools: { s: number; x: number; hx: number; hs: number }[] = [];
  boostPads: { s: number; x: number }[] = [];
  pickups: Pickup[] = [];
  barrels: Barrel[] = [];
  checkpoints: number[] = [];

  constructor() {
    const e = MAP.shape;
    const rng = seededRandom(e.seed);
    const radius = e.radius;
    const pts: Vector3[] = [];
    const count = e.points ? e.points.length : e.controlPoints;
    for (let h = 0; h < count; h++) {
      const ang = (h / count) * TAU;
      let te = 1;
      for (const harm of e.harmonics) te += harm.amp * Math.sin(harm.freq * ang + harm.phase);
      const rr = radius * te + (rng() - 0.5) * radius * e.jitter;
      if (e.points) pts.push(new Vector3((e.points[h] as readonly number[])[0] as number, 0, (e.points[h] as readonly number[])[1] as number));
      else pts.push(new Vector3(Math.cos(ang) * rr, 0, Math.sin(ang) * rr));
    }
    const curve = smoothAndRefit(new CatmullRomCurve3(pts, true, "centripetal"), e.smoothing);
    const total = curve.getLength();
    const l = Math.round(total / e.step);
    this.length = total;
    this.n = l;
    this.step = total / l;
    const cx: number[] = [];
    const cz: number[] = [];
    const ctx: number[] = [];
    const ctz: number[] = [];
    for (let h = 0; h < l; h++) {
      const u = h / l;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      // original: tangent.y = 0; tangent.normalize()
      const mag = Math.hypot(t.x, t.z) || 1;
      cx.push(p.x);
      cz.push(p.z);
      ctx.push(t.x / mag);
      ctz.push(t.z / mag);
    }
    const d = unwrapAngles(ctx.map((h, i) => Math.atan2(h, -(ctz[i] as number))));
    const dd = d.map((_h, i) => ((d[Math.min(l - 1, i + 1)] as number) - (d[Math.max(0, i - 1)] as number)) / (2 * this.step));
    const searchHalf = Math.round(e.startSearch.window / this.step);
    let startIdx = 0;
    let bestSum = Infinity;
    const nearest = (pt: readonly number[]): number => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < l; i++) {
        const dist = ((cx[i] as number) - (pt[0] as number)) ** 2 + ((cz[i] as number) - (pt[1] as number)) ** 2;
        if (dist < bd) { bd = dist; best = i; }
      }
      return best;
    };
    if (e.points && e.startPoint !== undefined) startIdx = nearest(e.points[e.startPoint] as readonly number[]);
    else {
      for (let h = 0; h < l; h += 5) {
        let acc = 0;
        for (let te = -searchHalf; te < searchHalf / 2; te += 3) acc += Math.abs(dd[(h + te + l) % l] as number);
        if (acc < bestSum) { bestSum = acc; startIdx = h; }
      }
    }
    const b = startIdx;
    this.pointS = e.points ? e.points.map((pt) => (((nearest(pt) - b + l) % l) * this.step)) : [];
    const y = new Float32Array(l + 1);
    const v = new Float32Array(l + 1);
    const zz = new Float32Array(l + 1);
    const T = new Float32Array(l + 1);
    const M = new Float32Array(l + 1);
    const S = new Float64Array(l + 1);
    const k = new Float32Array(l + 1);
    const N = new Float32Array(l + 1);
    const z = new Uint8Array(l + 1);
    const V = new Float32Array(l + 1);
    const types: Record<string, District> = {};
    for (const [key, dist] of Object.entries(MAP.districts)) {
      const dr = dist as unknown as { light: number; lava?: boolean; ceil: number; water?: boolean; env?: Record<string, number> };
      types[key] = { ...(dist as unknown as Record<string, unknown>), key, env: { light: dr.light, lava: dr.lava ? 1 : 0, closed: dr.ceil ? 1 : 0, water: dr.water ? 1 : 0, ...(dr.env ?? {}) } } as unknown as District;
    }
    this.typeList = Object.values(types);
    const E: [number, string][] = MAP.sectionsAt === "points" ? MAP.sections.map(([h, s]) => [this.sAtPoint(h) / total, s] as [number, string]) : MAP.sections.map(([h, s]) => [h, s] as [number, string]);
    this.sections = E.map(([h, s], te) => ({ start: h * total, end: (te + 1 < E.length ? (E[te + 1] as [number, string])[0] : 1) * total, type: types[s] as District }));
    for (const j of MAP.elevation.jumps) this.jumps.push({ s: (j.point !== undefined ? this.sAtPoint(j.point) / total : (j.u as number)) * total, h: j.h });
    if (MAP.elevation.keys) this.buildElevationKeys();
    for (let h = 0; h <= l; h++) {
      const idx = (h + b) % l;
      y[h] = cx[idx] as number;
      zz[h] = cz[idx] as number;
      T[h] = ctx[idx] as number;
      M[h] = ctz[idx] as number;
      const te = h * this.step;
      v[h] = this.elevation(te);
      const si = this.sectionIndexAt(te);
      z[h] = this.typeList.indexOf((this.sections[si] as { type: District }).type);
      N[h] = this.widthAt(te, si);
    }
    const B = unwrapAngles(Array.from({ length: l + 1 }, (_h, i) => Math.atan2(T[i] as number, -(M[i] as number))));
    for (let h = 0; h <= l; h++) S[h] = B[h] as number;
    for (let h = 0; h <= l; h++) {
      const lo = Math.max(0, h - e.curvatureWindow);
      const hi = Math.min(l, h + e.curvatureWindow);
      k[h] = ((S[hi] as number) - (S[lo] as number)) / ((hi - lo) * this.step);
    }
    const W = Math.round(MAP.ceilingBlend / this.step);
    for (let h = 0; h <= l; h++) {
      let acc = 0;
      for (let te = -W; te <= W; te++) acc += (this.typeList[z[(h + te + l) % l] as number] as District).ceil;
      V[h] = acc / (2 * W + 1);
    }
    this.px = y;
    this.py = v;
    this.pz = zz;
    this.tx = T;
    this.tz = M;
    this.psi = S;
    this.kap = k;
    this.hw = N;
    this.secIdx = z;
    this.ceilSmooth = V;
    this.splits = (MAP.splits ?? []).map((h) => ({ s0: h.s, s1: h.s + h.len, len: h.len, up: h.up, down: h.down, widen: h.widen ?? 20, dw: h.divider ?? 8, ramp: h.ramp ?? 120 }));
    for (const sp of this.splits) {
      for (let i = 0; i <= l; i++) {
        const kk = this.splitK(sp, i * this.step);
        if (kk > 0) N[i] = (N[i] as number) + sp.widen * smoothstep(0, 1, Math.min(1, kk * 1.6));
      }
    }
    this.buildGameplayObjects(rng);
  }

  sAtPoint(p: number): number {
    const t = this.pointS;
    const s = t.length;
    const i = Math.floor(p);
    const n = p - i;
    const r = t[((i % s) + s) % s] as number;
    let l = (t[(i + 1) % s] as number) - r;
    if (l < 0) l += this.length;
    return (r + l * n) % this.length;
  }

  private buildElevationKeys(): void {
    const t = this.n;
    const s = this.step;
    const i = this.length;
    const keys = (MAP.elevation.keys as readonly (readonly number[])[]).map(([l, c]) => [this.sAtPoint(l as number), c as number] as [number, number]).sort((a, b) => a[0] - b[0]);
    let r = new Float32Array(t);
    for (let l = 0; l < t; l++) {
      const c = l * s;
      let u = keys.length - 1;
      for (let bb = 0; bb < keys.length; bb++) if ((keys[bb] as [number, number])[0] <= c) u = bb;
      const [h, d] = keys[u] as [number, number];
      const [p, f] = keys[(u + 1) % keys.length] as [number, number];
      let m = p - h;
      if (m <= 0) m += i;
      let g = c - h;
      if (g < 0) g += i;
      const x = Math.min(1, g / m);
      r[l] = d + (f - d) * (0.5 - 0.5 * Math.cos(Math.PI * x));
    }
    const a = Math.max(1, Math.round((MAP.elevation.keySmooth ?? 80) / s));
    for (let pass = 0; pass < 2; pass++) {
      const c = new Float32Array(t);
      let u = 0;
      for (let h = -a; h <= a; h++) u += r[(h + t) % t] as number;
      for (let h = 0; h < t; h++) {
        c[h] = u / (2 * a + 1);
        u += (r[(h + a + 1) % t] as number) - (r[(h - a + t) % t] as number);
      }
      r = c;
    }
    this.elevTab = r;
  }

  elevation(e: number): number {
    const t = e / this.length;
    const s = MAP.elevation;
    const i = s.rampUp;
    const n = s.rampDown;
    let r = 0;
    if (this.elevTab) {
      const a = this.wrap(e) / this.step;
      const l = Math.floor(a) % this.n;
      r = lerp(this.elevTab[l] as number, this.elevTab[(l + 1) % this.n] as number, a - Math.floor(a));
    }
    for (const a of s.waves) r += a.amp * Math.sin(TAU * a.freq * t + a.phase);
    for (const a of this.jumps) {
      const l = this.wrapDelta(e, a.s);
      if (l > -i && l <= 0) r += a.h * Math.pow((l + i) / i, 1.5);
      else if (l > 0 && l < n) r += a.h * (1 - l / n);
    }
    return r;
  }

  sectionIndexAt(e: number): number {
    const w = this.wrap(e);
    for (let t = this.sections.length - 1; t >= 0; t--) if (w >= (this.sections[t] as { start: number }).start) return t;
    return 0;
  }

  widthAt(e: number, t: number): number {
    const s = this.sections;
    const i = s[t] as { start: number; end: number; type: District };
    const n = s[(t - 1 + s.length) % s.length] as { type: District };
    const r = s[(t + 1) % s.length] as { type: District };
    const a = MAP.widthBlend;
    let l = i.type.hw;
    if (n.type.hw < l && e - i.start < a) l = lerp(n.type.hw, l, smoothstep(0, a, e - i.start));
    if (r.type.hw < l && i.end - e < a) l = lerp(l, r.type.hw, smoothstep(a, 0, i.end - e));
    return l;
  }

  private buildGameplayObjects(rng: () => number): void {
    const gp = MAP.gameplay;
    const s = gp.clear;
    const len = this.length;
    this.obstacles = [];
    this.lavaPools = [];
    const nearJump = (f: number): boolean => this.jumps.some((m) => Math.abs(this.wrapDelta(f, m.s)) < s.jump);
    const widthAtS = (f: number): number => this.widthAt(f, this.sectionIndexAt(f));
    // The captured map declares no slalom/rocks/lava obstacle rules (gameplay.obstacles is empty); only the
    // generic loop structure is kept so a map that does would consume the same rng stream.
    void gp.obstacles;
    const toS = (f: { s?: number; point?: number; ds?: number }): number => (f.point !== undefined ? this.wrap(this.sAtPoint(f.point) + (f.ds ?? 0)) : (f.s as number));
    for (const f of gp.extraObstacles) this.obstacles.push({ ...f, s: toS(f) } as Obstacle);
    for (const f of gp.extraLavaPools) this.lavaPools.push({ ...f });
    this.obstacles.sort((a, b) => a.s - b.s);
    this.boostPads = [];
    this.pickups = [];
    this.barrels = [];
    const inSplit = (f: number): boolean => this.splits.some((m) => this.wrap(f - m.s0 + 40) < m.len + 80);
    const ok = (f: number, m: number, g: number): boolean => !nearJump(f) && !inSplit(f) && !this.hitObstacle(f, m, g, s.obstacleHx) && f > s.startAfter && f < len - s.endBefore;
    const near = (list: { s: number }[], m: number, g: number): boolean => list.some((x) => Math.abs(this.wrapDelta(x.s, m)) < g);
    const sc = gp.scatter;
    let kindCursor = 0;
    for (const f of this.sections) {
      const m = f.type;
      for (let g = f.start + sc.start; g < f.end - sc.endMargin; g += sc.step) {
        const x = widthAtS(g);
        for (const b of sc.rules) {
          if (b.enabled === false || !matches(b.districts, m.key) || !(rng() < b.chance)) continue;
          if (b.type === "boostPad") {
            const lat = b.lateral as readonly number[];
            const sign = rng() < 0.5 ? -1 : 1;
            const y = sign * x * ((lat[0] as number) + rng() * (lat[1] as number));
            if (ok(g, y, b.clear) && !near(this.boostPads, g, b.minGap)) this.boostPads.push({ s: g, x: y });
          } else if (b.type === "pickup") {
            const y = (rng() * 2 - 1) * x * (b.lateral as number);
            if (ok(g, y, b.clear) && !near(this.pickups, g, b.minGap)) {
              const kinds = b.kinds as readonly string[];
              this.pickups.push({ s: g, x: y, kind: kinds[kindCursor++ % kinds.length] as string, h: b.h as number, respawn: 0 });
            }
          } else if (b.type === "barrels") {
            const y = rng() < 0.5 ? -1 : 1;
            if (ok(g, y * (x - (b.clearEdge as number)), b.clear) && !near(this.barrels, g, b.minGap)) {
              for (let vv = 0; vv < (b.count as number); vv++) this.barrels.push({ s: g + vv * (b.spacing as number), x: y * (x - (b.edgeInset as number) - (vv % 2) * (b.stagger as number)), alive: true, respawn: 0 });
            }
          }
        }
      }
    }
    for (const f of gp.extraBoostPads) this.boostPads.push({ s: toS(f), x: f.x });
    for (const f of gp.extraPickups) this.pickups.push({ s: toS(f), x: f.x, kind: f.kind ?? "shield", h: f.h ?? 2.2, respawn: 0 });
    for (const f of gp.extraBarrels) this.barrels.push({ s: toS(f), x: f.x, alive: true, respawn: 0 });
    const cp = gp.checkpoints;
    this.checkpoints = this.sections
      .filter((f) => !(cp.skipCovered && f.type.ceil) && f.start > 1)
      .map((f) => f.start + cp.offset)
      .concat(gp.extraCheckpoints.map((f) => (typeof f === "number" ? f : toS(f))));
  }

  splitAt(e: number): Split | null {
    for (const t of this.splits) if (this.wrap(e - t.s0) < t.len) return t;
    return null;
  }

  splitK(e: Split, t: number): number {
    const s = this.wrap(t - e.s0);
    return s >= e.len ? 0 : smoothstep(0, e.ramp, s) * smoothstep(e.len, e.len - e.ramp, s);
  }

  latY(e: number, t: number): number {
    if (!this.splits.length) return 0;
    const s = this.splitAt(e);
    return s ? this.splitK(s, e) * lerp(s.up, -s.down, smoothstep(-s.dw, s.dw, t)) : 0;
  }

  dividerAt(e: number): number {
    if (!this.splits.length) return 0;
    const t = this.splitAt(e);
    if (!t) return 0;
    const s = this.splitK(t, e);
    return s > 0.08 ? t.dw * Math.min(1, (s - 0.08) * 2.5) : 0;
  }

  wrap(e: number): number {
    const t = this.length;
    return ((e % t) + t) % t;
  }

  wrapDelta(e: number, t: number): number {
    const s = this.length;
    let i = e - t;
    i -= s * Math.round(i / s);
    return i;
  }

  frame(e: number, out: Partial<Frame> = {}): Frame {
    const w = this.wrap(e);
    const s = w / this.step;
    const i = Math.min(this.n - 1, s | 0);
    const n = s - i;
    const r = i + 1;
    const t = out as Frame;
    t.s = w;
    t.x = lerp(this.px[i] as number, this.px[r] as number, n);
    t.y = lerp(this.py[i] as number, this.py[r] as number, n);
    t.z = lerp(this.pz[i] as number, this.pz[r] as number, n);
    const a = lerp(this.tx[i] as number, this.tx[r] as number, n);
    const l = lerp(this.tz[i] as number, this.tz[r] as number, n);
    const c = Math.hypot(a, l) || 1;
    t.tx = a / c;
    t.tz = l / c;
    t.rx = -t.tz;
    t.rz = t.tx;
    t.psi = lerp(this.psi[i] as number, this.psi[r] as number, n);
    t.kappa = lerp(this.kap[i] as number, this.kap[r] as number, n);
    t.hw = lerp(this.hw[i] as number, this.hw[r] as number, n);
    t.sec = this.typeList[this.secIdx[n < 0.5 ? i : r] as number] as District;
    t.slope = ((this.py[r] as number) - (this.py[i] as number)) / this.step;
    t.ceil = lerp(this.ceilSmooth[i] as number, this.ceilSmooth[r] as number, n);
    return t;
  }

  private readonly worldFrame: Partial<Frame> = {};

  /** world position of (s, lateral) at height `y`; pass `out` to reuse an object (per-frame callers, HP-18) */
  toWorld(e: number, lateral: number, y: number, out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    const f = this.frame(e, this.worldFrame);
    out.x = f.x + f.rx * lateral;
    out.y = y;
    out.z = f.z + f.rz * lateral;
    return out;
  }

  curvAhead(e: number, t: number): number {
    let s = 0;
    let i = 0;
    for (let n = 0; n <= t; n += 10) {
      const r = (this.wrap(e + n) / this.step) | 0;
      s += this.kap[r] as number;
      i++;
    }
    return s / i;
  }

  lavaAt(e: number, t: number, f: Frame): boolean {
    if (f.sec.lava && Math.abs(t) > f.hw - CFG.track.lavaStrip) return true;
    for (const p of this.lavaPools) if (Math.abs(this.wrapDelta(e, p.s)) < p.hs && Math.abs(t - p.x) < p.hx) return true;
    return false;
  }

  hitObstacle(e: number, t: number, s: number, i: number): Obstacle | null {
    for (const n of this.obstacles) if (Math.abs(this.wrapDelta(e, n.s)) < n.hs + s && Math.abs(t - n.x) < n.hx + i) return n;
    return null;
  }
}
