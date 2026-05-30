import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  primitives,
  scene,
  type AuraApp,
  type AuraSceneBuilder
} from "@aura3d/engine";

import "./styles.css";

type Vec2 = {
  x: number;
  z: number;
};

function queryRequired<TElement extends HTMLElement>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector);
  if (!element) {
    throw new Error(`Mini-golf app shell is missing ${selector}.`);
  }
  return element;
}

const canvas = queryRequired<HTMLCanvasElement>("#aura-canvas");
const strokesElement = queryRequired<HTMLElement>("#strokes");
const statusElement = queryRequired<HTMLElement>("#status");

const bounds = {
  left: -2.7,
  right: 2.7,
  near: 1.65,
  far: -2.35
};

const ballRadius = 0.13;
const obstacle = { x: 0.2, z: -0.45, radius: 0.42 };
const hole = { x: 1.95, z: -1.72, radius: 0.22 };
const start = { x: -2.05, z: 1.08 };

let app: AuraApp | undefined;
let ball = { ...start };
let velocity: Vec2 = { x: 0, z: 0 };
let aim: Vec2 = { x: 0.8, z: -0.65 };
let strokes = 0;
let holed = false;
let lastFrame = performance.now();
let lastRender = 0;

const greenMaterial = material.pbr({ color: "#4aa35c", roughness: 0.82, metallic: 0 });
const fairwayMaterial = material.pbr({ color: "#61bf6a", roughness: 0.78, metallic: 0 });
const railMaterial = material.pbr({ color: "#f2eee2", roughness: 0.42, metallic: 0.02 });
const ballMaterial = material.clearcoat({ color: "#f8fbff", roughness: 0.18, clearcoat: 1 });
const obstacleMaterial = material.clearcoat({ color: "#e24a3f", roughness: 0.28, clearcoat: 0.8 });

function length2(vector: Vec2): number {
  return Math.hypot(vector.x, vector.z);
}

