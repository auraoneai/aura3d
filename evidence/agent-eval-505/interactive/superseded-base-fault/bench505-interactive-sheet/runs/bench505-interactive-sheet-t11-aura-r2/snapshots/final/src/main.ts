import {
  camera, createAuraApp, effects, environments, geometry, group, instances, lights, material, primitives, scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: unknown;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

type V3 = [number, number, number];
type Kids = Parameters<typeof group>[1];

/* ------------------------------------------------------------------ procedural helpers */
const hash3 = (x: number, y: number, z: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const vnoise = (x: number, y: number, z: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = smooth(x - xi), fy = smooth(y - yi), fz = smooth(z - zi);
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz
  );
};
const fbm = (x: number, y: number, z: number): number =>
  vnoise(x, y, z) * 0.55 + vnoise(x * 2.1 + 7, y * 2.1 + 3, z * 2.1 + 11) * 0.3 + vnoise(x * 4.3 + 19, y * 4.3 + 5, z * 4.3 + 2) * 0.15;

const hex = (s: string): V3 => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
const mix = (a: V3, b: V3, t: number): V3 => {
  const k = Math.min(1, Math.max(0, t));
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
};
type ColorFn = (x: number, y: number, z: number) => V3;

const colorFns: Record<string, ColorFn> = {
  Mercury: (x, y, z) => {
    const n = fbm(x * 4 + 1, y * 4, z * 4);
    const crater = vnoise(x * 14, y * 14, z * 14) > 0.78 ? 0.18 : 0;
    return mix(hex("#a39d96"), hex("#5f5a56"), n * 0.9 + crater - 0.2);
  },
  Venus: (x, y, z) => {
    const n = fbm(x * 2 + y * 0.6, y * 5, z * 2 - y * 0.6);
    return mix(hex("#d8aa5e"), hex("#f4dfa8"), n * 1.6 - 0.3);
  },
  Earth: (x, y, z) => {
    const h = fbm(x * 2.2 + 3, y * 2.2, z * 2.2);
    let c: V3 = h < 0.5 ? mix(hex("#0a2a6e"), hex("#2467b8"), h / 0.5) : mix(hex("#2f7d32"), hex("#9a8548"), (h - 0.5) * 3.2);
    if (Math.abs(y) > 0.86) c = mix(c, hex("#f4f8ff"), (Math.abs(y) - 0.86) * 12);
    const cl = fbm(x * 3 + 10, y * 5, z * 3 + 4);
    return mix(c, hex("#ffffff"), (cl - 0.55) * 3.5);
  },
  Mars: (x, y, z) => {
    const n = fbm(x * 3 + 5, y * 3, z * 3);
    let c = mix(hex("#b04a2b"), hex("#7c3220"), n * 1.5 - 0.35);
    c = mix(c, hex("#dd8a58"), vnoise(x * 8, y * 8, z * 8) * 0.25);
    if (Math.abs(y) > 0.92) c = mix(c, hex("#ffffff"), (Math.abs(y) - 0.92) * 14);
    return c;
  },
  Jupiter: (x, y, z) => {
    const w = fbm(x * 3, y * 0.7, z * 3);
    const band = Math.sin(y * 15 + w * 4) * 0.5 + 0.5;
    let c = mix(hex("#c4915c"), hex("#f2e4cc"), band);
    c = mix(c, hex("#8a5636"), Math.max(0, Math.sin(y * 7 + 1) * 0.5) * 0.6);
    return c;
  },
  Saturn: (x, y, z) => {
    const w = fbm(x * 2, y * 0.6, z * 2);
    const band = Math.sin(y * 20 + w * 2) * 0.5 + 0.5;
    return mix(hex("#cdb47c"), hex("#f3e8c4"), band);
  },
  Uranus: (x, y, z) => {
    const w = fbm(x * 2, y, z * 2);
    return mix(hex("#7fd6dd"), hex("#bdf3f3"), Math.sin(y * 9 + w) * 0.5 + 0.5);
  },
  Neptune: (x, y, z) => {
    const w = fbm(x * 3, y * 1.2, z * 3);
    return mix(hex("#2540c0"), hex("#5a82ff"), Math.sin(y * 11 + w * 3) * 0.35 + w * 0.6);
  }
};

const sphereGeometry = (radius: number, fn: ColorFn) => {
  const LAT = 32, LON = 64;
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= LAT; i += 1) {
    const th = (i / LAT) * Math.PI;
    for (let j = 0; j <= LON; j += 1) {
      const ph = (j / LON) * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
      pos.push(nx * radius, ny * radius, nz * radius);
      nor.push(nx, ny, nz);
      col.push(...fn(nx, ny, nz), 1);
    }
  }
  for (let i = 0; i < LAT; i += 1) {
    for (let j = 0; j < LON; j += 1) {
      const a = i * (LON + 1) + j, b = a + LON + 1, c = a + 1, d = b + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return geometry.define({
    positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col), indices: idx,
    bounds: { min: [-radius, -radius, -radius], max: [radius, radius, radius] }
  });
};

/** Flat annulus in the XZ plane, visible from both sides. */
const annulusGeometry = (ri: number, ro: number, seg: number, fn?: (t: number, a: number) => V3) => {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const push = (r: number, a: number, ny: number, t: number): void => {
    pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    nor.push(0, ny, 0);
    col.push(...(fn ? fn(t, a) : [1, 1, 1] as V3), 1);
  };
  for (let side = 0; side < 2; side += 1) {
    const ny = side === 0 ? 1 : -1;
    const base = pos.length / 3;
    for (let k = 0; k <= seg; k += 1) {
      const a = (k / seg) * Math.PI * 2;
      push(ri, a, ny, 0);
      push(ro, a, ny, 1);
    }
    for (let k = 0; k < seg; k += 1) {
      const ia = base + k * 2, oa = ia + 1, ib = ia + 2, ob = ia + 3;
      if (side === 0) idx.push(ia, ib, oa, oa, ib, ob);
      else idx.push(ia, oa, ib, oa, ob, ib);
    }
  }
  return geometry.define({
    positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col), indices: idx,
    bounds: { min: [-ro, -0.05, -ro], max: [ro, 0.05, ro] }
  });
};

