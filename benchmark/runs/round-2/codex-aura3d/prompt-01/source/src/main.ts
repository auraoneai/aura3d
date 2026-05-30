import { PhysicsWorld, Shape, type RigidBody, type Contact } from "@aura3d/engine/physics";

type Vec3 = [number, number, number];

type CubeState = {
  body: RigidBody;
  color: string;
  size: number;
  spin: Vec3;
};

type ProjectedPoint = {
  x: number;
  y: number;
  depth: number;
};

const CUBE_COUNT = 50;
const RAMP_ANGLE = -18 * Math.PI / 180;
const RAMP_LENGTH = 9.5;
const RAMP_WIDTH = 4.6;
const RAMP_THICKNESS = 0.16;
const CUBE_SIZE = 0.34;
const SCALE = 128;

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("Missing #app root.");
}

root.innerHTML = `
  <main class="playground-shell">
    <canvas id="physics-canvas" aria-label="3D physics playground with falling cubes and a tilted ramp"></canvas>
    <section class="hud" aria-live="polite">
      <div class="readout">
        <span class="label">Live contacts</span>
        <strong id="contact-count">0</strong>
      </div>
      <div class="readout">
        <span class="label">Bodies</span>
        <strong>${CUBE_COUNT}</strong>
      </div>
      <button id="reset-button" type="button">Reset</button>
    </section>
  </main>
`;

const style = document.createElement("style");
style.textContent = `
  :root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #07090d;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    overflow: hidden;
    background: #07090d;
  }

  .playground-shell {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(circle at 22% 12%, rgba(48, 122, 255, 0.16), transparent 34%),
      radial-gradient(circle at 76% 26%, rgba(255, 132, 63, 0.13), transparent 32%),
      linear-gradient(180deg, #101621 0%, #080a0f 62%, #050609 100%);
  }

  #physics-canvas {
    display: block;
    width: 100vw;
    height: 100vh;
    cursor: grab;
    touch-action: none;
  }

  #physics-canvas:active {
    cursor: grabbing;
  }

  .hud {
    position: fixed;
    top: 18px;
    left: 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(8, 11, 16, 0.78);
    backdrop-filter: blur(14px);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.34);
  }

  .readout {
    min-width: 114px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
  }

  .label {
    display: block;
    margin-bottom: 2px;
    color: rgba(237, 243, 255, 0.68);
    font-size: 11px;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  strong {
    color: #ffffff;
    font-size: 22px;
    line-height: 1;
  }

  button {
    height: 50px;
    min-width: 82px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: #f0f5ff;
    color: #141924;
    font: 700 14px/1 Inter, ui-sans-serif, system-ui, sans-serif;
    cursor: pointer;
  }

  button:hover {
    background: #ffffff;
  }

  @media (max-width: 640px) {
    .hud {
      top: 10px;
      left: 10px;
      right: 10px;
      gap: 8px;
    }

    .readout {
      min-width: 0;
      flex: 1;
    }

    button {
      min-width: 72px;
    }
  }
`;
document.head.append(style);

const canvasNode = document.querySelector<HTMLCanvasElement>("#physics-canvas");
const contactCountNode = document.querySelector<HTMLElement>("#contact-count");
const resetButtonNode = document.querySelector<HTMLButtonElement>("#reset-button");

if (!canvasNode || !contactCountNode || !resetButtonNode) {
  throw new Error("Missing playground controls.");
}

const canvas = canvasNode;
const contactCount = contactCountNode;
const resetButton = resetButtonNode;
const contextNode = canvas.getContext("2d", { alpha: false });
if (!contextNode) {
  throw new Error("Canvas 2D is unavailable.");
}
const context = contextNode;

let world: PhysicsWorld;
let cubes: CubeState[] = [];
let contactPairs = new Set<string>();
let orbitYaw = -0.58;
let orbitPitch = 0.72;
let dragging = false;
let lastPointer: { x: number; y: number } | undefined;
let previousTime = performance.now();

