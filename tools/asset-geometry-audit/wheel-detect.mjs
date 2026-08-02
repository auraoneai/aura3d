#!/usr/bin/env node
/**
 * Geometric wheel/appendage detection for vehicle assets.
 *
 * ## Why this exists
 *
 * Two vehicle assets shipped as the Turbo Drift Circuit hero and both were visually broken in ways
 * every existing gate accepted:
 *
 * - `showcaseTexturedSportsCar`: four tyres modelled **detached from the hull on stalks** at roughly
 *   truck scale, plus an untextured cockpit.
 * - `showcaseCityVehicle`: a 792-triangle city-traffic body shell with **no wheels modelled at all**.
 *
 * Neither was caught, because every check upstream measured the *frame* rather than the *model*:
 * `routePrimaryProbeThresholds` measures subject pixel size, `readabilityRuleForRole` measures
 * foreground bounds in an isolated probe, and the composition checks measure coverage ratios. A
 * wheelless car passes all of them — it is a large, readable, well-lit, correctly-framed subject.
 *
 * Name matching does not work either: the auto-pulled Objaverse candidates name every part
 * `polySurfaceNNN`, so there is nothing to grep for.
 *
 * So this detects wheels from geometry: a wheel is a roughly-circular part (near-square profile in
 * side view), sitting low on the body, not wider than it is round, at a plausible size relative to
 * body height, and appearing at multiple distinct outboard corners.
 *
 * ## `wheelsVisible` is a separate question from `wheeled`
 *
 * `wheeled` proves the wheels *exist*. It does not prove a viewer can *see* them, and that gap
 * matters: `turboHeroCar` reports 16 wheel parts across 4 corners, yet from the chase camera it still
 * reads as a wheelless shell, because it is a closed-wheel Le Mans-style prototype whose wheels sit
 * at |X| <= 8.37 inside bodywork reaching |X| 9.87. Enclosed wheels are correct for that body style
 * and no camera or grounding change can reveal them.
 *
 * `wheelsVisible` therefore reports whether any wheel extends to or past the body silhouette, which
 * is what an open-wheel or road-car look requires. A route wanting visible tyres must select an asset
 * where this is true, rather than re-framing an asset where it cannot be.
 *
 * Usage:
 *   node tools/asset-geometry-audit/wheel-detect.mjs <glb...>
 *   node tools/asset-geometry-audit/wheel-detect.mjs --json <glb...>
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const files = args.filter((arg) => !arg.startsWith("--"));
if (files.length === 0) {
  console.error("usage: wheel-detect.mjs [--json] <glb...>");
  process.exit(2);
}

/** Minimum distinct outboard corners carrying a wheel-like part for a vehicle to be considered wheeled. */
export const MIN_WHEEL_CORNERS = 3;

/**
 * Role-aware admission is delegated to the reusable API rather than re-decided here.
 *
 * This script owns *geometry measurement*; it does not own the question "is this asset fit for the
 * requested role?" That question is role-relative -- a wheelless shell is a good background traffic prop
 * and a bad hero -- and `@aura3d/cli`'s `admitAssetForRole` is the single place that answers it. Keeping a
 * second verdict here would let the script and the CLI disagree about the same asset.
 *
 * `--role` selects the requirement; the default `hero-vehicle` preserves this script's previous strictness.
 */
// Loaded from built output: this is a plain `.mjs` script and cannot import the TypeScript source. Run
// `pnpm build` first if the import fails.
const { admitAssetForRole } = await import("../../packages/aura3d-cli/dist/asset-role-admission.js");

const roleFlagIndex = args.indexOf("--role");
const requestedRole = roleFlagIndex >= 0 ? args[roleFlagIndex + 1] : "hero-vehicle";

const results = files
  .filter((file) => file !== requestedRole)
  .map((file) => {
    const geometry = auditVehicleGlb(file);
    const admission = admitAssetForRole({
      assetId: file,
      requirement: {
        role: requestedRole,
        // Only a hero vehicle is required to show readable tyres; a background vehicle is not.
        ...(requestedRole === "hero-vehicle" ? { requireReadableWheels: true } : {})
      },
      geometry: {
        partCount: geometry.partCount,
        triangles: geometry.triangles,
        bounds: geometry.bounds,
        wheelCandidates: geometry.wheelCandidates,
        distinctWheelCorners: geometry.distinctCorners,
        wheelsVisibleInSilhouette: geometry.wheelsVisible,
        wheelHalfWidth: geometry.wheelHalfWidth,
        bodyHalfWidth: geometry.bodyHalfWidth
      }
    });
    return { ...geometry, role: requestedRole, admission };
  });

