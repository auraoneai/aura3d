/**
 * Strange Orbit world on the public `@aura3d/engine` surface only: the painted
 * track ribbon (`geometry.dynamic` + author attributes + `material.custom`), opal
 * islands, ramps, loops, checkpoint veils, crystals, meteors, stardust and star
 * points (`topology: "points"`), six riders and the chase camera. Visual assets
 * the original fetched as remote GLB/PNG files are re-created procedurally.
 */
import { camera, geometry, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import {
  COURSE_LENGTH,
  GATES,
  RESONANCE_GATES,
  RIDERS,
  SKATE_LOOPS,
  collectibles,
  groundHeight,
  islandHeight,
  meteorLane,
  rampHeightAt,
  trackLane,
  type Route,
  type Vehicle
} from "./course";
import { buildCourse, buildIslands, buildLoops, buildRamps, veilQuad, type MeshData } from "./meshes";
import { axisRotation, basisMatrix, matrixToEulerZYX, multiplyMat3, type Mat3 } from "./orient";
import { hexLinear } from "./palette";
import { loopFrame, type RaceState } from "./race";
import { mineralSpec, pointsSpec, solidSpec, trackSpec, veilSpec, type SolidExtra } from "./materials";
import { mainFrame, routeFrame, surfaceNoise } from "./track";
import { Vec3 } from "./vec3";

type Rgb = readonly [number, number, number];
type Scene = ReturnType<typeof scene>;

export interface WorldOptions {
  readonly vehicle: Vehicle;
  readonly rider: number;
  readonly quality: "high" | "low";
}

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function dynamicFrom(m: MeshData, withPigments: boolean) {
  const attributes: Record<string, { itemSize: 1 | 2 | 3 | 4; data: Float32Array }> = {};
  if (withPigments) {
    attributes.pigmentBase = { itemSize: 3, data: f32(m.pigmentBase) };
    attributes.pigmentVein = { itemSize: 3, data: f32(m.pigmentVein) };
    attributes.pigmentChalk = { itemSize: 3, data: f32(m.pigmentChalk) };
    attributes.paintOriginal = { itemSize: 1, data: f32(m.paintOriginal) };
  }
  return geometry.dynamic({
    positions: f32(m.positions),
    normals: f32(m.normals),
    uvs: f32(m.uvs),
    indices: Uint32Array.from(m.indices),
    attributes
  });
}

const trackMaterial = () => material.custom(trackSpec());
const solidMaterial = (base: Rgb, glow: Rgb = [0, 0, 0], glowAmount = 0, banding = 0, extra: SolidExtra = {}) => material.custom(solidSpec(base, glow, glowAmount, banding, extra));
const mineralMaterial = (base: Rgb, opal: boolean) => material.custom(mineralSpec(base, opal));
const pointsMaterial = (additive: boolean) => material.custom(pointsSpec(additive));

/** Deterministic Lehmer generator (same constants the original uses for its star field). */
export function lehmer(seed: number): () => number {
  let s = seed;
  return () => { s = s * 16807 % 2147483647; return s / 2147483647; };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const lin = (c: number): number => (c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(f(0)), lin(f(8)), lin(f(4))];
}

const euler = (m: Mat3): [number, number, number] => [...matrixToEulerZYX(m)];

interface PartSpec {
  readonly id: string;
  readonly offset: readonly [number, number, number];
  /** Local rotation applied after the rider basis. */
  readonly local: Mat3;
}

export const RIVAL_COLORS: readonly (readonly [string, string])[] = [
  ["#6aa8c9", "#efd7a0"], ["#d6a24b", "#4e697b"], ["#8d7bc4", "#f0dcb4"], ["#6fbf8e", "#d86a43"], ["#c96a6a", "#ead8a0"]
];

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

interface Riderrig {
  readonly root: string;
  readonly parts: readonly PartSpec[];
}

function riderRig(index: number, vehicle: Vehicle): Riderrig {
  const root = `rider-${index}`;
  const wheel = multiplyMat3(IDENTITY, axisRotation("x", Math.PI / 2));
  const lean = axisRotation("z", -0.45);
  if (vehicle === "skate") {
    return {
      root,
      parts: [
        { id: `${root}-deck`, offset: [0, 0.14, 0], local: IDENTITY },
        { id: `${root}-torso`, offset: [0, 0.82, 0], local: IDENTITY },
        { id: `${root}-head`, offset: [0.02, 1.32, 0], local: IDENTITY }
      ]
    };
  }
  return {
    root,
    parts: [
      { id: `${root}-frame`, offset: [0, 0.46, 0], local: IDENTITY },
      { id: `${root}-wheelF`, offset: [0.58, 0.34, 0], local: wheel },
      { id: `${root}-wheelR`, offset: [-0.58, 0.34, 0], local: wheel },
      { id: `${root}-torso`, offset: [-0.02, 0.98, 0], local: lean },
      { id: `${root}-head`, offset: [0.16, 1.4, 0], local: IDENTITY }
    ]
  };
}

export interface WorldRuntime {
  update(state: RaceState, dt: number, time: number, view: "chase" | "wide", aspect: number): void;
  resetCamera(): void;
  readonly nodeCount: number;
}

export interface World {
  readonly scene: Scene;
  bind(app: AuraApp): WorldRuntime;
}

export function buildWorld(options: WorldOptions): World {
  const { vehicle, rider } = options;
  const high = options.quality === "high";
  const builder: Scene = scene()
    .background("#12151c")
    .camera(camera.perspective({ position: [0, 40, 0], target: [0, 0, 0], fov: 72, near: 0.15, far: 2400 }));

  /* ---- track, rails, islands, ramps, loops ---- */
  const course = buildCourse(high ? 1.3 : 2.1);
  builder.add(geometry.custom(dynamicFrom(course.track, true), { name: "track", material: trackMaterial() }));
  builder.add(geometry.custom(dynamicFrom(course.rails, false), { name: "rails", material: solidMaterial(hexLinear("#e5e4b9"), hexLinear("#9ebdae"), 0.22) }));
  builder.add(geometry.custom(dynamicFrom(buildIslands(), true), { name: "islands", material: mineralMaterial(hexLinear("#b9c5e1"), true) }));
  builder.add(geometry.custom(dynamicFrom(buildRamps(vehicle), true), { name: "ramps", material: trackMaterial() }));
  if (vehicle === "skate") builder.add(geometry.custom(dynamicFrom(buildLoops(SKATE_LOOPS), true), { name: "loops", material: trackMaterial() }));

  /* ---- planet + stars ---- */
  builder.add(primitives.sphere({
    name: "planet",
    position: [-17, 83, 48],
    rotation: [0.1, 0.4, 1.12],
    size: 300,
    material: solidMaterial(hexLinear("#f9ece3"), hexLinear("#c98a68"), 0, 0.045)
  }));
  const rand = lehmer(77);
  const starCount = high ? 8000 : 3000;
  const starPositions: number[] = [];
  const starTints: number[] = [];
  for (let i = 0; i < starCount; i++) {
    const y = rand() * 2 - 1, a = rand() * Math.PI * 2, r = 1000 + rand() * 700, k = Math.sqrt(1 - y * y);
    const c = hslToRgb(0.09 + rand() * 0.12, 0.12 + rand() * 0.25, 0.35 + rand() * 0.55);
    starPositions.push(r * k * Math.cos(a), r * y, r * k * Math.sin(a));
    starTints.push(...c);
  }
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(starPositions),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(Array.from({ length: starCount }, () => 1.65)) },
      tint: { itemSize: 3, data: f32(starTints) },
      fade: { itemSize: 1, data: f32(Array.from({ length: starCount }, () => 1)) }
    }
  }), { name: "stars", material: pointsMaterial(false) }));

  /* ---- checkpoints: veils + pillars ---- */
  GATES.forEach((gate, i) => {
    builder.add(geometry.custom(dynamicFrom(veilQuad(gate.s), false), {
      name: `gate-veil-${i}`,
      material: material.custom(veilSpec())
    }).runtime({ id: `gate-veil-${i}` }));
    const f = mainFrame(gate.s);
    const rot = euler(basisMatrix(f.tangent, f.up, f.side));
    for (const side of [-1, 1]) {
      const p = f.p.clone().addScaledVector(f.side, side * 11.1).addScaledVector(f.up, 6.4);
      builder.add(primitives.cylinder({
        name: `gate-${i}-pillar-${side}`,
        position: [p.x, p.y, p.z],
        rotation: rot,
        size: [1.1, 13, 1.1],
        material: solidMaterial(hexLinear("#f3ddaf"), hexLinear("#ecb75f"), 1.4)
      }));
    }
  });

  /* ---- crystal resonance clusters ---- */
  RESONANCE_GATES.forEach((gate, i) => {
    const f = mainFrame(gate.s);
    [0, 1, 2].forEach((k) => {
      const lane = gate.lane + (k - 1) * 0.55;
      const p = f.p.clone().addScaledVector(f.side, lane).addScaledVector(f.up, 0.9 + k * 0.15);
      builder.add(primitives.cone({
        name: `crystal-${i}-${k}`,
        position: [p.x, p.y, p.z],
        rotation: euler(multiplyMat3(basisMatrix(f.tangent, f.up, f.side), axisRotation("z", (k - 1) * 0.25))),
        params: { radius: 0.32, height: 1.8 + k * 0.4, radialSegments: 6 },
        material: solidMaterial(hexLinear("#9fd8ff"), hexLinear("#b4a2ff"), 1.1)
      }));
    });
  });

  /* ---- meteors (moon rocks) ---- */
  const meteors = collectibles("painted").filter((c) => c.kind === "meteor");
  meteors.forEach((c) => {
    builder.add(primitives.polyhedron({
      name: `rock-${c.id}`,
      params: { variant: "icosahedron", detail: 1, radius: 0.85 },
      scale: [1, 0.8, 1.1],
      material: solidMaterial(hexLinear("#6b6470"), hexLinear("#2a2630"), 0.05)
    }).runtime({ id: `rock-${c.id}` }));
  });

  /* ---- stardust ---- */
  const dustItems = collectibles("painted").filter((c) => c.kind === "dust");
  const dustBase = dustItems.map((c) => {
    const f = routeFrame(c.s, c.route);
    return f.p.addScaledVector(f.side, c.lane).addScaledVector(f.up, 1 + (islandHeight(c.s, c.route) ?? 0));
  });
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(dustBase.flatMap((p) => [p.x, p.y, p.z])),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(dustItems.map(() => 9)) },
      tint: { itemSize: 3, data: f32(dustItems.flatMap(() => [...hexLinear("#ffd9a0")])) },
      fade: { itemSize: 1, data: f32(dustItems.map(() => 1)) }
    }
  }), { name: "stardust", material: pointsMaterial(true) }).runtime({ id: "stardust" }));

  /* ---- exhaust ---- */
  const EXHAUST = 160;
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(Array.from({ length: EXHAUST * 3 }, () => 0)),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(Array.from({ length: EXHAUST }, () => 0)) },
      tint: { itemSize: 3, data: f32(Array.from({ length: EXHAUST }, () => [...hexLinear("#ffe1a1")]).flat()) },
      fade: { itemSize: 1, data: f32(Array.from({ length: EXHAUST }, () => 0)) }
    }
  }), { name: "exhaust", material: pointsMaterial(true) }).runtime({ id: "exhaust" }));

  /* ---- riders ---- */
  const riders = Array.from({ length: 6 }, (_, i) => riderRig(i, vehicle));
  riders.forEach((rig, i) => {
    const [bodyHex, accentHex] = i === 0 ? [RIDERS[rider]!.color, RIDERS[rider]!.accent] : RIVAL_COLORS[i - 1]!;
    const body = hexLinear(bodyHex), accent = hexLinear(accentHex), skin = hexLinear("#e0b48f"), dark = hexLinear("#2a2f3b");
    for (const part of rig.parts) {
      const kind = part.id.slice(rig.root.length + 1);
      const make = (): ReturnType<typeof primitives.box> => {
        switch (kind) {
          case "frame": return primitives.box({ name: part.id, size: [1.2, 0.09, 0.09], material: solidMaterial(body) });
          case "deck": return primitives.box({ name: part.id, size: [0.95, 0.05, 0.27], material: solidMaterial(accent) });
          case "wheelF":
          case "wheelR": return primitives.cylinder({ name: part.id, size: [0.68, 0.07, 0.68], material: solidMaterial(dark) });
          case "torso": return primitives.capsule({ name: part.id, size: [0.34, 0.89, 0.34], material: solidMaterial(accent) });
          default: return primitives.sphere({ name: part.id, size: 0.3, material: solidMaterial(skin) });
        }
      };
      builder.add(make().runtime({ id: part.id }));
    }
  });

  /* ---- gravity halo ---- */
  builder.add(primitives.ring({
    name: "gravity-halo",
    params: { innerRadius: 1.54, outerRadius: 1.66, thetaSegments: 48 },
    material: solidMaterial(hexLinear("#93ead5"), hexLinear("#93ead5"), 1, 0, { transparent: true, blending: "additive", depthWrite: false })
  }).runtime({ id: "gravity-halo" }));

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      return bindRuntime(app, { vehicle, riders, meteors, dustBase, dustItems, exhaust: EXHAUST });
    }
  };
}

