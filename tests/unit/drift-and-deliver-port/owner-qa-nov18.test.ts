import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it } from "vitest";
import type { RawMesh } from "@aura3d/engine/sculpt";
import {
  HERO_WHEEL_GEOMETRY_RADIUS,
  IDOL_WHEEL_LAYOUT,
  WHEEL_SPIN_SHOWN_MAX,
  WHEEL_SPIN_STEP_MAX,
  advanceShownSpin,
  createTrafficWheelRig,
  shownSpinStep,
  stepTrafficWheels,
  unitWheelMeshes
} from "../../../examples/drift-and-deliver-port/wheels";
import { buildHeroCourierWheelSlots } from "../../../examples/drift-and-deliver-port/art/proceduralModels";
import { CABIN_TUB, COURIER_GLASS_ROOF, COURIER_ROOF_OPENING, DRIVER, GLASS_ROOF, ROOF_PARCEL, courierCabinSlots } from "../../../examples/drift-and-deliver-port/courierCabin";
import { idolCourierNode, idolPropNodes } from "../../../examples/drift-and-deliver-port/idol";
import { FADE, createOccluderFader, sightlineHits, takeFadeLayers, type FadeLayer } from "../../../examples/drift-and-deliver-port/occluderFade";
import { lampOccluderVolumes } from "../../../examples/drift-and-deliver-port/art/proceduralModels";
import { buildFurniture } from "../../../examples/drift-and-deliver-port/city";
import { planProps, propNodes } from "../../../examples/drift-and-deliver-port/props";
import { buildBlocks, buildBuildings } from "../../../examples/drift-and-deliver-port/world";
import { SIDE_SHOT, sideShotFraming, sideShotPose, sideShotWidthShare } from "../../../examples/drift-and-deliver-port/cinema";

const root = resolve(__dirname, "../../..");
const ex = (p: string) => resolve(root, "examples/drift-and-deliver-port", p);

/** Axis-aligned bounds centre of `mesh` after spinning it by `angle` about the axle (`axis` 0 = X, 2 = Z) and scaling. */
function spunCentre(mesh: RawMesh, axis: 0 | 2, angle: number, scale: number): [number, number, number] {
  const c = Math.cos(angle), s = Math.sin(angle);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    let x = mesh.positions[i]!, y = mesh.positions[i + 1]!, z = mesh.positions[i + 2]!;
    if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
    else [x, y] = [x * c - y * s, x * s + y * c];
    const p = [x * scale, y * scale, z * scale];
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k]!, p[k]!);
      mx[k] = Math.max(mx[k]!, p[k]!);
    }
  }
  return [(mn[0]! + mx[0]!) / 2, (mn[1]! + mx[1]!) / 2, (mn[2]! + mx[2]!) / 2];
}

const joinPositions = (meshes: readonly RawMesh[]): RawMesh => ({ positions: meshes.flatMap((m) => m.positions), normals: [], uvs: [], indices: [] });