if (asJson) {
  console.log(JSON.stringify({ schema: "aura3d-vehicle-wheel-audit/2.0", role: requestedRole, results }, null, 2));
} else {
  for (const r of results) {
    const verdict = !r.wheeled ? "NO-WHEELS" : r.wheelsVisible ? "WHEELS-VISIBLE" : "WHEELS-ENCLOSED";
    console.log(
      `${verdict.padEnd(10)} ${r.file}\n` +
      `  parts=${r.partCount} wheelCandidates=${r.wheelCandidates} corners=${r.distinctCorners} ` +
      `triangles=${r.triangles} bounds=[${r.bounds.map((v) => v.toFixed(2)).join(", ")}]`
    );
    for (const note of r.notes) console.log(`  - ${note}`);
    // The admission verdict is the actionable one: it is role-relative and explains itself.
    console.log(`  admission(${r.role}): ${r.admission.admitted ? "ADMITTED" : "REJECTED"}`);
    for (const blocker of r.admission.blockers) console.log(`    x ${blocker}`);
    for (const unproven of r.admission.unproven) console.log(`    ? ${unproven}`);
    if (r.admission.suitableAlternativeRoles.length > 0) {
      console.log(`    -> would suit: ${r.admission.suitableAlternativeRoles.join(", ")}`);
    }
  }
}
// Exit status now follows the shared admission verdict rather than a locally-invented rule.
if (results.some((r) => !r.admission.admitted)) process.exitCode = 1;

export function auditVehicleGlb(file) {
  const { json, } = readGlb(file);
  const parts = collectNodeWorldBounds(json);
  const notes = [];
  if (parts.length === 0) {
    return { file, wheeled: false, wheelsVisible: false, wheelHalfWidth: 0, bodyHalfWidth: 0, partCount: 0, wheelCandidates: 0, distinctCorners: 0, triangles: 0, bounds: [0, 0, 0], notes: ["no mesh nodes with position bounds"] };
  }
  const lo = axisReduce(parts, "lo", Math.min);
  const hi = axisReduce(parts, "hi", Math.max);
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const triangles = parts.reduce((sum, p) => sum + p.triangles, 0);

  // Longest horizontal axis is the vehicle's length; the other horizontal axis is its width.
  const lengthAxis = size[0] >= size[2] ? 0 : 2;
  const widthAxis = lengthAxis === 0 ? 2 : 0;

  const candidates = parts.filter((part) => {
    const extent = [part.hi[0] - part.lo[0], part.hi[1] - part.lo[1], part.hi[2] - part.lo[2]];
    if (Math.min(...extent) <= 0) return false;
    // Must sit low on the body: wheels live under it, not on the roof.
    const topFraction = (part.hi[1] - lo[1]) / Math.max(size[1], 1e-9);
    if (topFraction > 0.55) return false;
    const height = extent[1];
    const length = extent[lengthAxis];
    const width = extent[widthAxis];
    // Near-square side profile: a disc, not a slab or a rail.
    const roundness = Math.min(height, length) / Math.max(height, length);
    if (roundness < 0.55) return false;
    // A wheel is not much wider than its diameter.
    if (width > Math.max(height, length) * 1.25) return false;
    // Plausible wheel diameter relative to body height.
    const relative = Math.max(height, length) / Math.max(size[1], 1e-9);
    return relative > 0.12 && relative < 0.75;
  });

  const midLength = (lo[lengthAxis] + hi[lengthAxis]) / 2;
  const midWidth = (lo[widthAxis] + hi[widthAxis]) / 2;
  const corners = new Set(candidates.map((part) => {
    const cl = (part.lo[lengthAxis] + part.hi[lengthAxis]) / 2 > midLength ? "f" : "r";
    const cw = (part.lo[widthAxis] + part.hi[widthAxis]) / 2 > midWidth ? "l" : "r";
    return `${cl}${cw}`;
  }));

  if (parts.length === 1) notes.push("single-mesh asset: wheels cannot be separate parts, so they are either modelled into the shell or absent");
  if (candidates.length === 0) notes.push("no roughly-circular low-mounted parts found");
  else if (corners.size < MIN_WHEEL_CORNERS) notes.push(`wheel-like parts found at only ${corners.size} corner(s); a vehicle needs ${MIN_WHEEL_CORNERS}+`);

  // Do any wheels reach the body silhouette? Enclosed wheels are invisible from outside the bodywork.
  const bodyHalfWidth = Math.max(Math.abs(lo[widthAxis]), Math.abs(hi[widthAxis]));
  const wheelHalfWidth = candidates.reduce(
    (acc, part) => Math.max(acc, Math.abs(part.lo[widthAxis]), Math.abs(part.hi[widthAxis])),
    0
  );
  const wheelsVisible = candidates.length > 0 && wheelHalfWidth >= bodyHalfWidth - Math.max(size[widthAxis] * 0.02, 1e-6);
  if (candidates.length > 0 && !wheelsVisible) {
    notes.push(
      `wheels are enclosed inside the bodywork (wheel |half-width| ${wheelHalfWidth.toFixed(2)} vs body ${bodyHalfWidth.toFixed(2)}): ` +
      "they exist but cannot be seen from outside, so this asset reads as a closed-wheel prototype"
    );
  }

  return {
    file,
    wheeled: corners.size >= MIN_WHEEL_CORNERS,
    wheelsVisible,
    wheelHalfWidth,
    bodyHalfWidth,
    partCount: parts.length,
    wheelCandidates: candidates.length,
    distinctCorners: corners.size,
    triangles,
    bounds: size,
    notes
  };
}

