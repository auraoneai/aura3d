/**
 * Owner QA (Nov 18): "the roof parcel hides the driver". The Idol courier body was generated with opaque privacy glass and
 * a big orange cargo box over the whole cabin roof, so from the bird's-eye chase it read as a driverless box. Render layer
 * only: `tools/derive-courier-glass-roof.mjs` cuts the roof skin, the fused parcel and the beacon inside the rack rails out of
 * `gcCourier.glb` (the opening below) and this module fills it with a tinted glass roof in a dark rubber frame, a dark cabin
 * tub (so nothing behind the glass is see-through), two seats, a seated courier in an orange jacket and cream cap with both
 * hands on the steering wheel, and a smaller strapped parcel at the back of the rack (behind the driver's head from the chase
 * eye). Positions are in the courier body frame (+Z forward, road at y = 0, before the body `lift`). Nothing feeds the sim.
 */
import { geometry, material, type AuraMaterialSpec } from "@aura3d/engine";
import { bevelBoxMesh, buildGroupedGeometrySpec, icosphereSmoothMesh, latheMesh, memoizeGeometry, taubinSmoothMesh, transformMesh, tubeSweepMesh } from "../../apps/showcase-port-shared/proceduralKernel";
import type { MultiMatSlot, RawMesh } from "@aura3d/engine/sculpt";

/** The roof opening cut from the Idol body (keep in step with tools/derive-courier-glass-roof.mjs). */
export const COURIER_ROOF_OPENING = { halfX: 0.4, centreX: 0, zMin: -1.42, zMax: 0.26, yAbove: 1.4 } as const;

/**
 * The derived wheel-less, roof-less courier body (same frame, bounds and textures as `gcCourier`). A same-origin path (the
 * production bridge blocks absolute / remote model URLs) with the file's sha256 (tools/derive-courier-glass-roof.mjs prints
 * it; the unit test checks it), so it loads as a hashed asset like the manifest ones.
 */
export const COURIER_GLASS_ROOF = {
  url: new URL("./assets/idol/gcCourierGlassRoof.glb", import.meta.url).pathname,
  hash: "sha256-660665f535944c13a9ddb128fd8669c2840d010b22bfbd73dc628f6a92b19df8",
  sizeBytes: 3119704
} as const;

/** Glass roof plane height and the frame around the opening. */
export const GLASS_ROOF = { y: 1.5, halfX: 0.44, zMin: -1.46, zMax: 0.3, frameRadius: 0.032 } as const;

/** The seated driver (left-hand drive: the car's left is +X). Head centre, cap top and hands, body frame. */
export const DRIVER = { x: 0.24, head: [0.24, 1.25, -0.36] as const, headRadius: 0.105, capTop: 1.39, hands: [[0.1, 1.02, 0.1], [0.38, 1.02, 0.1]] as const, wheel: { centre: [0.24, 1.02, 0.12] as const, radius: 0.17 } } as const;

/** The smaller roof parcel at the back of the rack (was 0.86 x 1.3 x 0.45 m over the whole cabin). */
export const ROOF_PARCEL = { halfX: 0.27, zMin: -1.42, zMax: -1.06, height: 0.24, baseY: 1.5 } as const;

/** The cabin tub inside the body shell (walls inset from the shell so none pierces it). */
export const CABIN_TUB = { halfX: 0.52, zMin: -1.5, zMax: 0.32, floorY: 0.55, topY: 1.44 } as const;

const enum Mat {
  Tub = 0,
  Seat = 1,
  Jacket = 2,
  Skin = 3,
  Cap = 4,
  Rubber = 5,
  Parcel = 6,
  Strap = 7,
  Trousers = 8
}

function cabinMaterials(): AuraMaterialSpec[] {
  return [
    material.pbr({ color: "#1c1f24", roughness: 0.9, metallic: 0 }),
    material.fabric({ color: "#353a42", roughness: 0.95 }),
    material.pbr({ color: "#f07a2a", roughness: 0.62, metallic: 0 }),
    material.pbr({ color: "#c58b66", roughness: 0.7, metallic: 0 }),
    material.pbr({ color: "#f1e6d0", roughness: 0.55, metallic: 0 }),
    material.blackRubber({ color: "#15181d", roughness: 0.85 }),
    material.pbr({ color: "#ee7d2b", roughness: 0.48, metallic: 0, clearcoat: 0.3 }),
    material.pbr({ color: "#2b2f36", roughness: 0.8, metallic: 0 }),
    material.pbr({ color: "#28364a", roughness: 0.85, metallic: 0 })
  ];
}