/* ------------------------------------------------------------------ data */
interface MoonSpec { r: number; orbit: number; speed: number; color: string; phase: number }
interface PlanetSpec {
  name: string; a: number; r: number; distMkm: number; periodDays: number; spin: number; phase: number;
  ring?: { ri: number; ro: number; c1: string; c2: string }; moons: MoonSpec[];
}
const PLANETS: PlanetSpec[] = [
  { name: "Mercury", a: 7, r: 0.55, distMkm: 57.9, periodDays: 88, spin: 0.9, phase: 0.5, moons: [] },
  { name: "Venus", a: 10.5, r: 0.95, distMkm: 108.2, periodDays: 224.7, spin: -0.4, phase: 2.4, moons: [] },
  { name: "Earth", a: 14, r: 1.0, distMkm: 149.6, periodDays: 365.25, spin: 1.2, phase: 4.1,
    moons: [{ r: 0.28, orbit: 2.3, speed: 1.6, color: "#c8c8cf", phase: 0 }] },
  { name: "Mars", a: 17.5, r: 0.75, distMkm: 227.9, periodDays: 687, spin: 1.1, phase: 1.3, moons: [] },
  { name: "Jupiter", a: 23, r: 2.4, distMkm: 778.6, periodDays: 4331, spin: 1.8, phase: 5.2,
    moons: [{ r: 0.3, orbit: 4.2, speed: 1.3, color: "#d9c9a0", phase: 1 }, { r: 0.24, orbit: 5.4, speed: 0.9, color: "#a7a39b", phase: 3.5 }] },
  { name: "Saturn", a: 29, r: 2.0, distMkm: 1433.5, periodDays: 10747, spin: 1.6, phase: 3.0,
    ring: { ri: 2.7, ro: 4.7, c1: "#d9c79a", c2: "#8c7a58" }, moons: [] },
  { name: "Uranus", a: 34.5, r: 1.5, distMkm: 2872.5, periodDays: 30589, spin: -1.0, phase: 0.2, moons: [] },
  { name: "Neptune", a: 39.5, r: 1.45, distMkm: 4495.1, periodDays: 59800, spin: 1.0, phase: 5.8, moons: [] }
];
const omegaOf = (p: PlanetSpec): number => 0.6 * Math.pow(88 / p.periodDays, 0.55);

/* ------------------------------------------------------------------ scene */
const G = (id: string, kids: Kids, position?: V3) =>
  group(id, kids, position ? { position } : {}).runtime({ id, mutable: true });

const worldKids: Kids[number][] = [];

// sun: emissive core + soft halo + light
worldKids.push(primitives.sphere({
  name: "sun-core", size: 7,
  material: material.emissive({ color: "#ffb347", emissive: "#ffb030", emissiveIntensity: 2.2 }), castShadow: false
}));
worldKids.push(primitives.sphere({
  name: "sun-halo", size: 10,
  material: material.emissive({ color: "#ff9a2a", emissive: "#ff8c20", emissiveIntensity: 1.5, opacity: 0.16 }), castShadow: false
}));
worldKids.push(lights.point({ name: "sun-light", position: [0, 0, 0], intensity: 3, decay: 0, distance: 400, color: "#fff1d6" }));