describe("Gridlock Courier owner QA (Nov 18): wheels pivot on their hubs, spin capped, tyres always drawn", () => {
  it("a full revolution moves each wheel's bounds centre at most 2 mm relative to the car (courier + every traffic body)", () => {
    const heroScale = IDOL_WHEEL_LAYOUT.gcCourier.radius / HERO_WHEEL_GEOMETRY_RADIUS;
    const wheels: { mesh: RawMesh; axis: 0 | 2; scale: number; label: string }[] = [
      ...([-1, 1] as const).map((side) => ({ mesh: joinPositions(buildHeroCourierWheelSlots(side).map((s) => s.mesh)), axis: 0 as const, scale: heroScale, label: `courier ${side}` })),
      ...Object.entries(IDOL_WHEEL_LAYOUT).map(([key, l]) => ({ mesh: joinPositions([unitWheelMeshes().tyre, unitWheelMeshes().rim]), axis: 2 as const, scale: l.radius, label: key }))
    ];
    for (const w of wheels) {
      const c0 = spunCentre(w.mesh, w.axis, 0, w.scale);
      for (let k = 1; k <= 24; k++) {
        const c = spunCentre(w.mesh, w.axis, (k / 24) * Math.PI * 2, w.scale);
        expect(Math.hypot(c[0] - c0[0], c[1] - c0[1], c[2] - c0[2]), `${w.label} at ${k}/24`).toBeLessThanOrEqual(0.002);
      }
      // and the hub is the origin the node is placed at (the pivot), not the tyre bottom
      expect(Math.hypot(c0[1], w.axis === 0 ? c0[2] : c0[0]), w.label).toBeLessThanOrEqual(0.002);
    }
  });

  it("caps the drawn spin (no strobing spokes) and rolls exactly below the cap", () => {
    const r = IDOL_WHEEL_LAYOUT.gcCourier.radius;
    // 4 m/s at 60 fps: under the cap, rolling without slip
    expect(shownSpinStep(4 / 60, r, 1 / 60)).toBeCloseTo(4 / 60 / r, 9);
    for (const speed of [20, 40, 70]) {
      for (const dt of [1 / 120, 1 / 60, 1 / 30]) {
        const step = shownSpinStep(speed * dt, r, dt);
        expect(step).toBeGreaterThan(0);
        expect(step).toBeLessThanOrEqual(WHEEL_SPIN_STEP_MAX + 1e-12);
        expect(step / dt).toBeLessThanOrEqual(WHEEL_SPIN_SHOWN_MAX + 1e-9);
      }
    }
    expect(shownSpinStep(-30 / 60, r, 1 / 60)).toBeLessThan(0);
    expect(advanceShownSpin(6.2, 30 / 60, r, 1 / 60)).toBeLessThan(Math.PI * 2);
    // traffic: 0.25 m a frame (15 m/s) is drawn at the cap
    const rig = createTrafficWheelRig(["gcTaxi"]);
    stepTrafficWheels(rig, [0, 0, 0], 1 / 60);
    stepTrafficWheels(rig, [0, 0.25, 0], 1 / 60);
    expect(rig.spin[0]).toBeCloseTo(WHEEL_SPIN_SHOWN_MAX / 60, 9);
  });

  it("never swaps the tyre for a blur disc: the real tyre and rim draws are the only wheel draws", () => {
    for (const f of ["wheels.ts", "main.ts", "idol.ts"]) expect(readFileSync(ex(f), "utf8")).not.toMatch(/blur(Disc|Rate|_DISC|-disc)/i);
    const main = readFileSync(ex("main.ts"), "utf8");
    expect(main).toMatch(/advanceShownSpin\(wheelSpin, view\.speed \* dt/);
    expect(main).toMatch(/stepTrafficWheels\(look\.trafficWheels, shown, dt\)/);
  });
});

describe("Gridlock Courier owner QA (Nov 18): the driver reads from the bird's-eye chase", () => {
  it("the derived glass-roof body has no roof skin or parcel left inside the opening and keeps the rest of the body", async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const src = await io.read(ex("assets/idol/gcCourier.glb"));
    const out = await io.read(ex("assets/idol/gcCourierGlassRoof.glb"));
    const tris = (doc: typeof src) => doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    const prim = tris(out);
    const pos = prim.getAttribute("POSITION")!;
    const idx = prim.getIndices()!.getArray()!;
    const v = [0, 0, 0];
    const o = COURIER_ROOF_OPENING;
    let maxY = 0;
    for (let t = 0; t < idx.length; t += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) {
        pos.getElement(idx[t + k]!, v);
        cx += v[0]! / 3; cy += v[1]! / 3; cz += v[2]! / 3;
        maxY = Math.max(maxY, v[1]!);
      }
      const inside = Math.abs(cx - o.centreX) < o.halfX && cz > o.zMin && cz < o.zMax && cy > o.yAbove;
      expect(inside).toBe(false);
    }
    // the 2.04 m parcel is gone (rack rails and clamps top out near 1.70 m); most of the body is kept
    expect(maxY).toBeLessThan(1.72);
    expect(idx.length / 3).toBeGreaterThan(0.6 * tris(src).getIndices()!.getCount() / 3);
    expect(tris(out).getMaterial()?.getBaseColorTexture()).toBeTruthy();
    // the runtime asset ref carries this exact file's hash and a same-origin path (the production bridge rejects remote URLs)
    const bytes = readFileSync(ex("assets/idol/gcCourierGlassRoof.glb"));
    expect(COURIER_GLASS_ROOF.hash).toBe(`sha256-${createHash("sha256").update(bytes).digest("hex")}`);
    expect(COURIER_GLASS_ROOF.sizeBytes).toBe(bytes.length);
    expect(COURIER_GLASS_ROOF.url).not.toMatch(/^https?:/);
  });

  it("puts the seated driver under the glass inside the opening, clear of the smaller parcel from the chase eye", () => {
    const o = COURIER_ROOF_OPENING;
    const [hx, hy, hz] = DRIVER.head;
    expect(Math.abs(hx - o.centreX) + DRIVER.headRadius).toBeLessThan(o.halfX);
    expect(hz).toBeGreaterThan(o.zMin);
    expect(hz).toBeLessThan(o.zMax);
    expect(DRIVER.capTop).toBeLessThan(GLASS_ROOF.y);
    expect(hy).toBeGreaterThan(CABIN_TUB.floorY + 0.5);
    // the glass covers the opening; the tub fits inside the body (half-width 0.61 m at 1.4 m) under the glass
    expect(GLASS_ROOF.halfX).toBeGreaterThan(o.halfX);
    expect(GLASS_ROOF.zMin).toBeLessThan(o.zMin);
    expect(GLASS_ROOF.zMax).toBeGreaterThan(o.zMax);
    expect(CABIN_TUB.halfX).toBeLessThan(0.58);
    expect(CABIN_TUB.topY).toBeLessThan(GLASS_ROOF.y);
    // parcel: at the back, a fraction of the old 0.86 x 1.3 x 0.45 m box
    const vol = 2 * ROOF_PARCEL.halfX * (ROOF_PARCEL.zMax - ROOF_PARCEL.zMin) * ROOF_PARCEL.height;
    expect(vol).toBeLessThan(0.25 * 0.86 * 1.3 * 0.45);
    expect(ROOF_PARCEL.zMax).toBeLessThan(hz - 0.5);
    // the bird's-eye chase (15 m up, 16 m back) sees the cap top over the parcel
    const slope = 15 / 16;
    const rise = (hz - ROOF_PARCEL.zMax) * slope;
    expect(DRIVER.capTop + rise).toBeGreaterThan(ROOF_PARCEL.baseY + ROOF_PARCEL.height + 0.1);
    // both hands are on the steering wheel rim
    for (const h of DRIVER.hands) {
      const d = Math.hypot(h[0] - DRIVER.wheel.centre[0], h[1] - DRIVER.wheel.centre[1], h[2] - DRIVER.wheel.centre[2]);
      expect(Math.abs(d - DRIVER.wheel.radius)).toBeLessThan(0.05);
    }
    expect(courierCabinSlots().length).toBeGreaterThan(20);
  });

  it("mounts the glass-roof body, the cabin and the glass in the car-rig group", () => {
    const json = idolCourierNode("car-rig", true, "YXZ").toJSON() as { children: { kind: string; name?: string; asset?: { url?: string } }[] };
    const names = json.children.map((c) => c.name);
    expect(names).toContain("car-rig-idol");
    expect(names).toContain("car-rig-cabin");
    expect(names).toContain("car-rig-glass-roof");
  });
});

