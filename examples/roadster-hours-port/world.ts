/**
 * Roadster Hours world on the public `@aura3d/engine` surface only: the road ribbon, kickers and roofline
 * shortcuts (`geometry.dynamic` + `material.custom`), relay gates, data cells, hazards and water, the Roadster,
 * and every traffic and lineup vehicle in ONE `batched.mesh` (one pooled geometry set, one instance per collision
 * box, per-instance colour/matrix writes each frame). The original's GLB vehicles and sky are recreated procedurally.
 */
import { batched, camera, geometry, lights, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import { levelLayout, roadProfile, trafficPiece, pieceSpec, type Level } from "./course";
import { LEVELS } from "./data";
import { roadSpec, solidSpec, waterSpec, type FogLook, type Rgb } from "./materials";
import type { Run } from "./sim";

type Scene = ReturnType<typeof scene>;
type Vec3 = [number, number, number];

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);
const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const hexLinear = (hex: number): Rgb => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
const hexString = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;

/** World position of road point (s, lateral l) at height `h` above the surface (the game's `dd`). */
export function roadPoint(level: Level, s: number, l: number, h = 0): Vec3 {
  const p = roadProfile(level, s);
  const a = Math.sqrt(1 + p.dx * p.dx);
  return [p.x + (l * Math.cos(p.bank)) / a, p.y + l * Math.sin(p.bank) + h, p.z + (l * Math.cos(p.bank) * p.dx) / a];
}

interface MeshData { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }

function strip(
  level: Level, s0: number, s1: number, step: number, laterals: readonly number[],
  height: (s: number, l: number) => number, solid: (sMid: number) => boolean, uvScale: number
): MeshData {
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const bank = roadProfile(level, s).bank;
    for (const l of laterals) {
      m.positions.push(...roadPoint(level, s, l, height(s, l)));
      m.normals.push(-Math.sin(bank), Math.cos(bank), 0);
      m.uvs.push(l / uvScale, s);
    }
  }
  const cols = laterals.length;
  for (let i = 0; i < n; i++) {
    const mid = s0 + ((s1 - s0) * (i + 0.5)) / n;
    if (!solid(mid)) continue;
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c, b = a + 1, d = a + cols, e = d + 1;
      m.indices.push(a, d, b, b, d, e);
    }
  }
  return m;
}

const dyn = (m: MeshData) => geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });

const inGap = (level: Level, s: number): boolean => level.gaps.some(([a, b]) => s > a && s < b);

export function fogFor(level: Level): FogLook {
  return { fogColor: hexLinear(level.fog), fogNear: 160, fogFar: level.id === "halo" ? 900 : 1600 };
}

/** Piece colour palette (sRGB hex) per piece family; batched instances carry their own colour. */
const PIECE_COLOURS: Record<string, string> = {
  sedan: "#d8dde6", hatch: "#e3b34a", suv: "#4a6b8a", pickup: "#b04a3c", box_truck: "#e8e8e8", bus: "#e6b020",
  semi_tractor: "#2f3e55", tanker: "#c9ced6", semi: "#b9c0cc", car_carrier: "#7d8896"
};

export interface WorldRuntime {
  update(run: Run, dt: number, time: number, aspect: number): void;
  reset(run: Run): void;
  batching(): Record<string, unknown> | null;
  /** Draw calls with every vehicle hidden vs shown: the delta is what the single `batched.mesh` costs. */
  probeBatchedDraws(): { hidden: number; visible: number; delta: number; instances: number; geometries: number; features: readonly string[] };
  readonly vehicleInstances: number;
}

export interface World { readonly scene: Scene; readonly level: Level; readonly vehicleSlots: number; readonly vehicleGeometries: number; bind(app: AuraApp): WorldRuntime }

function matrixFor(psi: number, centre: Vec3, size: Vec3): Float32Array {
  const c = Math.cos(psi), s = Math.sin(psi);
  return Float32Array.from([c * size[0], 0, -s * size[0], 0, 0, size[1], 0, 0, s * size[2], 0, c * size[2], 0, centre[0], centre[1], centre[2], 1]);
}