const planetMat = material.pbr({ color: "#ffffff", roughness: 0.85, metallic: 0 });
const orbitMat = material.emissive({ color: "#56668f", emissive: "#6479ad", emissiveIntensity: 0.9 });
const ringMat = material.pbr({ color: "#ffffff", roughness: 0.9, metallic: 0 });

PLANETS.forEach((p, i) => {
  worldKids.push(geometry.custom(annulusGeometry(p.a - 0.09, p.a + 0.09, 160), { name: `orbit-${p.name}`, material: orbitMat, castShadow: false }));
  const kids: Kids[number][] = [
    geometry.custom(sphereGeometry(p.r, colorFns[p.name]!), { name: `body-${p.name}`, material: planetMat })
      .runtime({ id: `body${i}`, mutable: true })
  ];
  if (p.ring) {
    const ring = p.ring;
    const c1 = hex(ring.c1), c2 = hex(ring.c2);
    kids.push(geometry.custom(
      annulusGeometry(ring.ri, ring.ro, 96, (t) => mix(c1, c2, Math.sin(t * 22) * 0.5 + 0.5 + (t > 0.55 && t < 0.62 ? 0.8 : 0))),
      { name: `ring-${p.name}`, material: ringMat }
    ).rotate(0.0, 0, 0.42));
  }
  p.moons.forEach((m, k) => {
    kids.push(primitives.sphere({ name: `moon-${p.name}-${k}`, size: m.r * 2, material: material.pbr({ color: m.color, roughness: 0.95 }) })
      .runtime({ id: `moon${i}_${k}`, mutable: true }));
  });
  worldKids.push(G(`pl${i}`, kids));
});

// stars
let seed = 90210;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const starSets: { tf: AuraTransformSpec[]; mat: ReturnType<typeof material.emissive> }[] = [
  { tf: [], mat: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.2 }) },
  { tf: [], mat: material.emissive({ color: "#aac8ff", emissive: "#aac8ff", emissiveIntensity: 1.2 }) },
  { tf: [], mat: material.emissive({ color: "#ffdcaa", emissive: "#ffdcaa", emissiveIntensity: 1.2 }) }
];
for (let i = 0; i < 900; i += 1) {
  const u = rand() * 2 - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 500;
  const size = 0.9 + rand() * rand() * 2.4;
  starSets[i % 3]!.tf.push({ position: [Math.cos(a) * s * R, u * R, Math.sin(a) * s * R], scale: [size, size, size] });
}
const starNodes: Kids[number][] = starSets.map((s, i) =>
  instances.box({ name: `stars-${i}`, transforms: s.tf, material: s.mat, castShadow: false }));

const rig = G("rig", [
  G("pitch", [
    G("yaw", [
      ...starNodes,
      G("offset", worldKids)
    ])
  ])
]);

const sc = scene({ background: "#02030a" })
  .camera(camera.perspective({ position: [0, 0, 0], target: [0, 0, -10], fov: 45, near: 0.1, far: 2000 }))
  .add(lights.ambient({ intensity: 0.3 }))
  .add(environments.neutral({ intensity: 0.12, background: false }))
  .add(effects.bloom({ intensity: 0.45, threshold: 0.85, radius: 0.5 }))
  .add(rig);

const app = createAuraApp("#app", { scene: sc });

/* ------------------------------------------------------------------ state */
const FOV = 45, W = 640, H = 360, TAN = Math.tan((FOV * Math.PI) / 360), ASPECT = W / H;
const TRANSITION = 1.5;
interface Cam { fx: number; fy: number; fz: number; yaw: number; pitch: number; dist: number }
const ov = { yaw: 0.3, pitch: 0.6, dist: 85 };
const DIST_MIN = 25, DIST_MAX = 150, PITCH_MIN = 0.05, PITCH_MAX = 1.5;
const cam: Cam = { fx: 0, fy: 0, fz: 0, yaw: ov.yaw, pitch: ov.pitch, dist: ov.dist };
let focusIdx = -1;
let transFrom: Cam | null = null;
let transT = 0;
let paused = false;
let simTime = 0;
const planetPos: V3[] = PLANETS.map(() => [0, 0, 0]);
let spinT = 0;

