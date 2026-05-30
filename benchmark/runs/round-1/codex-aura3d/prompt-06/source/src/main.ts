import {
  camera,
  createAuraApp,
  interactions,
  lights,
  material,
  primitives,
  scene,
} from "@aura3d/engine";

type Vec2 = {
  x: number;
  z: number;
};

const course = {
  width: 5.6,
  length: 8,
  ballRadius: 0.16,
  hole: { x: 0.95, z: -3.05, radius: 0.32 },
  start: { x: -1.75, z: 3.05 },
  obstacle: { x: -0.18, z: -0.28, width: 1.18, depth: 0.38 },
};

const greenMaterial = material.pbr({ color: "#2fa94f", roughness: 0.9, metallic: 0 });
const railMaterial = material.pbr({ color: "#24513a", roughness: 0.58, metallic: 0.02 });
const whiteMaterial = material.pbr({ color: "#f8f8f1", roughness: 0.42, metallic: 0 });
const darkMaterial = material.pbr({ color: "#101413", roughness: 0.82, metallic: 0 });
const markerMaterial = material.emissive({ color: "#f4d44d", emissive: "#f4d44d" });

const miniGolfScene = scene()
  .background("#85b7d7")
  .add(primitives.plane({ name: "flat putting green", material: greenMaterial }).position(0, -0.03, 0).scale([6.2, 1, 8.7]))
  .add(primitives.box({ name: "left wooden rail", material: railMaterial }).position(-3.05, 0.18, 0).scale([0.24, 0.36, 8.55]))
  .add(primitives.box({ name: "right wooden rail", material: railMaterial }).position(3.05, 0.18, 0).scale([0.24, 0.36, 8.55]))
  .add(primitives.box({ name: "back wooden rail", material: railMaterial }).position(0, 0.18, -4.15).scale([6.1, 0.36, 0.24]))
  .add(primitives.box({ name: "tee rail", material: railMaterial }).position(0, 0.18, 4.15).scale([6.1, 0.36, 0.24]))
  .add(primitives.box({ name: "single red brick obstacle", material: material.pbr({ color: "#b84a3e", roughness: 0.7, metallic: 0 }) }).position(course.obstacle.x, 0.22, course.obstacle.z).rotate(0, 0.18, 0).scale([1.28, 0.42, 0.44]))
  .add(primitives.sphere({ name: "black cup hole", material: darkMaterial }).position(course.hole.x, 0.012, course.hole.z).scale([0.34, 0.035, 0.34]))
  .add(primitives.sphere({ name: "golf ball", material: whiteMaterial }).position(course.start.x, 0.17, course.start.z).scale(0.17))
  .add(primitives.box({ name: "yellow aim arrow shaft", material: markerMaterial }).position(course.start.x + 0.62, 0.08, course.start.z - 0.45).rotate(0, -0.7, 0).scale([0.95, 0.035, 0.06]))
  .add(primitives.box({ name: "yellow aim arrow head", material: markerMaterial }).position(course.start.x + 1.02, 0.09, course.start.z - 0.75).rotate(0, -0.7, 0.78).scale([0.26, 0.045, 0.07]))
  .add(lights.ambient({ color: "#dff7ff", intensity: 0.62 }))
  .add(lights.directional({ color: "#ffffff", intensity: 1.35, position: [-3.5, 5.5, 3.2] }))
  .add(interactions.pointer({ target: "golf ball" }))
  .camera(camera.follow({ targetNode: "golf ball", position: [0, 5.4, 6.2], target: [0, 0, 0], fov: 44 }));

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root.");
}

root.innerHTML = `
  <canvas id="aura-canvas" aria-label="Mini-golf 3D course"></canvas>
  <div class="hud">
    <div class="score">Score <strong id="score">0</strong></div>
    <div class="status" id="status">Ready</div>
  </div>
  <div class="game" id="game" aria-label="Click and drag to aim the mini-golf ball">
    <div class="fairway">
      <div class="stripe stripe-a"></div>
      <div class="stripe stripe-b"></div>
      <div class="cup"></div>
      <div class="obstacle"></div>
      <div class="aim" id="aim"></div>
      <div class="ball" id="ball"></div>
    </div>
  </div>
`;

createAuraApp("#aura-canvas", {
  diagnostics: false,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
  scene: miniGolfScene,
});

