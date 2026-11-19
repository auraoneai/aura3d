#!/usr/bin/env node
// Measures the empty wheel arches of the wheel-less Idol vehicle bodies (assets/idol/<key>.glb, length along +Z,
// width along X, grounded at y = 0) and writes src/game/idolWheels.json: per body the wheel radius, the lift that
// raises the body so the wheels touch the road, and the hub positions in the body's local frame.
// Rail bodies (tram, locomotive, coach) have flat undersides: their bogie wheels sit under the body instead.
//   node apps/showcase-cross-hop/scripts/measure-idol-wheels.mjs
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(resolve(appDir, "../../tools/idol/normalize.mjs"));
const { NodeIO } = await import(pathToFileURL(req.resolve("@gltf-transform/core")).href);
const { ALL_EXTENSIONS } = await import(pathToFileURL(req.resolve("@gltf-transform/extensions")).href);

const ROAD = ["hopCarSedan", "hopCarHatch", "hopCarSuv", "hopCarTaxi", "hopCarVan", "hopCarPickup", "hopBoxTruck"];
const RAIL = ["hopTram", "hopTrainLoco", "hopTrainCoach"];
const WHEEL_HALF_WIDTH = { road: 0.075, rail: 0.05 }; // half the drawn tyre width (m); keeps the outer face flush

async function triangles(key) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(resolve(appDir, `assets/idol/${key}.glb`));
  const tris = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute("POSITION"); const v = [0, 0, 0]; const P = [];
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, v);
        P.push([m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]);
      }
      const idx = prim.getIndices().getArray();
      for (let t = 0; t < idx.length; t += 3) tris.push([P[idx[t]], P[idx[t + 1]], P[idx[t + 2]]]);
    }
  }
  return tris;
}
async function vertices(key) { return (await triangles(key)).flat(); }

const r3 = (v) => Math.round(v * 1000) / 1000;

function bounds(V) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of V) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return { lo, hi };
}

/**
 * Road bodies: the side silhouette of the outer skin (triangles within 15% of the body's local half-width at their
 * station, densely sampled) gives the lowest body point per station along the length. Wheel arches are the runs whose
 * underside rises above ARCH_Y with lower body on both sides (runs touching a bumper end are overhangs, not arches).
 * All wheels take the size that fills the widest arch (0.96 x its opening, capped so the body is raised at most
 * MAX_LIFT); the body is raised so every tyre stands on the road and clears that arch's crown by 1 cm.
 */
const ARCH_Y = 0.075, MAX_LIFT = 0.06, N_STATIONS = 100;
function measureRoad(key, T) {
  const V = T.flat();
  const { lo, hi } = bounds(V);
  const halfW = Math.max(-lo[0], hi[0]), H = hi[1] - lo[1], L = hi[2] - lo[2], N = N_STATIONS;
  const bin = (z) => Math.min(N - 1, Math.max(0, Math.floor(((z - lo[2]) / L) * N)));
  const lw = new Array(N).fill(0);
  for (const p of V) if (p[1] < 0.5 * H) lw[bin(p[2])] = Math.max(lw[bin(p[2])], Math.abs(p[0]));
  const lws = lw.map((_, k) => Math.max(...lw.slice(Math.max(0, k - 3), k + 4)));
  const prof = new Array(N).fill(Infinity);
  for (const t of T) {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
    if (Math.abs(cx) < 0.85 * lws[bin(cz)]) continue;
    for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6 - a; b++) {
      const c = 6 - a - b;
      const y = (t[0][1] * a + t[1][1] * b + t[2][1] * c) / 6, z = (t[0][2] * a + t[1][2] * b + t[2][2] * c) / 6;
      const k = bin(z); prof[k] = Math.min(prof[k], y);
    }
  }
  const up = prof.map((y) => y > ARCH_Y);
  const runs = [];
  for (let i = 0; i < N; i++) {
    if (!up[i]) continue;
    let j = i; while (j + 1 < N && up[j + 1]) j++;
    if (i > 0 && j < N - 1 && j - i + 1 >= 4) runs.push({ i, j });
    i = j;
  }
  const want = key === "hopBoxTruck" ? 4 : 2;
  const arches = runs.sort((a, b) => (b.j - b.i) - (a.j - a.i)).slice(0, want).sort((a, b) => a.i - b.i).map(({ i, j }) => {
    let top = 0; for (let k = i; k <= j; k++) if (Number.isFinite(prof[k])) top = Math.max(top, prof[k]);
    const z0 = lo[2] + (i / N) * L, z1 = lo[2] + ((j + 1) / N) * L;
    return { z0, z1, top };
  });
  if (arches.length < 2) throw new Error(`${key}: found ${arches.length} wheel arches`);
  // One wheel size per vehicle, set by its clearest (widest) arch: a shallower arch hides the tyre's top inside the
  // fender instead of shrinking that wheel. The body rises at most MAX_LIFT.
  const widest = arches.reduce((a, b) => (b.z1 - b.z0 > a.z1 - a.z0 ? b : a));
  const r = Math.min(0.48 * (widest.z1 - widest.z0), (widest.top + MAX_LIFT - 0.01) / 2);
  for (const a of arches) a.r = r;
  const lift = Math.min(MAX_LIFT, Math.max(0, 2 * r + 0.01 - widest.top));
  const hubX = halfW - WHEEL_HALF_WIDTH.road;
  const hubs = [], radii = [];
  for (const a of arches) for (const s of [-1, 1]) { hubs.push([r3(s * hubX), r3(a.r - lift), r3((a.z0 + a.z1) / 2)]); radii.push(r3(a.r)); }
  return { rail: false, radius: r3(Math.max(...arches.map((a) => a.r))), radii, lift: r3(lift), hubs, arches: arches.map((a) => [r3(a.z0), r3(a.z1), r3(a.top)]), body: { halfWidth: r3(halfW), height: r3(H), length: r3(L) } };
}

function measureRail(V) {
  const { lo, hi } = bounds(V);
  const halfW = Math.max(-lo[0], hi[0]), H = hi[1] - lo[1], L = hi[2] - lo[2];
  const radius = r3(Math.min(0.16, H * 0.085));
  const lift = r3(radius * 1.35); // the body rides on its bogies; the wheels peek out below the skirt
  const hubY = r3(radius - lift);
  const hubX = r3(Math.min(halfW * 0.8, halfW - WHEEL_HALF_WIDTH.rail));
  const hubs = [];
  for (const bogie of [-0.3, 0.3]) for (const axle of [-0.085, 0.085]) for (const s of [-1, 1]) hubs.push([r3(s * hubX), hubY, r3((lo[2] + hi[2]) / 2 + (bogie + axle) * L)]);
  return { rail: true, radius, radii: hubs.map(() => radius), lift, hubs, arches: [], body: { halfWidth: r3(halfW), height: r3(H), length: r3(L) } };
}

const out = {};
for (const key of ROAD) out[key] = measureRoad(key, await triangles(key));
for (const key of RAIL) out[key] = measureRail(await vertices(key));
writeFileSync(resolve(appDir, "src/game/idolWheels.json"), JSON.stringify(out, null, 2) + "\n");
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(14), "r", v.radius, "lift", v.lift, "hubs", v.hubs.length, "arches", JSON.stringify(v.arches));