function resetSimulation(): void {
  world = new PhysicsWorld({
    gravity: [0, -9.4, 0],
    fixedDelta: 1 / 90,
    solverIterations: 9,
    enableSleeping: false
  });

  const rampNormal: Vec3 = [-Math.sin(RAMP_ANGLE), Math.cos(RAMP_ANGLE), 0];
  const rampBody = world.createRigidBody({
    type: "static",
    friction: 0.64,
    restitution: 0.1
  });
  world.createCollider(rampBody, {
    shape: Shape.plane(rampNormal, 0),
    material: { friction: 0.82, restitution: 0.05 }
  });

  cubes = [];
  for (let index = 0; index < CUBE_COUNT; index += 1) {
    const row = Math.floor(index / 10);
    const col = index % 10;
    const x = -3.55 + col * 0.78 + seeded(index, 0.22);
    const z = -1.65 + row * 0.78 + seeded(index + 91, 0.18);
    const yOnRamp = Math.tan(RAMP_ANGLE) * x + CUBE_SIZE * 0.76;
    const y = yOnRamp + 0.12 + row * 0.42 + (index % 4) * 0.56;
    const body = world.createRigidBody({
      type: "dynamic",
      position: [x, y, z],
      velocity: [0.15 + seeded(index + 14, 0.55), -0.55 - (index % 5) * 0.16, seeded(index + 32, 0.24)],
      angularVelocity: [seeded(index + 5, 1.1), seeded(index + 37, 1.3), seeded(index + 73, 1.1)],
      mass: 1,
      linearDamping: 0.03,
      angularDamping: 0.1,
      restitution: 0.22,
      friction: 0.48
    });

    world.createCollider(body, {
      shape: Shape.box(CUBE_SIZE / 2, CUBE_SIZE / 2, CUBE_SIZE / 2),
      material: { friction: 0.58, restitution: 0.24 }
    });

    cubes.push({
      body,
      color: cubeColor(index),
      size: CUBE_SIZE,
      spin: [seeded(index + 3, 0.9), seeded(index + 51, 0.9), seeded(index + 79, 0.9)]
    });
  }
}

function seeded(seed: number, amplitude: number): number {
  return (Math.sin(seed * 12.9898) * 43758.5453 % 1) * amplitude;
}

function cubeColor(index: number): string {
  const palette = ["#f97316", "#38bdf8", "#a3e635", "#f43f5e", "#facc15", "#c084fc"];
  return palette[index % palette.length];
}

function resizeCanvas(): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function stepSimulation(dt: number): void {
  const clamped = Math.min(dt, 0.05);
  const steps = Math.max(1, Math.ceil(clamped / (1 / 90)));
  for (let i = 0; i < steps; i += 1) {
    world.step(clamped / steps);
  }

  const snapshot = world.snapshot();
  contactPairs = new Set(snapshot.contacts.map((contact: Contact) => `${contact.bodyA}:${contact.bodyB}`));
  contactCount.textContent = `${snapshot.contacts.length}`;

  for (const cube of cubes) {
    const [x, y, z] = cube.body.position;
    if (y < -4.5 || Math.abs(x) > 7 || Math.abs(z) > 5) {
      const index = cubes.indexOf(cube);
      cube.body.setPosition([-3.3 + (index % 10) * 0.74, 4.6 + Math.floor(index / 10) * 0.35, -1.8 + Math.floor(index / 10) * 0.8]);
      cube.body.setVelocity([0.1, -0.2, 0]);
    }
  }
}

function render(): void {
  resizeCanvas();
  const width = canvas.width;
  const height = canvas.height;
  context.fillStyle = "#07090d";
  context.fillRect(0, 0, width, height);
  drawGrid(width, height);

  const drawables: { depth: number; draw: () => void }[] = [];
  addRamp(drawables);
  for (const cube of cubes) {
    addCube(drawables, cube);
  }

  drawables.sort((a, b) => a.depth - b.depth);
  for (const drawable of drawables) {
    drawable.draw();
  }

  drawContactEvidence();
}