describe("Gridlock Courier owner QA (Nov 18): occluders between the camera and the courier fade", () => {
  const eye = [0, 15, -16] as const;
  const car = [0, 1, 0] as const;

  it("hits a lamp head or a tree crown on the sightline and ignores props beside it or beside the car", () => {
    // halfway back the sightline is ~8 m up: a 9 m palm crown there occludes, a 5 m lamp does not
    expect(sightlineHits(eye, car, { x: 0, z: -8, r: 2, yMin: 4, yMax: 9 })).toBe(true);
    expect(sightlineHits(eye, car, { x: 0, z: -8, r: 0.3, yMin: 0, yMax: 5 })).toBe(false);
    // 3 m behind the car the sightline is ~3.8 m up: a 5 m lamp there occludes
    expect(sightlineHits(eye, car, { x: 0.2, z: -3, r: 0.3, yMin: 0, yMax: 5 })).toBe(true);
    // off to the side (6 m) nothing
    expect(sightlineHits(eye, car, { x: 6, z: -3, r: 1, yMin: 0, yMax: 9 })).toBe(false);
    // right next to the car (inside the last metres) is not "in front"
    expect(sightlineHits(eye, car, { x: 0, z: -0.5, r: 0.3, yMin: 0, yMax: 5 })).toBe(false);
  });

  it("eases an occluding instance into the ghost draws and back after the hold, writing only changed draws", () => {
    const transforms = [
      { position: [0.2, 0, -3] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1 },
      { position: [6, 0, -3] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1 }
    ];
    const layer: FadeLayer = { opaqueIds: ["mast", "globe"], ghostIds: ["g0", "g1"], transforms, volumes: transforms.map((t) => [{ x: t.position[0], z: t.position[2], r: 0.3, yMin: 0, yMax: 5 }]) };
    const fader = createOccluderFader([layer]);
    const writes: Record<string, { position?: readonly number[] }[]> = {};
    const write = (id: string, list: readonly { position?: readonly number[] }[]) => (writes[id] = [...list]);
    fader.update(1 / 60, eye, car, write);
    expect(fader.faded()).toEqual([[0]]);
    expect(writes.mast![0]!.position![1]).toBe(FADE.parkedY);
    expect(writes.mast![1]!.position![1]).toBe(0);
    expect(writes.g0!.length).toBe(1);
    for (let f = 0; f < 10; f++) fader.update(1 / 60, eye, car, write);
    expect(writes.g1![0]!.position).toEqual(transforms[0]!.position);
    expect(writes.g0![0]!.position![1]).toBe(FADE.parkedY);
    // the car drives on: the sightline clears, the lamp returns only after the hold
    const away = [0, 1, 30] as const;
    const eye2 = [0, 15, 14] as const;
    for (let f = 0; f < 10; f++) fader.update(1 / 60, eye2, away, write);
    expect(fader.faded()).toEqual([[0]]);
    for (let f = 0; f < 60; f++) fader.update(1 / 60, eye2, away, write);
    expect(fader.faded()).toEqual([[]]);
    expect(writes.mast![0]!.position![1]).toBe(0);
    expect(writes.globe![0]!.position![1]).toBe(0);
  });

  it("registers the Idol trees and palms and the lamp masts, collars and globes with ghost draws", () => {
    takeFadeLayers();
    const blocks = buildBlocks();
    const buildings = buildBuildings(blocks);
    const furniture = buildFurniture(blocks);
    const plan = planProps(furniture, blocks, buildings, { x: 0, z: 0 });
    const nodes = propNodes(plan, false, true, false).map((n) => (n.toJSON() as { name?: string }).name);
    const layers = takeFadeLayers();
    const ids = layers.flatMap((l) => [...l.opaqueIds, ...l.ghostIds]);
    for (const id of ["model-tree-idol", "model-palm-idol", "model-lamp-masts", "model-lamp-collars", "model-lamp-globes", "model-tree-ghost-0", "model-palm-ghost-1", "model-lamp-ghost-1"]) expect(ids, id).toContain(id);
    for (const id of ids) expect(nodes, id).toContain(id);
    for (const l of layers) expect(l.volumes.length).toBe(l.transforms.length);
    // a lamp's head volume sits over its arm, 4.2-5 m up
    const head = lampOccluderVolumes({ position: [10, 0, 0], rotation: [0, 0, 0], scale: 1 })[1]!;
    expect(head.x).toBeGreaterThan(10.5);
    expect(head.yMin).toBeGreaterThan(4);
    // idol tree crowns: a wide upper volume
    const tree = idolPropNodes("tree", [{ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }], false);
    expect(tree?.length).toBe(1 + FADE.opacities.length);
    takeFadeLayers();
  });
});

