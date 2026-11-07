import { camera, createAuraApp, environments, lights, material, physics, primitives, scene } from "@aura3d/engine";

type Phase = "ready" | "running" | "settled";
interface TaskState {
  readonly phase: Phase;
  readonly total: number;
  readonly toppled: number;
  readonly ballReleased: boolean;
}

declare global {
  interface Window {
    __TASK_STATE__?: TaskState;
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
type Q4 = [number, number, number, number];

// ---------------------------------------------------------------- constants
const TILE_COUNT = 30;
const TILE_W = 0.2; // thickness along the toppling direction
const TILE_H = 1.0;
const TILE_D = 0.5;
const TILE_SPACING = 0.62; // arc-length between tile centres
const TILE_MASS = 0.3;
const BALL_R = 0.35;
const BALL_MASS = 3;
const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 16;
const TOPPLE_COS = Math.cos((60 * Math.PI) / 180);
const SETTLE_TIMEOUT = 45;

// ------------------------------------------------------------------- layout
// Heading profile along the path: straight lead-in, one smooth S bend, straight tail.
const LEAD = 1.4;
const BEND = 14.5;
const BEND_ANGLE = 0.55;
const heading = (s: number): number => {
  const u = (s - LEAD) / BEND;
  return u <= 0 || u >= 1 ? 0 : BEND_ANGLE * Math.sin(Math.PI * u);
};

interface TileSpec {
  pos: V3;
  yaw: number;
}
const tiles: TileSpec[] = [];
{
  let x = 0;
  let z = 0;
  let s = 0;
  const ds = 0.002;
  for (let i = 0; i < TILE_COUNT; i += 1) {
    const target = i * TILE_SPACING;
    while (s < target) {
      const th = heading(s);
      x += Math.cos(th) * ds;
      z -= Math.sin(th) * ds;
      s += ds;
    }
    const yaw = i < TILE_COUNT - 1 ? heading(target + TILE_SPACING / 2) : heading(target);
    tiles.push({ pos: [x, TILE_H / 2, z], yaw });
  }
}

const yawQuat = (yaw: number): Q4 => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

// Ramp: descends towards +x and ends just before the first tile (tile 0 sits at x = 0).
const ALPHA = (20 * Math.PI) / 180;
const RAMP_L = 3;
const RAMP_T = 0.15;
const RAMP_W = 1.2;
const END_X = -0.9;
const END_Y = 0.5;
const sinA = Math.sin(ALPHA);
const cosA = Math.cos(ALPHA);
const rampCenter: V3 = [
  END_X - (RAMP_L / 2) * cosA - (RAMP_T / 2) * sinA,
  END_Y + (RAMP_L / 2) * sinA - (RAMP_T / 2) * cosA,
  0
];
const rampQuat: Q4 = [0, 0, Math.sin(-ALPHA / 2), Math.cos(-ALPHA / 2)];
const rampTopX = END_X - RAMP_L * cosA;
const pillarLowTop = 0.42;
const pillarHighTop = 1.17;
const pillarLowPos: V3 = [END_X - 0.4, pillarLowTop / 2, 0];
const pillarHighPos: V3 = [rampTopX + 0.35, pillarHighTop / 2, 0];
const BALL_START_DIST = 1.8; // distance up the ramp from its end
const ballStart: V3 = [
  END_X + (BALL_R + 0.004) * sinA - BALL_START_DIST * cosA,
  END_Y + (BALL_R + 0.004) * cosA + BALL_START_DIST * sinA,
  0
];

// Bounds for table and camera framing.
let minX = rampTopX - 0.4;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const t of tiles) {
  maxX = Math.max(maxX, t.pos[0]);
  minZ = Math.min(minZ, t.pos[2]);
  maxZ = Math.max(maxZ, t.pos[2]);
}
maxX += 0.6;
minZ = Math.min(minZ, -0.7) - 0.4;
maxZ = Math.max(maxZ, 0.7) + 0.4;
minX = Math.min(minX, maxX);
const cx = (minX + maxX) / 2;
const cz = (minZ + maxZ) / 2;
const MARGIN = 2.2;
const tableW = maxX - minX + MARGIN * 2;
const tableD = maxZ - minZ + MARGIN * 2;

// ------------------------------------------------------------------- visuals
const hslHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const tableMat = material.pbr({ color: "#6a4a30", roughness: 0.85, metallic: 0 });
const floorMat = material.pbr({ color: "#2b313c", roughness: 1 });
const rampMat = material.pbr({ color: "#8e939c", roughness: 0.6, metallic: 0.2 });
const ballMat = material.pbr({ color: "#d7263d", roughness: 0.25, metallic: 0.6 });

const tileId = (i: number): string => `tile-${i}`;
const BALL_ID = "ball";

let sc = scene({ background: "#1b2230" })
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#dbe6f5", groundColor: "#5a4a3a", intensity: 0.8 }))
  .add(lights.directional({ position: [cx - 6, 13, cz + 8], target: [cx, 0, cz], intensity: 3, shadow: true }))
  .add(primitives.plane({ name: "floor", size: [120, 1, 120], material: floorMat, castShadow: false }).position(cx, -1.2, cz))
  .add(primitives.box({ name: "table", size: [tableW, 0.4, tableD], material: tableMat }).position(cx, -0.2, cz))
  .add(primitives.box({ name: "ramp", size: [RAMP_L, RAMP_T, RAMP_W], material: rampMat }).position(...rampCenter).rotate(0, 0, -ALPHA))
  .add(primitives.box({ name: "ramp-pillar-low", size: [0.3, pillarLowTop, 0.9], material: rampMat }).position(...pillarLowPos))
  .add(primitives.box({ name: "ramp-pillar-high", size: [0.3, pillarHighTop, 0.9], material: rampMat }).position(...pillarHighPos))
  .add(primitives.sphere({ name: "ball-visual", size: BALL_R * 2, material: ballMat }).position(...ballStart).runtime({ id: BALL_ID, mutable: true }))
  .camera(
    (() => {
      const fov = 45;
      const aspect = 640 / 360;
      const halfW = (maxX - minX) / 2 + 1.2;
      const halfD = (maxZ - minZ) / 2 + 1.2;
      const elev = (58 * Math.PI) / 180;
      const tanHalf = Math.tan((fov * Math.PI) / 360);
      const dist = Math.max(halfW / (tanHalf * aspect), halfD / (tanHalf * Math.sin(elev))) * 1.05;
      return camera.perspective({
        position: [cx, 0.3 + dist * Math.sin(elev), cz + dist * Math.cos(elev)],
        target: [cx, 0.3, cz],
        fov,
        near: 0.5,
        far: 200
      });
    })()
  );

tiles.forEach((t, i) => {
  const tileMat = material.pbr({ color: hslHex((i * 12) % 360, 0.55, 0.62), roughness: 0.35, metallic: 0 });
  sc = sc.add(
    primitives
      .box({ name: tileId(i), size: [TILE_W, TILE_H, TILE_D], material: tileMat })
      .position(...t.pos)
      .rotate(0, t.yaw, 0)
      .runtime({ id: tileId(i), mutable: true })
  );
});

// ------------------------------------------------------------------ helpers
const quatToEulerZYX = (q: readonly number[]): V3 => {
  const x = q[0] ?? 0;
  const y = q[1] ?? 0;
  const z = q[2] ?? 0;
  const w = q[3] ?? 1;
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m21 = 2 * (x * y + z * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m31 = 2 * (x * z - y * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(-Math.max(-1, Math.min(1, m31)));
  if (Math.abs(m31) < 0.9999999) return [Math.atan2(m32, m33), ey, Math.atan2(m21, m11)];
  return [0, ey, Math.atan2(-m12, m22)];
};

const setState = (state: TaskState): void => {
  window.__TASK_STATE__ = state;
};
const publish = (phase: Phase, toppled: number, ballReleased: boolean): void => {
  setState(Object.freeze({ phase, total: TILE_COUNT, toppled, ballReleased }));
};
publish("ready", 0, false);

// --------------------------------------------------------------------- main
async function main(): Promise<void> {
  const world = await physics.worldAsync({
    gravity: [0, -9.81, 0],
    fixedDelta: FIXED_DT,
    enableSleeping: false,
    seed: 10
  });

  // Static scene geometry.
  world.createBody({
    type: "static",
    position: [cx, -0.2, cz],
    shape: physics.box(tableW / 2, 0.2, tableD / 2),
    material: { friction: 0.8, restitution: 0 }
  });
  world.createBody({
    type: "static",
    position: rampCenter,
    rotation: rampQuat,
    shape: physics.box(RAMP_L / 2, RAMP_T / 2, RAMP_W / 2),
    material: { friction: 0.6, restitution: 0 }
  });
  world.createBody({
    type: "static",
    position: pillarLowPos,
    shape: physics.box(0.15, pillarLowTop / 2, 0.45)
  });
  world.createBody({
    type: "static",
    position: pillarHighPos,
    shape: physics.box(0.15, pillarHighTop / 2, 0.45)
  });

  const tileBodies = tiles.map((t) =>
    world.createBody({
      type: "dynamic",
      position: t.pos,
      rotation: yawQuat(t.yaw),
      mass: TILE_MASS,
      linearDamping: 0.02,
      angularDamping: 0.02,
      shape: physics.box(TILE_W / 2, TILE_H / 2, TILE_D / 2),
      material: { friction: 0.5, restitution: 0 }
    })
  );
  const ballBody = world.createBody({
    type: "dynamic",
    position: ballStart,
    mass: BALL_MASS,
    linearDamping: 0.1,
    angularDamping: 0.3,
    shape: physics.sphere(BALL_R),
    material: { friction: 0.5, restitution: 0.05 }
  });

  const app = createAuraApp("#app", { scene: sc });
  await app.ready();

  const tileHandles = tiles.map((_, i) => app.nodes.require(tileId(i)));
  const ballHandle = app.nodes.require(BALL_ID);

  // ---- simulation state
  let phase: Phase = "ready";
  let released = false;
  let releasePending = false;
  let accumulator = 0;
  let sinceRelease = 0;
  let calm = 0;
  let toppled = 0;

  const syncNodes = (): void => {
    tileBodies.forEach((body, i) => {
      const h = tileHandles[i];
      if (!h) return;
      h.setPosition(body.position[0], body.position[1], body.position[2]);
      const e = quatToEulerZYX(body.rotation);
      h.setRotation(e[0], e[1], e[2]);
    });
    ballHandle.setPosition(ballBody.position[0], ballBody.position[1], ballBody.position[2]);
    const e = quatToEulerZYX(ballBody.rotation);
    ballHandle.setRotation(e[0], e[1], e[2]);
  };

  const countToppled = (): number => {
    let n = 0;
    for (const body of tileBodies) {
      const q = body.rotation;
      const up = 1 - 2 * (q[0] * q[0] + q[2] * q[2]); // world-y component of the tile's local up axis
      if (up < TOPPLE_COS) n += 1;
    }
    return n;
  };

  const isCalm = (): boolean => {
    const bodies = [...tileBodies, ballBody];
    for (const b of bodies) {
      if (b.position[1] < -2) continue; // fell off the table
      const v = b.velocity;
      const w = b.angularVelocity;
      if (Math.hypot(v[0], v[1], v[2]) > 0.05) return false;
      if (Math.hypot(w[0], w[1], w[2]) > 0.2) return false;
    }
    return true;
  };

  const fixedStep = (): void => {
    if (releasePending) {
      releasePending = false;
      released = true;
      phase = "running";
      sinceRelease = 0;
      calm = 0;
      ballBody.wake();
      ballBody.setVelocity([0.3 * cosA, -0.3 * sinA, 0]);
    } else if (!released) {
      ballBody.setPosition(ballStart);
      ballBody.setRotation([0, 0, 0, 1]);
      ballBody.setVelocity([0, 0, 0]);
      ballBody.setAngularVelocity([0, 0, 0]);
    }
    world.step(FIXED_DT);
    if (released && phase === "running") {
      sinceRelease += FIXED_DT;
      if (sinceRelease > 1.5 && isCalm()) calm += FIXED_DT;
      else calm = 0;
      if (calm >= 0.75 || sinceRelease > SETTLE_TIMEOUT) phase = "settled";
    }
  };

  const doRelease = (): void => {
    if (released || releasePending) return;
    releasePending = true;
  };

  const doReset = (): void => {
    try {
      world.reset();
    } catch {
      tileBodies.forEach((body, i) => {
        const t = tiles[i];
        if (!t) return;
        body.setPosition(t.pos);
        body.setRotation(yawQuat(t.yaw));
        body.setVelocity([0, 0, 0]);
        body.setAngularVelocity([0, 0, 0]);
      });
      ballBody.setPosition(ballStart);
      ballBody.setRotation([0, 0, 0, 1]);
      ballBody.setVelocity([0, 0, 0]);
      ballBody.setAngularVelocity([0, 0, 0]);
    }
    released = false;
    releasePending = false;
    phase = "ready";
    accumulator = 0;
    sinceRelease = 0;
    calm = 0;
    toppled = countToppled();
    syncNodes();
    publish(phase, toppled, false);
  };

  // ---- UI
  const bar = document.createElement("div");
  bar.style.cssText = "position:fixed;left:8px;top:320px;display:flex;gap:8px;z-index:10;";
  const makeButton = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText =
      "padding:6px 16px;font:600 13px system-ui,sans-serif;color:#fff;background:#2563eb;border:1px solid #93c5fd;border-radius:6px;cursor:pointer;";
    b.addEventListener("click", onClick);
    return b;
  };
  bar.append(makeButton("Release", doRelease), makeButton("Reset", doReset));
  document.body.append(bar);

  // ---- frame loop
  app.onFrame((f) => {
    accumulator += Math.min(Math.max(f.dt, 0), 0.1);
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      fixedStep();
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
    toppled = countToppled();
    syncNodes();
    publish(phase, toppled, released);
  });

  window.__EVAL_READY__ = true;
}

main().catch((error: unknown) => {
  console.error(error);
});