const css = document.createElement("style");
css.textContent = `
  :root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;
    overflow: hidden;
    background: #6aa6cf;
  }

  #app,
  #aura-canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  #aura-canvas {
    display: block;
  }

  .hud {
    position: fixed;
    top: 18px;
    left: 18px;
    z-index: 5;
    display: flex;
    gap: 10px;
    align-items: center;
    color: #f9fbf4;
    text-shadow: 0 1px 2px rgb(0 0 0 / 45%);
  }

  .score,
  .status {
    min-width: 104px;
    border: 1px solid rgb(255 255 255 / 24%);
    border-radius: 8px;
    background: rgb(13 37 33 / 72%);
    padding: 9px 12px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0;
    backdrop-filter: blur(6px);
  }

  .status {
    min-width: 88px;
    text-align: center;
    color: #ffe27a;
  }

  .game {
    position: fixed;
    left: 50%;
    bottom: -60px;
    z-index: 3;
    width: min(58vw, 520px);
    height: min(74vh, 720px);
    transform: translateX(-50%) perspective(1100px) rotateX(58deg);
    transform-origin: 50% 100%;
    filter: drop-shadow(0 26px 34px rgb(0 0 0 / 32%));
    touch-action: none;
  }

  .fairway {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 14px solid #284d36;
    border-radius: 34px 34px 24px 24px;
    background:
      radial-gradient(circle at 67% 14%, #111 0 3.2%, transparent 3.4%),
      linear-gradient(90deg, rgb(255 255 255 / 10%) 0 1.4%, transparent 1.5% 98.5%, rgb(255 255 255 / 10%) 98.6%),
      #2fa94f;
  }

  .stripe {
    position: absolute;
    inset: 5% auto 5% 50%;
    width: 3px;
    border-radius: 999px;
    background: rgb(255 255 255 / 15%);
    transform-origin: center;
  }

  .stripe-a {
    transform: translateX(-95px) rotate(-8deg);
  }

  .stripe-b {
    transform: translateX(120px) rotate(7deg);
  }

  .cup {
    position: absolute;
    left: 67%;
    top: 14%;
    width: 38px;
    aspect-ratio: 1;
    border: 4px solid rgb(255 255 255 / 36%);
    border-radius: 999px;
    background: #090d0b;
    transform: translate(-50%, -50%);
    box-shadow: inset 0 5px 14px rgb(0 0 0 / 86%);
  }

  .obstacle {
    position: absolute;
    left: 47%;
    top: 46%;
    width: 116px;
    height: 36px;
    border: 2px solid rgb(255 255 255 / 18%);
    border-radius: 6px;
    background: linear-gradient(90deg, #9b392f, #cf6152);
    transform: translate(-50%, -50%) rotate(10deg);
    box-shadow: 0 12px 18px rgb(0 0 0 / 30%);
  }

  .ball {
    position: absolute;
    left: 0;
    top: 0;
    width: 24px;
    aspect-ratio: 1;
    border-radius: 999px;
    background: radial-gradient(circle at 32% 28%, #fff 0 24%, #e9eee8 42%, #bfc8bf 100%);
    transform: translate(-50%, -50%);
    box-shadow: 0 9px 14px rgb(0 0 0 / 38%);
  }

  .aim {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 6px;
    border-radius: 999px;
    background: #f4d44d;
    transform-origin: left center;
    opacity: 0;
    box-shadow: 0 0 16px rgb(244 212 77 / 70%);
  }

  .aim::after {
    content: "";
    position: absolute;
    right: -8px;
    top: 50%;
    width: 0;
    height: 0;
    border-top: 10px solid transparent;
    border-bottom: 10px solid transparent;
    border-left: 16px solid #f4d44d;
    transform: translateY(-50%);
  }

  @media (max-width: 720px) {
    .hud {
      top: 12px;
      left: 12px;
      right: 12px;
      justify-content: space-between;
    }

    .score,
    .status {
      min-width: 86px;
      padding: 8px 10px;
      font-size: 14px;
    }

    .game {
      width: min(82vw, 440px);
      height: min(70vh, 620px);
      bottom: -42px;
    }
  }
`;
document.head.append(css);

function requireElement<TElement extends HTMLElement>(selector: string) {
  const element = document.querySelector<TElement>(selector);

  if (!element) {
    throw new Error(`Mini-golf UI failed to initialize: ${selector}`);
  }

  return element;
}

const game = requireElement<HTMLDivElement>("#game");
const fairway = requireElement<HTMLDivElement>(".fairway");
const ballElement = requireElement<HTMLDivElement>("#ball");
const aimElement = requireElement<HTMLDivElement>("#aim");
const scoreElement = requireElement<HTMLElement>("#score");
const statusElement = requireElement<HTMLElement>("#status");

let ball: Vec2 = { ...course.start };
let velocity: Vec2 = { x: 0, z: 0 };
let strokes = 0;
let aiming = false;
let sunk = false;
let aimStart = { x: 0, y: 0 };
let aimCurrent = { x: 0, y: 0 };
let lastTime = performance.now();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function speed() {
  return Math.hypot(velocity.x, velocity.z);
}

function boardPointFromCourse(point: Vec2) {
  const rect = fairway.getBoundingClientRect();
  return {
    x: ((point.x + course.width / 2) / course.width) * rect.width,
    y: ((point.z + course.length / 2) / course.length) * rect.height,
  };
}

function updateBallElement() {
  const point = boardPointFromCourse(ball);
  ballElement.style.left = `${point.x}px`;
  ballElement.style.top = `${point.y}px`;
}