describe("Gridlock Courier owner QA (Nov 18): the first-delivery side shot frames the car on a portrait phone", () => {
  const car = { x: 0, z: 0, heading: 0 };
  it("backs off and widens on 390 x 844 so the car spans at most ~62% of the width; 16:9 keeps 7 m", () => {
    const wide = sideShotFraming(16 / 9);
    expect(wide.distance).toBeCloseTo(SIDE_SHOT.side, 9);
    expect(wide.fov).toBe(SIDE_SHOT.fov);
    for (const aspect of [390 / 844, 375 / 812, 430 / 932, 3 / 4]) {
      const f = sideShotFraming(aspect);
      const share = sideShotWidthShare(aspect, f.distance, f.fov);
      expect(share, `aspect ${aspect}`).toBeLessThanOrEqual(SIDE_SHOT.maxWidthShare + 1e-9);
      expect(share).toBeGreaterThan(0.3);
      const pose = sideShotPose(0, car, () => false, aspect)!;
      expect(Math.abs(pose.position[0])).toBeCloseTo(f.distance, 6);
      expect(pose.fov).toBe(f.fov);
    }
    // the old fixed 7 m / 52 degree shot overflowed the portrait frame
    expect(sideShotWidthShare(390 / 844, 7, 52)).toBeGreaterThan(1.2);
  });

  it("steps in and up when the far eye would sit inside a facade, and still gives up when every eye is blocked", () => {
    const aspect = 390 / 844;
    const f = sideShotFraming(aspect);
    const pose = sideShotPose(0, car, (x) => Math.abs(x) > f.distance * 0.9, aspect)!;
    expect(Math.abs(pose.position[0])).toBeLessThan(f.distance * 0.9);
    expect(pose.position[1]).toBeGreaterThan(f.height);
    expect(sideShotPose(0, car, () => true, aspect)).toBeNull();
  });
});