const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const computePositions = (): void => {
  PLANETS.forEach((p, i) => {
    const ang = p.phase + omegaOf(p) * simTime;
    planetPos[i] = [Math.cos(ang) * p.a, 0, Math.sin(ang) * p.a];
  });
};

const focusTarget = (i: number): Cam => {
  const p = PLANETS[i]!, pp = planetPos[i]!;
  // camera sits on the sun-facing side, rotated slightly so the lit phase is visible
  const len = Math.hypot(pp[0], pp[2]) || 1;
  const al = 0.45, ca = Math.cos(al), sa = Math.sin(al);
  const sx0 = -pp[0] / len, sz0 = -pp[2] / len;
  const sx = sx0 * ca - sz0 * sa, sz = sx0 * sa + sz0 * ca;
  return { fx: pp[0], fy: pp[1], fz: pp[2], yaw: Math.atan2(-sx, sz), pitch: 0.28, dist: p.r * 4 + 1.5 };
};
const overviewTarget = (): Cam => ({ fx: 0, fy: 0, fz: 0, yaw: ov.yaw, pitch: ov.pitch, dist: ov.dist });

const startTransition = (): void => {
  transFrom = { ...cam };
  transT = 0;
};

const focusPlanet = (name: string): void => {
  const i = PLANETS.findIndex((p) => p.name.toLowerCase() === String(name).toLowerCase());
  if (i < 0 || i === focusIdx) return;
  focusIdx = i;
  startTransition();
  showPanel(i);
};
const unfocus = (): void => {
  if (focusIdx < 0) return;
  focusIdx = -1;
  startTransition();
  hidePanel();
};

const updateCamera = (dt: number): void => {
  const target = focusIdx >= 0 ? focusTarget(focusIdx) : overviewTarget();
  if (transFrom) {
    transT += dt;
    const u = Math.min(1, transT / TRANSITION), e = ease(u);
    const f = transFrom;
    cam.fx = lerp(f.fx, target.fx, e);
    cam.fy = lerp(f.fy, target.fy, e);
    cam.fz = lerp(f.fz, target.fz, e);
    cam.yaw = f.yaw + wrapPi(target.yaw - f.yaw) * e;
    cam.pitch = lerp(f.pitch, target.pitch, e);
    cam.dist = lerp(f.dist, target.dist, e);
    if (u >= 1) transFrom = null;
  } else {
    Object.assign(cam, target);
  }
};

const cameraDistanceToFocus = (): number | null => {
  if (focusIdx < 0) return null;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const cx = cam.fx - cam.dist * cp * Math.sin(cam.yaw);
  const cy = cam.fy + cam.dist * sp;
  const cz = cam.fz + cam.dist * cp * Math.cos(cam.yaw);
  const pp = planetPos[focusIdx]!;
  return Math.hypot(cx - pp[0], cy - pp[1], cz - pp[2]);
};

/* ------------------------------------------------------------------ DOM */
const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const mk = (css: string, tag = "div"): HTMLElement => {
  const el = document.createElement(tag);
  el.style.cssText = css;
  document.body.appendChild(el);
  return el;
};
const pauseBtn = mk(
  "position:absolute;left:8px;top:8px;padding:5px 14px;font:600 13px system-ui,sans-serif;color:#e8eeff;background:rgba(20,28,56,0.8);border:1px solid #5a6fb0;border-radius:6px;cursor:pointer;",
  "button"
) as HTMLButtonElement;
pauseBtn.id = "pause-btn";
pauseBtn.type = "button";
pauseBtn.textContent = "Pause";
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Play" : "Pause";
});
const panel = mk(
  "position:absolute;right:8px;top:8px;width:190px;padding:10px 12px;background:rgba(10,16,36,0.82);border:1px solid #5a6fb0;border-radius:8px;color:#e8eeff;display:none;pointer-events:none;"
);
panel.id = "info-panel";
mk("position:absolute;left:8px;bottom:6px;font:11px system-ui,sans-serif;color:#8d9bc4;pointer-events:none;width:620px;")
  .textContent = "Click a planet to focus. Drag to orbit, scroll to zoom, Esc to return.";
const fmt = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
function showPanel(i: number): void {
  const p = PLANETS[i]!;
  panel.innerHTML = "";
  const h = document.createElement("div");
  h.id = "info-name";
  h.style.cssText = "font:700 17px system-ui,sans-serif;margin-bottom:6px;";
  h.textContent = p.name;
  const l1 = document.createElement("div");
  l1.id = "info-period";
  l1.textContent = `Orbital period: ${fmt(p.periodDays)} Earth days`;
  const l2 = document.createElement("div");
  l2.id = "info-distance";
  l2.textContent = `Distance from star: ${fmt(p.distMkm)} million km`;
  panel.append(h, l1, l2);
  panel.style.display = "block";
}
function hidePanel(): void {
  panel.style.display = "none";
}