function project(point: Vec3): ProjectedPoint {
  const cy = Math.cos(orbitYaw);
  const sy = Math.sin(orbitYaw);
  const cp = Math.cos(orbitPitch);
  const sp = Math.sin(orbitPitch);

  const x1 = point[0] * cy - point[2] * sy;
  const z1 = point[0] * sy + point[2] * cy;
  const y1 = point[1];
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;

  return {
    x: canvas.width * 0.52 + x1 * SCALE,
    y: canvas.height * 0.58 - y2 * SCALE,
    depth: z2
  };
}

function addRamp(drawables: { depth: number; draw: () => void }[]): void {
  const halfLength = RAMP_LENGTH / 2;
  const halfWidth = RAMP_WIDTH / 2;
  const corners: Vec3[] = [
    [-halfLength, Math.tan(RAMP_ANGLE) * -halfLength, -halfWidth],
    [halfLength, Math.tan(RAMP_ANGLE) * halfLength, -halfWidth],
    [halfLength, Math.tan(RAMP_ANGLE) * halfLength, halfWidth],
    [-halfLength, Math.tan(RAMP_ANGLE) * -halfLength, halfWidth]
  ];
  const lower = corners.map<Vec3>((corner) => [corner[0], corner[1] - RAMP_THICKNESS, corner[2]]);
  const projected = corners.map(project);
  const projectedLower = lower.map(project);
  const depth = projected.reduce((sum, point) => sum + point.depth, 0) / projected.length;

  drawables.push({
    depth,
    draw: () => {
      drawPolygon(projectedLower, "#17202b", "#314055", 1);
      drawPolygon([projected[1], projected[2], projectedLower[2], projectedLower[1]], "#101722", "#314055", 1);
      drawPolygon(projected, "#263649", "#88a0bd", 2);
      drawRampStripes(corners);
    }
  });
}

function addCube(drawables: { depth: number; draw: () => void }[], cube: CubeState): void {
  const [x, y, z] = cube.body.position;
  const half = cube.size / 2;
  const time = performance.now() * 0.001;
  const angles: Vec3 = [
    cube.body.angularVelocity[0] * time * 0.16 + cube.spin[0],
    cube.body.angularVelocity[1] * time * 0.16 + cube.spin[1],
    cube.body.angularVelocity[2] * time * 0.16 + cube.spin[2]
  ];
  const vertices = [
    [-half, -half, -half], [half, -half, -half], [half, half, -half], [-half, half, -half],
    [-half, -half, half], [half, -half, half], [half, half, half], [-half, half, half]
  ].map((vertex) => {
    const rotated = rotatePoint(vertex as Vec3, angles);
    return [rotated[0] + x, rotated[1] + y, rotated[2] + z] as Vec3;
  });
  const faces = [
    { ids: [0, 1, 2, 3], shade: 0.62 },
    { ids: [4, 7, 6, 5], shade: 0.82 },
    { ids: [3, 2, 6, 7], shade: 1 },
    { ids: [0, 4, 5, 1], shade: 0.52 },
    { ids: [1, 5, 6, 2], shade: 0.72 },
    { ids: [0, 3, 7, 4], shade: 0.68 }
  ];
  const faceDraws = faces.map((face) => {
    const points = face.ids.map((id) => project(vertices[id]));
    return {
      depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length,
      points,
      color: shadeColor(cube.color, face.shade)
    };
  });
  const depth = faceDraws.reduce((sum, face) => sum + face.depth, 0) / faceDraws.length;
  const hasContact = world.snapshot().contacts.some((contact: Contact) => contact.bodyA === cube.body.id || contact.bodyB === cube.body.id);

  drawables.push({
    depth,
    draw: () => {
      faceDraws.sort((a, b) => a.depth - b.depth);
      for (const face of faceDraws) {
        drawPolygon(face.points, face.color, "rgba(255,255,255,0.28)", 0.75);
      }
      if (hasContact) {
        const center = project([x, y, z]);
        context.strokeStyle = "rgba(255, 255, 255, 0.82)";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(center.x, center.y, 13, 0, Math.PI * 2);
        context.stroke();
      }
    }
  });
}