type V3 = readonly [number, number, number];
const box = (size: V3, pos: V3, bevel = 0.02, rot: V3 = [0, 0, 0]): RawMesh => transformMesh(bevelBoxMesh(size[0], size[1], size[2], bevel), { pos: [...pos] as [number, number, number], rot: [...rot] as [number, number, number] });
const soft = (size: V3, pos: V3, rot: V3 = [0, 0, 0]): RawMesh => transformMesh(taubinSmoothMesh(bevelBoxMesh(size[0], size[1], size[2], Math.min(...size) * 0.3), 3), { pos: [...pos] as [number, number, number], rot: [...rot] as [number, number, number] });
const ball = (r: number, pos: V3): RawMesh => transformMesh(icosphereSmoothMesh(r, 2, 0, 1), { pos: [...pos] as [number, number, number] });
const limb = (a: V3, b: V3, ra: number, rb: number): RawMesh => tubeSweepMesh([[a[0], a[1], a[2], ra], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, (ra + rb) / 2], [b[0], b[1], b[2], rb]], 10);

/** Every opaque cabin part as material slots (body frame, before `lift`). */
export function courierCabinSlots(): MultiMatSlot[] {
  const t = CABIN_TUB;
  const slots: MultiMatSlot[] = [];
  const add = (materialIndex: Mat, mesh: RawMesh) => slots.push({ materialIndex, mesh });
  const midZ = (t.zMin + t.zMax) / 2;
  const lenZ = t.zMax - t.zMin;
  // tub: floor, two side walls, front (dash) and back panels
  add(Mat.Tub, box([2 * t.halfX, 0.04, lenZ], [0, t.floorY, midZ], 0.01));
  for (const s of [-1, 1]) add(Mat.Tub, box([0.04, t.topY - t.floorY, lenZ], [s * t.halfX, (t.floorY + t.topY) / 2, midZ], 0.01));
  add(Mat.Tub, box([2 * t.halfX, t.topY - t.floorY, 0.04], [0, (t.floorY + t.topY) / 2, t.zMin], 0.01));
  // dashboard under the windscreen
  add(Mat.Tub, box([2 * t.halfX, 0.22, 0.3], [0, 0.95, 0.36], 0.04));
  // two front seats (cushion + backrest + headrest) and a rear bench
  for (const sx of [DRIVER.x, -DRIVER.x]) {
    add(Mat.Seat, soft([0.4, 0.12, 0.44], [sx, 0.72, -0.2]));
    add(Mat.Seat, soft([0.4, 0.56, 0.12], [sx, 1.0, -0.5], [-0.2, 0, 0]));
    add(Mat.Seat, soft([0.22, 0.12, 0.1], [sx, 1.34, -0.6], [-0.2, 0, 0]));
  }
  add(Mat.Seat, soft([0.94, 0.14, 0.44], [0, 0.7, -1.05]));
  add(Mat.Seat, soft([0.94, 0.5, 0.12], [0, 0.98, -1.3], [-0.15, 0, 0]));
  // the courier: torso, hips/thighs, arms reaching to the wheel, head and cap
  const [hx, hy, hz] = DRIVER.head;
  add(Mat.Jacket, soft([0.36, 0.44, 0.24], [hx, 0.98, -0.42], [-0.18, 0, 0]));
  for (const s of [-1, 1]) {
    const shoulder: V3 = [hx + s * 0.17, 1.13, -0.42];
    const elbow: V3 = [hx + s * 0.2, 0.98, -0.16];
    const hand = DRIVER.hands[s < 0 ? 0 : 1];
    add(Mat.Jacket, ball(0.07, shoulder));
    add(Mat.Jacket, limb(shoulder, elbow, 0.062, 0.05));
    add(Mat.Jacket, ball(0.05, elbow));
    add(Mat.Jacket, limb(elbow, hand, 0.05, 0.042));
    add(Mat.Skin, ball(0.042, hand));
    // thighs forward from the seat, shins down into the footwell
    const hip: V3 = [hx + s * 0.1, 0.8, -0.3];
    const knee: V3 = [hx + s * 0.11, 0.86, 0.12];
    add(Mat.Trousers, limb(hip, knee, 0.075, 0.06));
    add(Mat.Trousers, limb(knee, [hx + s * 0.11, 0.6, 0.24], 0.055, 0.045));
  }
  add(Mat.Skin, limb([hx, 1.16, -0.4], [hx, 1.2, -0.38], 0.05, 0.05));
  add(Mat.Skin, ball(DRIVER.headRadius, DRIVER.head));
  // cap: crown dome and a short brim toward the windscreen
  add(Mat.Cap, transformMesh(latheMesh([[0, 0.1], [0.06, 0.095], [0.1, 0.07], [0.115, 0.02], [0.116, 0]], 16), { pos: [hx, hy + 0.028, hz] }));
  add(Mat.Cap, transformMesh(bevelBoxMesh(0.16, 0.014, 0.1, 0.006), { pos: [hx, hy + 0.035, hz + 0.135], rot: [0.12, 0, 0] }));
  // steering wheel rim (tilted toward the driver) + column
  const w = DRIVER.wheel;
  const ring: [number, number, number, number][] = [];
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    ring.push([Math.cos(a) * w.radius, Math.sin(a) * w.radius, 0, 0.018]);
  }
  add(Mat.Rubber, transformMesh(tubeSweepMesh(ring, 8), { pos: [...w.centre] as [number, number, number], rot: [-0.45, 0, 0] }));
  add(Mat.Rubber, limb(w.centre, [w.centre[0], w.centre[1] - 0.06, w.centre[2] + 0.22], 0.025, 0.03));
  // glass-roof frame: a rubber gasket loop around the opening (hides the cut edge of the Idol roof)
  const g = GLASS_ROOF;
  const loop: [number, number, number, number][] = [
    [-g.halfX, g.y, g.zMax, g.frameRadius], [g.halfX, g.y, g.zMax, g.frameRadius], [g.halfX, g.y, g.zMin, g.frameRadius], [-g.halfX, g.y, g.zMin, g.frameRadius], [-g.halfX, g.y, g.zMax, g.frameRadius]
  ];
  for (let k = 0; k < 4; k++) add(Mat.Rubber, limb(loop[k]!.slice(0, 3) as unknown as V3, loop[k + 1]!.slice(0, 3) as unknown as V3, g.frameRadius, g.frameRadius));
  for (const p of loop.slice(0, 4)) add(Mat.Rubber, ball(g.frameRadius, p.slice(0, 3) as unknown as V3));
  // the smaller strapped parcel at the back of the rack
  const r = ROOF_PARCEL;
  const pz = (r.zMin + r.zMax) / 2;
  add(Mat.Parcel, soft([2 * r.halfX, r.height, r.zMax - r.zMin], [0, r.baseY + r.height / 2, pz]));
  for (const dz of [-0.09, 0.09]) add(Mat.Strap, box([2 * r.halfX + 0.03, r.height + 0.02, 0.035], [0, r.baseY + r.height / 2, pz + dz], 0.008));
  return slots;
}

/** Opaque cabin node + the transparent glass roof node, both lifted with the body. */
export function courierCabinNodes(id: string, lift: number, castShadow: boolean) {
  const spec = memoizeGeometry("drift:courier-cabin", () => buildGroupedGeometrySpec(courierCabinSlots()));
  const cabin = geometry.multiMaterial(spec, cabinMaterials(), { name: `${id}-cabin`, position: [0, lift, 0], castShadow, receiveShadow: true });
  const g = GLASS_ROOF;
  const glassSpec = memoizeGeometry("drift:courier-glass-roof", () => buildGroupedGeometrySpec([{ materialIndex: 0, mesh: box([2 * g.halfX, 0.012, g.zMax - g.zMin], [0, g.y, (g.zMin + g.zMax) / 2], 0.004) }]));
  const glass = geometry.multiMaterial(
    glassSpec,
    [material.physical({ color: "#1e3442", roughness: 0.05, opacity: 0.32, alphaMode: "blend", clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.5, envMapIntensity: 0.55 })],
    { name: `${id}-glass-roof`, position: [0, lift, 0], castShadow: false, receiveShadow: false }
  );
  return [cabin, glass];
}