function updateAimElement() {
  if (!aiming || speed() > 0.08 || sunk) {
    aimElement.style.opacity = "0";
    return;
  }

  const ballPoint = boardPointFromCourse(ball);
  const dx = aimStart.x - aimCurrent.x;
  const dy = aimStart.y - aimCurrent.y;
  const length = clamp(Math.hypot(dx, dy), 0, 130);
  const angle = Math.atan2(dy, dx);
  aimElement.style.left = `${ballPoint.x}px`;
  aimElement.style.top = `${ballPoint.y}px`;
  aimElement.style.width = `${length}px`;
  aimElement.style.transform = `rotate(${angle}rad)`;
  aimElement.style.opacity = length > 8 ? "1" : "0";
}

function resetBall() {
  ball = { ...course.start };
  velocity = { x: 0, z: 0 };
  sunk = false;
  statusElement.textContent = "Ready";
  updateBallElement();
}

function collideWithBounds() {
  const halfWidth = course.width / 2 - course.ballRadius;
  const halfLength = course.length / 2 - course.ballRadius;

  if (ball.x < -halfWidth || ball.x > halfWidth) {
    ball.x = clamp(ball.x, -halfWidth, halfWidth);
    velocity.x *= -0.62;
  }

  if (ball.z < -halfLength || ball.z > halfLength) {
    ball.z = clamp(ball.z, -halfLength, halfLength);
    velocity.z *= -0.62;
  }
}

function collideWithObstacle() {
  const obstacleHalfWidth = course.obstacle.width / 2 + course.ballRadius;
  const obstacleHalfDepth = course.obstacle.depth / 2 + course.ballRadius;
  const dx = ball.x - course.obstacle.x;
  const dz = ball.z - course.obstacle.z;

  if (Math.abs(dx) >= obstacleHalfWidth || Math.abs(dz) >= obstacleHalfDepth) {
    return;
  }

  const overlapX = obstacleHalfWidth - Math.abs(dx);
  const overlapZ = obstacleHalfDepth - Math.abs(dz);

  if (overlapX < overlapZ) {
    ball.x += Math.sign(dx || velocity.x || 1) * overlapX;
    velocity.x *= -0.72;
  } else {
    ball.z += Math.sign(dz || velocity.z || 1) * overlapZ;
    velocity.z *= -0.72;
  }
}

function checkCup() {
  const distance = Math.hypot(ball.x - course.hole.x, ball.z - course.hole.z);

  if (distance < course.hole.radius && speed() < 0.95) {
    sunk = true;
    velocity = { x: 0, z: 0 };
    ball = { ...course.hole };
    statusElement.textContent = "Holed";
    updateBallElement();
    window.setTimeout(resetBall, 950);
  }
}

function step(time: number) {
  const delta = Math.min((time - lastTime) / 1000, 0.033);
  lastTime = time;

  if (!sunk) {
    ball.x += velocity.x * delta;
    ball.z += velocity.z * delta;

    collideWithBounds();
    collideWithObstacle();

    const friction = Math.pow(0.56, delta);
    velocity.x *= friction;
    velocity.z *= friction;

    if (speed() < 0.04) {
      velocity = { x: 0, z: 0 };
      if (!aiming) {
        statusElement.textContent = "Ready";
      }
    } else {
      statusElement.textContent = "Rolling";
    }

    checkCup();
    updateBallElement();
  }

  updateAimElement();
  requestAnimationFrame(step);
}

game.addEventListener("pointerdown", (event) => {
  if (sunk || speed() > 0.08) {
    return;
  }

  game.setPointerCapture(event.pointerId);
  aiming = true;
  aimStart = { x: event.clientX, y: event.clientY };
  aimCurrent = { ...aimStart };
  statusElement.textContent = "Aiming";
  updateAimElement();
});

game.addEventListener("pointermove", (event) => {
  if (!aiming) {
    return;
  }

  aimCurrent = { x: event.clientX, y: event.clientY };
  updateAimElement();
});

game.addEventListener("pointerup", (event) => {
  if (!aiming) {
    return;
  }

  aiming = false;
  aimCurrent = { x: event.clientX, y: event.clientY };
  const dx = aimStart.x - aimCurrent.x;
  const dy = aimStart.y - aimCurrent.y;
  const power = clamp(Math.hypot(dx, dy) / 42, 0, 4.2);

  if (power > 0.15) {
    const angle = Math.atan2(dy, dx);
    velocity = {
      x: Math.cos(angle) * power,
      z: Math.sin(angle) * power,
    };
    strokes += 1;
    scoreElement.textContent = String(strokes);
    statusElement.textContent = "Rolling";
  } else {
    statusElement.textContent = "Ready";
  }

  updateAimElement();
});

game.addEventListener("pointercancel", () => {
  aiming = false;
  statusElement.textContent = "Ready";
  updateAimElement();
});

updateBallElement();
requestAnimationFrame(step);