function readGlb(file) {
  const bytes = readFileSync(file);
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a binary GLB`);
  const jsonLength = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) };
}

function axisReduce(parts, key, fn) {
  return [0, 1, 2].map((axis) => parts.reduce((acc, part) => fn(acc, part[key][axis]), fn === Math.min ? Infinity : -Infinity));
}

/** World-space AABB per mesh node, from accessor min/max composed through the node hierarchy. */
function collectNodeWorldBounds(json) {
  const nodes = json.nodes ?? [];
  const parent = new Map();
  nodes.forEach((node, index) => (node.children ?? []).forEach((child) => parent.set(child, index)));
  const localMatrix = (node) => {
    if (Array.isArray(node.matrix)) return node.matrix;
    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];
    const r = [
      1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
      2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)
    ];
    // column-major 4x4
    return [
      r[0] * sx, r[1] * sx, r[2] * sx, 0,
      r[3] * sy, r[4] * sy, r[5] * sy, 0,
      r[6] * sz, r[7] * sz, r[8] * sz, 0,
      tx, ty, tz, 1
    ];
  };
  const multiply = (a, b) => {
    const out = new Array(16).fill(0);
    for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
    return out;
  };
  const worldMatrix = (index) => {
    let m = localMatrix(nodes[index]);
    let p = parent.get(index);
    while (p !== undefined) { m = multiply(localMatrix(nodes[p]), m); p = parent.get(p); }
    return m;
  };
  const apply = (m, [x, y, z]) => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];

  const out = [];
  nodes.forEach((node, index) => {
    if (node.mesh === undefined) return;
    const mesh = json.meshes[node.mesh];
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors[primitive.attributes.POSITION];
      if (!accessor?.min || !accessor?.max) continue;
      lo = lo.map((v, i) => Math.min(v, accessor.min[i]));
      hi = hi.map((v, i) => Math.max(v, accessor.max[i]));
      if (primitive.indices !== undefined) triangles += Math.floor(json.accessors[primitive.indices].count / 3);
    }
    if (!lo.every(Number.isFinite)) return;
    const m = worldMatrix(index);
    const corners = [];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push(apply(m, [x, y, z]));
    out.push({
      name: node.name ?? `node${index}`,
      lo: [0, 1, 2].map((a) => Math.min(...corners.map((c) => c[a]))),
      hi: [0, 1, 2].map((a) => Math.max(...corners.map((c) => c[a]))),
      triangles
    });
  });
  return out;
}