/* ------------------------------------------------------------------ picking and input */
const pickAt = (sx: number, sy: number): number => {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw);
  let best = -1, bestZ = Infinity;
  PLANETS.forEach((p, i) => {
    const pp = planetPos[i]!;
    const x0 = pp[0] - cam.fx, y0 = pp[1] - cam.fy, z0 = pp[2] - cam.fz;
    const x1 = x0 * cyw + z0 * syw, z1 = -x0 * syw + z0 * cyw;
    const y2 = y0 * cp - z1 * sp, z2 = y0 * sp + z1 * cp - cam.dist;
    if (z2 >= -0.1) return;
    const ndcX = x1 / (-z2 * TAN * ASPECT), ndcY = y2 / (-z2 * TAN);
    const px = ((ndcX + 1) / 2) * W, py = ((1 - ndcY) / 2) * H;
    const rad = Math.max(10, (p.r / (-z2 * TAN)) * (H / 2) + 4);
    if (Math.hypot(px - sx, py - sy) <= rad && -z2 < bestZ) {
      bestZ = -z2;
      best = i;
    }
  });
  return best;
};

const canvasXY = (e: MouseEvent): [number, number] => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
};
let down = false, dragged = false, lastX = 0, lastY = 0, startX = 0, startY = 0;
canvas.addEventListener("pointerdown", (e) => {
  down = true;
  dragged = false;
  lastX = startX = e.clientX;
  lastY = startY = e.clientY;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (down) {
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) dragged = true;
    if (dragged && focusIdx < 0) {
      ov.yaw += (e.clientX - lastX) * 0.008;
      ov.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, ov.pitch + (e.clientY - lastY) * 0.006));
    }
    lastX = e.clientX;
    lastY = e.clientY;
  } else {
    const [x, y] = canvasXY(e);
    canvas.style.cursor = pickAt(x, y) >= 0 ? "pointer" : "default";
  }
});
const endPointer = (e: PointerEvent, click: boolean): void => {
  if (!down) return;
  down = false;
  if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  if (click && !dragged) {
    const [x, y] = canvasXY(e);
    const i = pickAt(x, y);
    if (i >= 0) focusPlanet(PLANETS[i]!.name);
    else unfocus();
  }
};
canvas.addEventListener("pointerup", (e) => endPointer(e, true));
canvas.addEventListener("pointercancel", (e) => endPointer(e, false));
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (focusIdx >= 0) return;
  ov.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, ov.dist * Math.exp(e.deltaY * 0.0012)));
}, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});

/* ------------------------------------------------------------------ frame */
const nodeOf = (id: string) => app.nodes.require(id);
const applyTransforms = (): void => {
  nodeOf("rig").setPosition(0, 0, -cam.dist);
  nodeOf("pitch").setRotation(cam.pitch, 0, 0);
  nodeOf("yaw").setRotation(0, cam.yaw, 0);
  nodeOf("offset").setPosition(-cam.fx, -cam.fy, -cam.fz);
  PLANETS.forEach((p, i) => {
    const pp = planetPos[i]!;
    nodeOf(`pl${i}`).setPosition(pp[0], pp[1], pp[2]);
    nodeOf(`body${i}`).setRotation(0, spinT * p.spin, 0);
    p.moons.forEach((m, k) => {
      const a = m.phase + m.speed * simTime;
      nodeOf(`moon${i}_${k}`).setPosition(Math.cos(a) * m.orbit, 0.15 * Math.sin(a * 0.5), Math.sin(a) * m.orbit);
    });
  });
};

const step = (dtRaw: number): void => {
  const dt = Math.min(0.1, Math.max(0, dtRaw));
  if (!paused) {
    simTime += dt;
    spinT += dt;
  }
  computePositions();
  updateCamera(dt);
  applyTransforms();
};

computePositions();
updateCamera(0);
applyTransforms();
app.onFrame((f: { dt: number }) => step(f.dt));

window.__focusPlanet = focusPlanet;
window.__unfocus = unfocus;
let ready = false;
Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get: () => ({
    ready,
    focused: focusIdx >= 0 ? PLANETS[focusIdx]!.name : null,
    paused,
    planets: PLANETS.map((p, i) => ({ name: p.name, x: planetPos[i]![0], y: planetPos[i]![1], z: planetPos[i]![2] })),
    cameraDistanceToFocus: cameraDistanceToFocus()
  })
});

await app.ready();
ready = true;
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