export function buildWorld(levelIndex: number): World {
  const level = LEVELS[levelIndex]!;
  const fog = fogFor(level);
  const builder: Scene = scene()
    .background(hexString(level.fog))
    .camera(camera.perspective({ position: roadPoint(level, 0, 0, 6), target: roadPoint(level, 40, 0, 2), fov: 60, near: 0.2, far: 3200 }))
    .add(lights.studio({ intensity: 1.15 }));

  const width = level.width;
  const laterals = [-width, -width * 0.75, -width * 0.5, -width * 0.25, 0, width * 0.25, width * 0.5, width * 0.75, width];
  const asphalt: Rgb = level.id === "halo" ? [0.03, 0.04, 0.07] : level.id === "redline" ? [0.1, 0.07, 0.06] : [0.08, 0.09, 0.1];
  const glow = hexLinear(level.sun);

  /* ---- road, kickers, roofline shortcuts ---- */
  const road = strip(level, 0, level.length + 80, 3, laterals, () => 0, (mid) => !inGap(level, mid), width);
  builder.add(geometry.custom(dyn(road), { name: "road", material: material.custom(roadSpec(asphalt, [0.92, 0.9, 0.82], glow, fog)) }));
  level.lineups.forEach((lineup, i) => {
    const k = lineup.kicker;
    const wedge = strip(level, k.s, k.s + k.len, 1.5, [-k.w, -k.w / 2, 0, k.w / 2, k.w], (s) => {
      const t = (s - k.s) / k.len;
      return k.h * t * t;
    }, () => true, k.w);
    builder.add(geometry.custom(dyn(wedge), { name: `kicker-${i}`, material: material.custom(solidSpec(hexLinear(0xd9a441), glow, 0.35, fog)) }));
  });
  level.shortcuts.forEach((sc, i) => {
    const deck = strip(level, sc.start, sc.end, 4, [sc.l - 5.5, sc.l, sc.l + 5.5], () => sc.height, () => true, 5.5);
    builder.add(geometry.custom(dyn(deck), { name: `shortcut-${i}`, material: material.custom(solidSpec(hexLinear(0x2b3445), glow, 0.25, fog)) }));
  });

  /* ---- water / ground ---- */
  const mid = roadPoint(level, level.length / 2, 0, 0);
  builder.add(primitives.plane({
    name: "water", position: [mid[0], 0, mid[2]], size: 7000,
    material: material.custom(waterSpec(hexLinear(level.water), fog))
  }));

  /* ---- relay gates, data cells, hazards ---- */
  const gateMat = () => material.custom(solidSpec(hexLinear(0x2ad6ff), hexLinear(0x2ad6ff), 1.6, fog));
  level.gates.forEach((g, i) => {
    const psi = -roadProfile(level, g.s).heading;
    const base = roadPoint(level, g.s, 0, 0);
    for (const side of [-1, 1]) {
      const p = roadPoint(level, g.s, side * (width - 0.4), 6);
      builder.add(primitives.box({ name: `gate-post-${i}-${side}`, position: p, rotation: [0, psi, 0], size: [0.7, 12, 0.7], material: gateMat() }));
    }
    builder.add(primitives.box({ name: `gate-bar-${i}`, position: [base[0], base[1] + 12, base[2]], rotation: [0, psi, 0], size: [width * 2, 0.6, 0.6], material: gateMat() }));
  });
  level.cells.forEach((c, i) => {
    const p = roadPoint(level, c.s, c.l, c.h);
    builder.add(primitives.sphere({ name: `cell-${i}`, position: p, size: 1.7, material: material.custom(solidSpec(hexLinear(0xffb347), hexLinear(0xffa31a), 1.8, fog)) }).runtime({ id: `cell-${i}` }));
  });
  level.hazards.forEach((h, i) => {
    const tall = h.type === "vent";
    builder.add(primitives.cylinder({
      name: `hazard-${i}`, position: roadPoint(level, h.s, h.l, tall ? 2.5 : 0.8), size: [h.r * 2, tall ? 5 : 1.6, h.r * 2],
      material: material.custom(solidSpec(hexLinear(tall ? 0x6fe4e6 : 0xe34a3a), hexLinear(tall ? 0x6fe4e6 : 0xe34a3a), tall ? 0.8 : 0.4, fog))
    }));
  });

  /* ---- vehicles: every traffic car + lineup vehicle in one batched mesh ---- */
  const layout = levelLayout(level);
  const slotsPerBox = layout.vehicles.reduce((n, v) => n + v.boxes.length, 0) + level.traffic.reduce((n, t) => n + trafficPiece(t.piece, t.v || 0).boxes.length, 0);
  const vehicles = batched.mesh({
    name: "vehicles", maxInstances: Math.max(8, slotsPerBox + 8), maxVertices: 4096, maxIndices: 8192,
    material: material.pbr({ color: "#ffffff", roughness: 0.55, metallic: 0.12 })
  });
  const geoBox = vehicles.addGeometry("box");
  const geoRound = vehicles.addGeometry("roundedBox");
  const geometryFor = (piece: string): number => (piece === "sedan" || piece === "hatch" || piece === "suv" || piece === "pickup" ? geoRound : geoBox);
  builder.add(vehicles);

  const lineupSlots: { slot: number; box: number; vehicle: number }[] = [];
  layout.vehicles.forEach((v, vi) => {
    const spec = pieceSpec(v.piece, v.v)!;
    spec.boxes.forEach((b, bi) => {
      const slot = vehicles.addInstance(geometryFor(v.piece));
      vehicles.setColorAt(slot, PIECE_COLOURS[v.piece] ?? "#cccccc");
      lineupSlots.push({ slot, box: bi, vehicle: vi });
    });
  });
  const trafficSlots: { slot: number; box: number; car: number }[] = [];
  level.traffic.forEach((t, ci) => {
    const info = trafficPiece(t.piece, t.v || 0);
    info.boxes.forEach((_b, bi) => {
      const slot = vehicles.addInstance(geometryFor(t.piece));
      vehicles.setColorAt(slot, PIECE_COLOURS[t.piece] ?? "#cccccc");
      trafficSlots.push({ slot, box: bi, car: ci });
    });
  });

  /* ---- the Roadster ---- */
  const carPaint = hexLinear(0xe31937);
  const carMat = () => material.custom(solidSpec(carPaint, hexLinear(0xff4a3c), 0.15, fog));
  builder.add(primitives.box({ name: "car-body", size: [1.84, 0.5, 4.5], material: carMat() }).runtime({ id: "car-body" }));
  builder.add(primitives.box({ name: "car-cabin", size: [1.5, 0.45, 2.1], material: material.custom(solidSpec(hexLinear(0x1b2330), hexLinear(0x6fe4e6), 0.25, fog)) }).runtime({ id: "car-cabin" }));
  builder.add(primitives.box({ name: "car-glow", size: [1.6, 0.08, 0.5], material: material.custom(solidSpec(hexLinear(0xff3b30), hexLinear(0xff3b30), 2, fog)) }).runtime({ id: "car-glow" }));

  return {
    scene: builder,
    level,
    vehicleSlots: lineupSlots.length + trafficSlots.length,
    vehicleGeometries: 2,
    bind(app: AuraApp): WorldRuntime {
      const camCtl = app.camera;
      if (!camCtl) throw new Error("roadster-hours-port: the app exposes no camera controller");
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => { let h = handles.get(id); if (!h) handles.set(id, h = app.nodes.require(id)); return h; };
      const body = node("car-body"), cabin = node("car-cabin"), glowStrip = node("car-glow");
      const cells = level.cells.map((_c, i) => node(`cell-${i}`));
      const slope = (s: number): number => Math.sqrt(1 + roadProfile(level, s).dx ** 2);

      const writeVehicle = (slot: number, b: { min: readonly number[]; max: readonly number[] }, s: number, l: number, yaw: number): void => {
        const cx = (b.min[0]! + b.max[0]!) / 2, cy = (b.min[1]! + b.max[1]!) / 2, cz = (b.min[2]! + b.max[2]!) / 2;
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        const lat = cx * c + cz * sn;
        const lon = (cx * sn - cz * c) / slope(s);
        const heading = roadProfile(level, s + lon).heading;
        const centre = roadPoint(level, s + lon, l + lat, cy);
        vehicles.setMatrixAt(slot, matrixFor(yaw - heading, centre, [b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!, b.max[2]! - b.min[2]!]));
      };
      const placeLineup = (): void => {
        for (const entry of lineupSlots) {
          const v = layout.vehicles[entry.vehicle]!;
          writeVehicle(entry.slot, pieceSpec(v.piece, v.v)!.boxes[entry.box]!, v.s, v.l, v.yaw);
        }
      };
      placeLineup();

      const offCentre = 0;
      return {
        vehicleInstances: lineupSlots.length + trafficSlots.length,
        reset: () => { placeLineup(); },
        probeBatchedDraws() {
          const slots = [...lineupSlots, ...trafficSlots].map((e) => e.slot);
          const draws = (): number => { app.step(0); return app.diagnostics().drawCalls ?? 0; };
          for (const slot of slots) vehicles.setVisibleAt(slot, false);
          const hidden = draws();
          for (const slot of slots) vehicles.setVisibleAt(slot, true);
          const visible = draws();
          const features = (app.diagnostics() as unknown as { compiledFeatures?: readonly string[] }).compiledFeatures ?? [];
          return { hidden, visible, delta: visible - hidden, instances: slots.length, geometries: 2, features: features.map(String) };
        },
        batching: () => ((app.diagnostics() as unknown as Record<string, unknown>)["renderer.batching"] as Record<string, unknown> | undefined) ?? null,
        update(run: Run, dt: number, time: number, aspect: number): void {
          const prof = roadProfile(level, run.s);
          const psi = -(prof.heading + run.theta) + run.spin;
          const pitch = run.flip;
          const carP = roadPoint(level, run.s, run.l, run.h + 0.55);
          const rollAngle = run.roll + prof.bank;
          body.setPosition(carP[0], carP[1], carP[2]);
          body.setRotation(pitch, psi, rollAngle);
          cabin.setPosition(carP[0], carP[1] + 0.45, carP[2]);
          cabin.setRotation(pitch, psi, rollAngle);
          glowStrip.setPosition(carP[0], carP[1] + 0.3, carP[2]);
          glowStrip.setRotation(pitch, psi, rollAngle);
          glowStrip.setVisible(run.boosting || run.nitro > 0 || run.overheated);
          level.cells.forEach((_c, i) => cells[i]!.setVisible(!run.cells.has(i)));
          for (const entry of trafficSlots) {
            const car = run.traffic[entry.car]!;
            writeVehicle(entry.slot, pieceSpec(car.piece, car.v)!.boxes[entry.box]!, car.s, car.l, 0);
          }
          // chase camera
          const back = 8.5 + (run.v / 74) * 1.6;
          const eyeS = run.s - back;
          const eyeL = run.l * 0.8 + offCentre;
          const eye = roadPoint(level, eyeS, eyeL, run.h + 3.1 + (run.grounded ? 0 : Math.min(2.5, run.h * 0.05)));
          const look = roadPoint(level, run.s + 12 + (run.v / 74) * 5, run.l * 0.9, run.h + 1.1);
          void dt; void time;
          camCtl.setPose({ position: [eye[0], eye[1], eye[2]], target: [look[0], look[1], look[2]], up: [0, 1, 0], fov: (aspect < 1 ? 70 : 58) + (run.v / 74) * 8 }, { cut: false });
        }
      };
    }
  };
}