function rotatePoint(point: Vec3, angles: Vec3): Vec3 {
  const [sx, sy, sz] = angles.map(Math.sin) as Vec3;
  const [cx, cy, cz] = angles.map(Math.cos) as Vec3;
  let [x, y, z] = point;
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [x, y, z];
}

function drawPolygon(points: ProjectedPoint[], fill: string, stroke: string, lineWidth: number): void {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawRampStripes(corners: Vec3[]): void {
  const startX = corners[0][0];
  const endX = corners[1][0];
  for (let i = 1; i < 8; i += 1) {
    const x = startX + (endX - startX) * (i / 8);
    const a = project([x, Math.tan(RAMP_ANGLE) * x + 0.004, -RAMP_WIDTH / 2]);
    const b = project([x, Math.tan(RAMP_ANGLE) * x + 0.004, RAMP_WIDTH / 2]);
    context.strokeStyle = "rgba(197, 214, 235, 0.24)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
}

function drawContactEvidence(): void {
  const contacts = world.snapshot().contacts;
  context.save();
  for (const contact of contacts.slice(0, 36)) {
    const a = world.getBody(contact.bodyA);
    const b = world.getBody(contact.bodyB);
    if (!a || !b) {
      continue;
    }
    const dynamic = a.type === "dynamic" ? a : b;
    const origin = project(dynamic.position as Vec3);
    const tip = project([
      dynamic.position[0] + contact.normal[0] * 0.38,
      dynamic.position[1] + contact.normal[1] * 0.38,
      dynamic.position[2] + contact.normal[2] * 0.38
    ]);
    context.strokeStyle = "rgba(255, 81, 81, 0.92)";
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(tip.x, tip.y);
    context.stroke();
    context.fillStyle = "rgba(255, 81, 81, 0.2)";
    context.beginPath();
    context.arc(origin.x, origin.y, 16, 0, Math.PI * 2);
    context.fill();
  }
  if (contacts.length > 0) {
    context.fillStyle = "rgba(255, 255, 255, 0.82)";
    context.font = `${Math.round(12 * Math.min(window.devicePixelRatio || 1, 2))}px Inter, sans-serif`;
    context.fillText("red vectors mark active collision contacts", 24 * (window.devicePixelRatio || 1), canvas.height - 28 * (window.devicePixelRatio || 1));
  }
  context.restore();
}

function drawGrid(width: number, height: number): void {
  context.save();
  context.strokeStyle = "rgba(124, 151, 181, 0.12)";
  context.lineWidth = 1;
  for (let x = -7; x <= 7; x += 1) {
    const a = project([x, -0.02, -4]);
    const b = project([x, -0.02, 4]);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  for (let z = -4; z <= 4; z += 1) {
    const a = project([-7, -0.02, z]);
    const b = project([7, -0.02, z]);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  const gradient = context.createLinearGradient(0, height * 0.62, 0, height);
  gradient.addColorStop(0, "rgba(5, 6, 9, 0)");
  gradient.addColorStop(1, "rgba(5, 6, 9, 0.86)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function shadeColor(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 255) * factor);
  const g = Math.round(((value >> 8) & 255) * factor);
  const b = Math.round((value & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

function frame(now: number): void {
  const delta = (now - previousTime) / 1000;
  previousTime = now;
  stepSimulation(delta);
  render();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging || !lastPointer) {
    return;
  }
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  orbitYaw += dx * 0.006;
  orbitPitch = Math.max(0.28, Math.min(1.18, orbitPitch + dy * 0.004));
  lastPointer = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  lastPointer = undefined;
  canvas.releasePointerCapture(event.pointerId);
});

resetButton.addEventListener("click", () => {
  resetSimulation();
});

window.addEventListener("resize", resizeCanvas);

resetSimulation();
requestAnimationFrame(frame);