interface BindInput {
  readonly vehicle: Vehicle;
  readonly riders: readonly Riderrig[];
  readonly meteors: ReturnType<typeof collectibles>;
  readonly dustBase: readonly Vec3[];
  readonly dustItems: ReturnType<typeof collectibles>;
  readonly exhaust: number;
}

interface Pose { position: Vec3; forward: Vec3; up: Vec3 }

function bindRuntime(app: AuraApp, input: BindInput): WorldRuntime {
  const maybeCamera = app.camera;
  if (!maybeCamera) throw new Error("strange-orbit-port: the app exposes no camera controller");
  const cameraController: NonNullable<typeof maybeCamera> = maybeCamera;
  const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
  const node = (id: string) => {
    let h = handles.get(id);
    if (!h) handles.set(id, h = app.nodes.require(id));
    return h;
  };
  const gateVeils = GATES.map((_, i) => node(`gate-veil-${i}`));
  const gatePulse = GATES.map(() => 0);
  let rig: { forward: Vec3; up: Vec3 } | null = null;
  const exhaustPos = new Float32Array(input.exhaust * 3);
  const exhaustSize = new Float32Array(input.exhaust);
  const exhaustFade = new Float32Array(input.exhaust);
  const exhaustAge = new Float32Array(input.exhaust).fill(1);
  const exhaustVel = new Float32Array(input.exhaust * 3);
  let exhaustHead = 0;
  let exhaustBudget = 0;
  const rng = lehmer(4242);
  let dustLap = -1;
  const dustSize = new Float32Array(input.dustItems.length);
  let lastSizeKey = "";

  /** Group pose for a rider standing at (`s`, `lane`) on `route`. */
  const poseAt = (s: number, lane: number, route: Route, height: number, heading: number, lean: number): Pose => {
    const f = routeFrame(s, route);
    const noise = surfaceNoise(s, trackLane(s, lane, route));
    const position = f.p.clone().addScaledVector(f.side, lane).addScaledVector(f.up, height + noise);
    const forward = f.tangent.clone().multiplyScalar(Math.cos(heading)).addScaledVector(f.side, Math.sin(heading));
    const up = f.up.clone();
    if (lean) up.applyAxisAngle(forward, -lean);
    return { position, forward, up };
  };

  const placeRider = (index: number, pose: Pose, scale: number, extraPitch = 0, extraRoll = 0): void => {
    const side = new Vec3().crossVectors(pose.forward, pose.up).normalize();
    const up = new Vec3().crossVectors(side, pose.forward).normalize();
    let base = basisMatrix(pose.forward, up, side);
    if (extraPitch) base = multiplyMat3(base, axisRotation("z", extraPitch));
    if (extraRoll) base = multiplyMat3(base, axisRotation("x", extraRoll));
    const rigDef = input.riders[index]!;
    for (const part of rigDef.parts) {
      const [dx, dy, dz] = part.offset;
      const p = pose.position.clone()
        .addScaledVector(pose.forward, dx * scale)
        .addScaledVector(up, dy * scale)
        .addScaledVector(side, dz * scale);
      const e = euler(multiplyMat3(base, part.local));
      const h = node(part.id);
      h.setPosition(p.x, p.y, p.z);
      h.setRotation(e[0], e[1], e[2]);
      h.setScale(scale);
    }
  };

  const hideRider = (index: number): void => {
    for (const part of input.riders[index]!.parts) node(part.id).setVisible(false);
  };
  const showRider = (index: number): void => {
    for (const part of input.riders[index]!.parts) node(part.id).setVisible(true);
  };

  function update(state: RaceState, dt: number, time: number, view: "chase" | "wide", aspect: number): void {
    const menu = state.phase === "menu";
    const sForPlayer = menu ? 35 : state.s;
    const scale = menu ? 1.3 : 1.15;

    /* player */
    let playerPose: Pose;
    if (state.flight) {
      const f = state.flight;
      playerPose = { position: f.position.clone(), forward: f.forward.clone(), up: f.up.clone() };
    } else if (state.loop) {
      playerPose = loopFramePose(state);
    } else {
      const ground = menu ? 0 : state.air?.height ?? ((groundHeight(state.s, state.lane, state.route, state.vehicle) ?? 0) + (state.route === "main" ? rampHeightAt(state.s, state.lane, state.vehicle) : 0));
      playerPose = poseAt(sForPlayer, menu ? 0 : state.lane, menu ? "main" : state.route, ground, menu ? 0 : state.heading || 0, menu ? 0 : state.lean);
    }
    let pitch = 0, roll = 0;
    if (!state.flight && !state.loop && !menu) {
      pitch = state.air
        ? Math.max(-0.28, Math.min(0.28, state.air.vy * 0.025))
        : state.route === "main"
          ? Math.atan((rampHeightAt(state.s + 0.05, state.lane, state.vehicle) - rampHeightAt(state.s, state.lane, state.vehicle)) / 0.05)
          : 0;
      if (state.air) roll = Math.sin(state.air.age * 3) * 0.22;
    }
    if (state.flight) {
      const spin = state.flight.mode === "drift" ? Math.sin(state.flight.age * 0.5) * 0.45 : 0;
      const bank = state.flight.mode === "drift" ? Math.sin(state.flight.age * 0.3) * 0.3 : 0;
      roll = spin;
      pitch = bank;
    }
    placeRider(0, playerPose, scale, pitch, roll);

    /* rivals */
    for (let i = 0; i < 5; i++) {
      const rival = state.rivals[i];
      if (!rival || state.mode === "trial") { hideRider(i + 1); continue; }
      showRider(i + 1);
      const s = menu ? 35 + 10 + i * 5 : rival.s;
      const lane = menu ? (i % 3 - 1) * 3 : rival.lane;
      const ground = menu ? 0 : rival.air?.height ?? (islandHeight(rival.s, rival.route) ?? 0);
      placeRider(i + 1, poseAt(s, lane, menu ? "main" : rival.route, ground, 0, menu ? 0 : rival.lean ?? 0), scale);
    }

    /* camera */
    const frame = routeFrame(sForPlayer, menu ? "main" : state.route);
    const fwd = state.flight ? state.flight.forward : state.loop ? playerPose.forward : poseAt(sForPlayer, menu ? 0 : state.lane, menu ? "main" : state.route, 0, menu ? 0 : state.heading || 0, 0).forward;
    const up0 = state.flight ? state.flight.up : frame.up;
    const side = new Vec3().crossVectors(fwd, up0).normalize();
    const up = new Vec3().crossVectors(side, fwd).normalize();
    if (!rig) rig = { forward: fwd.clone(), up: up.clone() };
    else {
      const k = 1 - Math.exp(-dt * 12);
      rig.forward.lerp(fwd, k).normalize();
      rig.up.lerp(up, k).normalize();
    }
    const cs = new Vec3().crossVectors(rig.forward, rig.up).normalize();
    const cu = new Vec3().crossVectors(cs, rig.forward).normalize();
    const params = view === "wide" ? { back: 4.5, height: 4, fov: 82, portraitFov: 82 } : { back: 4.5, height: 3, fov: 72, portraitFov: 76 };
    const origin = playerPose.position;
    let eye: Vec3, look: Vec3, fov: number;
    if (menu) {
      eye = frame.p.clone().addScaledVector(fwd, 4.5).addScaledVector(frame.side, -7).addScaledVector(frame.up, 2.7);
      look = frame.p.clone().addScaledVector(frame.side, 3.8).addScaledVector(frame.up, 1.1);
      fov = 48;
    } else {
      eye = origin.clone().addScaledVector(rig.forward, -params.back).addScaledVector(cu, params.height);
      look = origin.clone().addScaledVector(rig.forward, 3).addScaledVector(cu, 1.4);
      fov = aspect < 0.85 ? params.portraitFov : params.fov;
    }
    cameraController.setPose({
      position: [eye.x, eye.y, eye.z],
      target: [look.x, look.y, look.z],
      up: menu ? [frame.up.x, frame.up.y, frame.up.z] : [cu.x, cu.y, cu.z],
      fov
    }, { cut: false });

    /* meteors */
    const lap = Math.floor(state.s / COURSE_LENGTH);
    for (const c of input.meteors) {
      const h = node(`rock-${c.id}`);
      const collected = state.collected.has(lap + ":" + c.id);
      h.setVisible(!collected);
      if (collected) continue;
      const f = routeFrame(c.s, c.route);
      const p = f.p.clone().addScaledVector(f.side, meteorLane(c, state.time)).addScaledVector(f.up, 1 + (islandHeight(c.s, c.route) ?? 0));
      const base = multiplyMat3(multiplyMat3(basisMatrix(f.tangent, f.up, f.side), axisRotation("x", state.time * 0.3 + c.id)), axisRotation("z", Math.sin(state.time * 0.48 + c.id * 0.9) * 0.8));
      const e = euler(base);
      h.setPosition(p.x, p.y, p.z);
      h.setRotation(e[0], e[1], e[2]);
    }

    /* stardust: hide collected, bob the rest */
    const dust = node("stardust");
    const positions = new Float32Array(input.dustBase.length * 3);
    for (let i = 0; i < input.dustBase.length; i++) {
      const c = input.dustItems[i]!;
      const f = routeFrame(c.s, c.route);
      const p = input.dustBase[i]!;
      const bob = Math.sin(time * 2 + c.id) * 0.22;
      positions[i * 3] = p.x + f.up.x * bob;
      positions[i * 3 + 1] = p.y + f.up.y * bob;
      positions[i * 3 + 2] = p.z + f.up.z * bob;
      dustSize[i] = state.collected.has(lap + ":" + c.id) ? 0 : 9;
    }
    dust.updateAttribute?.("position", { array: positions, offset: 0 });
    const sizeKey = lap + ":" + state.dust;
    if (sizeKey !== lastSizeKey || dustLap !== lap) {
      dust.updateAttribute?.("size", { array: dustSize, offset: 0 });
      lastSizeKey = sizeKey;
      dustLap = lap;
    }

    /* checkpoint veils */
    state.events.forEach((e) => {
      if (e.type === "gate") {
        const i = GATES.findIndex((g) => g.s === e.gate);
        if (i >= 0) gatePulse[i] = 1;
      }
    });
    gateVeils.forEach((veil, i) => {
      gatePulse[i] = Math.max(0, gatePulse[i]! - dt * 0.65);
      veil.setUniform?.("veilTime", time);
      veil.setUniform?.("veilPulse", gatePulse[i]!);
    });

    /* gravity halo */
    const halo = node("gravity-halo");
    const haloOn = !menu && (state.gravityTime > 0 || state.flight?.mode === "sling");
    halo.setVisible(haloOn);
    if (haloOn) {
      const side2 = new Vec3().crossVectors(playerPose.forward, playerPose.up).normalize();
      const up2 = new Vec3().crossVectors(side2, playerPose.forward).normalize();
      const m = multiplyMat3(multiplyMat3(basisMatrix(playerPose.forward, up2, side2), axisRotation("y", Math.PI / 2)), axisRotation("z", time * 2));
      const e = euler(m);
      halo.setPosition(playerPose.position.x + up2.x, playerPose.position.y + up2.y, playerPose.position.z + up2.z);
      halo.setRotation(e[0], e[1], e[2]);
    }

    /* exhaust */
    if (!state.flight && !state.air && !menu && state.phase === "racing" && state.speed > 4) {
      exhaustBudget += Math.min(0.1, dt) * (state.boosting ? 600 : 110 + state.speed * 3);
      let spawned = 0;
      const pf = poseAt(state.s, state.lane, state.route, 0, state.heading || 0, 0);
      const fr = routeFrame(state.s, state.route);
      while (exhaustBudget >= 1 && spawned < 14) {
        exhaustBudget -= 1;
        spawned++;
        const k = exhaustHead++ % input.exhaust;
        const p = pf.position.clone().addScaledVector(fr.tangent, -0.75 - rng() * 0.3).addScaledVector(fr.side, (rng() - 0.5) * 0.7).addScaledVector(fr.up, 0.25);
        exhaustPos[k * 3] = p.x; exhaustPos[k * 3 + 1] = p.y; exhaustPos[k * 3 + 2] = p.z;
        exhaustVel[k * 3] = fr.up.x * 0.6; exhaustVel[k * 3 + 1] = fr.up.y * 0.6; exhaustVel[k * 3 + 2] = fr.up.z * 0.6;
        exhaustAge[k] = 0;
      }
    }
    for (let k = 0; k < input.exhaust; k++) {
      exhaustAge[k]! += dt / 0.6;
      const alive = exhaustAge[k]! < 1;
      exhaustPos[k * 3]! += exhaustVel[k * 3]! * dt;
      exhaustPos[k * 3 + 1]! += exhaustVel[k * 3 + 1]! * dt;
      exhaustPos[k * 3 + 2]! += exhaustVel[k * 3 + 2]! * dt;
      exhaustSize[k] = alive ? 7 * (1 - exhaustAge[k]! * 0.5) : 0;
      exhaustFade[k] = alive ? (1 - exhaustAge[k]!) * 0.7 : 0;
    }
    const ex = node("exhaust");
    ex.updateAttribute?.("position", { array: exhaustPos, offset: 0 });
    ex.updateAttribute?.("size", { array: exhaustSize, offset: 0 });
    ex.updateAttribute?.("fade", { array: exhaustFade, offset: 0 });
  }

  return {
    update,
    resetCamera() { rig = null; },
    get nodeCount() { return handles.size; }
  };
}

function loopFramePose(state: RaceState): Pose {
  const l = loopFrame(state.loop!.def, state.loop!.t, state.loop!.lane);
  return { position: l.p.clone().addScaledVector(l.up, 0.06), forward: l.tangent, up: l.up };
}