function normalize(vector: Vec2): Vec2 {
  const length = length2(vector);
  return length > 0.0001 ? { x: vector.x / length, z: vector.z / length } : { x: 1, z: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isBallMoving(): boolean {
  return length2(velocity) > 0.015;
}

function pointerToGreen(event: PointerEvent): Vec2 {
  const rect = canvas.getBoundingClientRect();
  const u = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const v = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);

  return {
    x: bounds.left + u * (bounds.right - bounds.left),
    z: bounds.far + v * (bounds.near - bounds.far)
  };
}

function makeAimNodes() {
  if (isBallMoving() || holed) {
    return [];
  }

  const direction = normalize(aim);
  const power = clamp(length2(aim), 0.35, 1.35);
  const angle = Math.atan2(direction.z, direction.x);
  const centerX = ball.x + direction.x * power * 0.5;
  const centerZ = ball.z + direction.z * power * 0.5;

  return [
    primitives.box({
      name: "click aim direction and power bar",
      material: material.emissive({ color: "#ffe06b", emissive: "#ffe06b" })
    })
      .position(centerX, 0.052, centerZ)
      .rotate(0, -angle, 0)
      .scale([power, 0.035, 0.055])
      .toJSON(),
    primitives.sphere({
      name: "aim target dot",
      material: material.emissive({ color: "#fff7b5", emissive: "#fff7b5" })
    })
      .position(ball.x + direction.x * power, 0.09, ball.z + direction.z * power)
      .scale(0.09)
      .toJSON()
  ];
}

function buildScene(): AuraSceneBuilder {
  const cameraTarget: [number, number, number] = [ball.x, 0.16, ball.z];
  const cameraPosition: [number, number, number] = [
    clamp(ball.x - 0.35, -1.45, 1.45),
    3.55,
    clamp(ball.z + 3.15, 0.85, 3.8)
  ];

  return scene()
    .background("#132437")
    .add(
      primitives.plane({ name: "flat mini-golf green", material: greenMaterial })
        .position(0, 0, -0.35)
        .scale([6.0, 1, 4.45])
    )
    .add(
      primitives.plane({ name: "lighter putting lane", material: fairwayMaterial })
        .position(0, 0.012, -0.35)
        .scale([4.7, 1, 3.55])
    )
    .add(
      primitives.box({ name: "back rail", material: railMaterial })
        .position(0, 0.13, bounds.far - 0.1)
        .scale([6.0, 0.26, 0.18])
    )
    .add(
      primitives.box({ name: "front rail", material: railMaterial })
        .position(0, 0.13, bounds.near + 0.1)
        .scale([6.0, 0.26, 0.18])
    )
    .add(
      primitives.box({ name: "left rail", material: railMaterial })
        .position(bounds.left - 0.1, 0.13, -0.35)
        .scale([0.18, 0.26, 4.35])
    )
    .add(
      primitives.box({ name: "right rail", material: railMaterial })
        .position(bounds.right + 0.1, 0.13, -0.35)
        .scale([0.18, 0.26, 4.35])
    )
    .add(
      primitives.cylinder({
        name: "single round bumper obstacle",
        material: obstacleMaterial
      })
        .position(obstacle.x, 0.18, obstacle.z)
        .scale([obstacle.radius * 2, 0.36, obstacle.radius * 2])
    )
    .add(
      primitives.cylinder({
        name: "black cup hole",
        material: material.pbr({ color: "#050604", roughness: 0.95, metallic: 0 })
      })
        .position(hole.x, 0.026, hole.z)
        .scale([hole.radius * 2, 0.055, hole.radius * 2])
    )
    .add(
      primitives.sphere({ name: "physics golf ball", material: ballMaterial })
        .position(ball.x, ballRadius, ball.z)
        .scale(ballRadius * 2)
    )
    .addMany(makeAimNodes())
    .add(
      primitives.box({
        name: "start tee marker",
        material: material.emissive({ color: "#2f8dff", emissive: "#2f8dff" })
      })
        .position(start.x, 0.035, start.z)
        .scale([0.55, 0.035, 0.08])
    )
    .add(lights.ambient({ intensity: 0.34, color: "#e9fff0" }))
    .add(lights.directional({ position: [-2.8, 5, 3.5], intensity: 1.45, color: "#fff8e7" }))
    .add(lights.point({ name: "cup highlight", position: [hole.x, 0.65, hole.z], intensity: 0.85, color: "#fff4bb" }))
    .add(effects.bloom({ intensity: 0.1, color: "#ffe06b" }))
    .add(interactions.pointer({ target: "physics golf ball" }))
    .camera(camera.perspective({ position: cameraPosition, target: cameraTarget, fov: 43 }));
}

function render(force = false): void {
  const now = performance.now();
  if (!force && now - lastRender < 70) {
    return;
  }

  app?.dispose();
  app = createAuraApp(canvas, {
    scene: buildScene(),
    diagnostics: false,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    resize: true
  });
  lastRender = now;
}

function resetBall(): void {
  ball = { ...start };
  velocity = { x: 0, z: 0 };
  aim = { x: 0.8, z: -0.65 };
  holed = false;
}

function updateHud(): void {
  strokesElement.textContent = String(strokes);
  if (holed) {
    statusElement.textContent = "Holed. Click to play again";
  } else if (isBallMoving()) {
    statusElement.textContent = "Ball rolling";
  } else {
    statusElement.textContent = "Click the green to aim and shoot";
  }
}

function shoot(target: Vec2): void {
  if (holed) {
    resetBall();
    updateHud();
    render(true);
    return;
  }

  if (isBallMoving()) {
    return;
  }

  const shot = { x: target.x - ball.x, z: target.z - ball.z };
  const distance = length2(shot);
  if (distance < 0.08) {
    return;
  }

  const direction = normalize(shot);
  const power = clamp(distance * 1.55, 0.75, 2.35);
  velocity = { x: direction.x * power, z: direction.z * power };
  aim = { x: direction.x * clamp(distance, 0.35, 1.35), z: direction.z * clamp(distance, 0.35, 1.35) };
  strokes += 1;
  updateHud();
  render(true);
}

function resolveCircularCollision(): void {
  const offset = { x: ball.x - obstacle.x, z: ball.z - obstacle.z };
  const distance = length2(offset);
  const minDistance = obstacle.radius + ballRadius;

  if (distance >= minDistance || distance < 0.0001) {
    return;
  }

  const normal = normalize(offset);
  ball.x = obstacle.x + normal.x * minDistance;
  ball.z = obstacle.z + normal.z * minDistance;

  const velocityDot = velocity.x * normal.x + velocity.z * normal.z;
  if (velocityDot < 0) {
    velocity = {
      x: (velocity.x - 2 * velocityDot * normal.x) * 0.76,
      z: (velocity.z - 2 * velocityDot * normal.z) * 0.76
    };
  }
}

function physicsStep(deltaSeconds: number): void {
  if (holed) {
    return;
  }

  ball.x += velocity.x * deltaSeconds;
  ball.z += velocity.z * deltaSeconds;

  if (ball.x < bounds.left + ballRadius) {
    ball.x = bounds.left + ballRadius;
    velocity.x = Math.abs(velocity.x) * 0.7;
  }
  if (ball.x > bounds.right - ballRadius) {
    ball.x = bounds.right - ballRadius;
    velocity.x = -Math.abs(velocity.x) * 0.7;
  }
  if (ball.z < bounds.far + ballRadius) {
    ball.z = bounds.far + ballRadius;
    velocity.z = Math.abs(velocity.z) * 0.7;
  }
  if (ball.z > bounds.near - ballRadius) {
    ball.z = bounds.near - ballRadius;
    velocity.z = -Math.abs(velocity.z) * 0.7;
  }

  resolveCircularCollision();

  const cupDistance = Math.hypot(ball.x - hole.x, ball.z - hole.z);
  if (cupDistance < hole.radius * 0.72 && length2(velocity) < 0.85) {
    ball = { x: hole.x, z: hole.z };
    velocity = { x: 0, z: 0 };
    holed = true;
    updateHud();
    render(true);
    return;
  }

  const friction = Math.pow(0.32, deltaSeconds);
  velocity.x *= friction;
  velocity.z *= friction;

  if (length2(velocity) < 0.035) {
    velocity = { x: 0, z: 0 };
  }
}

function frame(now: number): void {
  const deltaSeconds = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;
  const wasMoving = isBallMoving();

  physicsStep(deltaSeconds);

  if (wasMoving || isBallMoving()) {
    render();
  }

  updateHud();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointermove", (event) => {
  if (isBallMoving() || holed) {
    return;
  }

  const target = pointerToGreen(event);
  const nextAim = { x: target.x - ball.x, z: target.z - ball.z };
  if (length2(nextAim) > 0.08) {
    const direction = normalize(nextAim);
    const power = clamp(length2(nextAim), 0.35, 1.35);
    aim = { x: direction.x * power, z: direction.z * power };
    render();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  shoot(pointerToGreen(event));
});

window.addEventListener("resize", () => render(true));

render(true);
updateHud();
requestAnimationFrame(frame);
