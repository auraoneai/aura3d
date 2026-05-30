import {
  camera,
  createAuraApp,
  interactions,
  lights,
  material,
  prefabs,
  primitives,
  scene
} from "@aura3d/engine";

type Vec2 = {
  x: number;
  z: number;
};

const course = {
  width: 5.6,
  length: 8.4,
  ballRadius: 0.18,
  start: { x: 0, z: 2.95 },
  hole: { x: 0.9, z: -3.15 },
  obstacle: { x: -0.15, z: -0.35, width: 1.05, depth: 1.2 }
};

const golfScene = scene()
  .background("#9ec7df")
  .addMany(prefabs.miniGolfHole())
  .add(
    primitives.plane({
      name: "procedural putting green",
      size: [course.width, course.length, 1],
      material: material.pbr({ color: "#2fa84f", roughness: 0.92 })
    }).rotate(-Math.PI / 2, 0, 0)
  )
  .add(
    primitives.box({
      name: "left wooden rail",
      size: [0.18, 0.28, course.length + 0.2],
      material: material.pbr({ color: "#8f5a2c", roughness: 0.75 })
    }).position(-course.width / 2 - 0.09, 0.14, 0)
  )
  .add(
    primitives.box({
      name: "right wooden rail",
      size: [0.18, 0.28, course.length + 0.2],
      material: material.pbr({ color: "#8f5a2c", roughness: 0.75 })
    }).position(course.width / 2 + 0.09, 0.14, 0)
  )
  .add(
    primitives.box({
      name: "back rail",
      size: [course.width + 0.36, 0.28, 0.18],
      material: material.pbr({ color: "#8f5a2c", roughness: 0.75 })
    }).position(0, 0.14, course.length / 2 + 0.09)
  )
  .add(
    primitives.box({
      name: "front rail with cup opening",
      size: [course.width + 0.36, 0.28, 0.18],
      material: material.pbr({ color: "#8f5a2c", roughness: 0.75 })
    }).position(0, 0.14, -course.length / 2 - 0.09)
  )
  .add(
    primitives.box({
      name: "single rectangular obstacle",
      size: [course.obstacle.width, 0.55, course.obstacle.depth],
      material: material.pbr({ color: "#f1c84b", roughness: 0.5 })
    }).position(course.obstacle.x, 0.28, course.obstacle.z)
  )
  .add(
    primitives.cylinder({
      name: "black golf cup",
      size: [0.5, 0.055, 0.5],
      material: material.pbr({ color: "#0a0d0b", roughness: 0.35 })
    }).position(course.hole.x, 0.035, course.hole.z)
  )
  .add(
    primitives.cylinder({
      name: "white cup rim",
      size: [0.64, 0.025, 0.64],
      material: material.pbr({ color: "#f7f7ef", roughness: 0.4 })
    }).position(course.hole.x, 0.055, course.hole.z)
  )
  .add(
    primitives.sphere({
      name: "ball",
      size: course.ballRadius * 2,
      material: material.clearcoat({ color: "#ffffff", roughness: 0.18, clearcoat: 1 })
    }).position(course.start.x, course.ballRadius, course.start.z)
  )
  .add(
    primitives.cylinder({
      name: "blue aim direction marker",
      size: [0.055, 1.35, 0.055],
      material: material.emissive({ color: "#2f80ff", emissive: "#2f80ff" })
    }).position(0.44, 0.13, 2.45).rotate(Math.PI / 2, 0, 0.54)
  )
  .add(
    primitives.sphere({
      name: "aim arrow head",
      size: 0.18,
      material: material.emissive({ color: "#2f80ff", emissive: "#2f80ff" })
    }).position(0.77, 0.13, 1.83)
  )
  .add(lights.ambient({ intensity: 0.55, color: "#e8fff0" }))
  .add(lights.directional({ position: [-2.5, 5, 3], intensity: 1.5, color: "#fff4d6" }))
  .add(lights.studio({ intensity: 0.65 }))
  .add(interactions.pointer({ target: "ball" }))
  .camera(
    camera.follow({
      targetNode: "ball",
      position: [0, 4.6, 6.3],
      target: [course.start.x, 0, course.start.z],
      distance: 5.2,
      fov: 47
    })
  );

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

root.innerHTML = `
  <div class="game-shell">
    <div id="aura-scene" aria-label="3D mini golf hole"></div>
    <div class="hud" aria-live="polite">
      <div class="score">Strokes <strong id="stroke-count">0</strong></div>
      <div class="status" id="shot-status">Click and drag from the ball to aim</div>
    </div>
    <div class="power-meter" aria-hidden="true">
      <span id="power-fill"></span>
    </div>
    <div id="course-overlay" class="course-overlay" aria-label="Mini golf controls">
      <div id="screen-hole" class="screen-hole"></div>
      <div id="screen-obstacle" class="screen-obstacle"></div>
      <div id="screen-ball" class="screen-ball"></div>
      <div id="aim-line" class="aim-line"></div>
      <div class="follow-chip">Follow camera locked on ball</div>
    </div>
  </div>
`;

createAuraApp("#aura-scene", {
  diagnostics: false,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
  scene: golfScene
});

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #9ec7df;
  }

  .game-shell {
    position: relative;
    width: 100%;
    height: 100%;
    color: #f8fff9;
  }

  #aura-scene {
    position: absolute;
    inset: 0;
  }

  .hud {
    position: absolute;
    top: 18px;
    left: 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 5;
    pointer-events: none;
  }

  .score,
  .status,
  .follow-chip {
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(11, 38, 24, 0.74);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(8px);
  }

  .score {
    min-width: 116px;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .score strong {
    margin-left: 8px;
    font-size: 22px;
    line-height: 1;
  }

  .status {
    max-width: min(52vw, 420px);
    padding: 11px 13px;
    border-radius: 8px;
    font-size: 14px;
  }

  .power-meter {
    position: absolute;
    left: 18px;
    bottom: 18px;
    width: min(340px, calc(100vw - 36px));
    height: 12px;
    z-index: 5;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.32);
    background: rgba(5, 26, 14, 0.58);
    pointer-events: none;
  }

  .power-meter span {
    display: block;
    width: 0%;
    height: 100%;
    background: linear-gradient(90deg, #73d13d, #ffd43b, #ff6b35);
  }

  .course-overlay {
    position: absolute;
    inset: 0;
    z-index: 4;
    cursor: crosshair;
    touch-action: none;
  }

  .screen-ball,
  .screen-hole,
  .screen-obstacle,
  .aim-line {
    position: absolute;
    transform-origin: center;
    pointer-events: none;
  }

  .screen-ball {
    width: 26px;
    height: 26px;
    margin: -13px 0 0 -13px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #ffffff 0 22%, #e9edf0 42%, #b8c0c8 100%);
    border: 1px solid rgba(30, 48, 40, 0.28);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
  }

  .screen-hole {
    width: 34px;
    height: 34px;
    margin: -17px 0 0 -17px;
    border-radius: 50%;
    background: radial-gradient(circle, #030504 0 49%, #fbfff6 51% 64%, rgba(251, 255, 246, 0.18) 65% 100%);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.24);
  }

  .screen-obstacle {
    width: 74px;
    height: 92px;
    margin: -46px 0 0 -37px;
    border-radius: 6px;
    background: rgba(241, 200, 75, 0.82);
    border: 1px solid rgba(94, 65, 9, 0.28);
    box-shadow: 0 12px 22px rgba(40, 30, 6, 0.2);
  }

  .aim-line {
    display: none;
    height: 4px;
    border-radius: 999px;
    background: #2f80ff;
    box-shadow: 0 0 18px rgba(47, 128, 255, 0.85);
  }

  .aim-line::after {
    content: "";
    position: absolute;
    right: -8px;
    top: -5px;
    border-left: 12px solid #2f80ff;
    border-top: 7px solid transparent;
    border-bottom: 7px solid transparent;
  }

  .follow-chip {
    position: absolute;
    right: 18px;
    bottom: 18px;
    z-index: 5;
    padding: 9px 11px;
    border-radius: 8px;
    font-size: 13px;
    pointer-events: none;
  }

  @media (max-width: 680px) {
    .hud {
      right: 12px;
      left: 12px;
      top: 12px;
      flex-wrap: wrap;
    }

    .score,
    .status {
      font-size: 13px;
    }

    .status {
      max-width: 100%;
    }

    .follow-chip {
      right: 12px;
      bottom: 38px;
    }
  }
`;
document.head.appendChild(style);

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Mini-golf UI missing ${selector}`);
  return element;
}

const overlay = requireElement<HTMLElement>("#course-overlay");
const ballEl = requireElement<HTMLElement>("#screen-ball");
const holeEl = requireElement<HTMLElement>("#screen-hole");
const obstacleEl = requireElement<HTMLElement>("#screen-obstacle");
const aimLine = requireElement<HTMLElement>("#aim-line");
const strokeCount = requireElement<HTMLElement>("#stroke-count");
const shotStatus = requireElement<HTMLElement>("#shot-status");
const powerFill = requireElement<HTMLElement>("#power-fill");

let ball: Vec2 = { ...course.start };
let velocity: Vec2 = { x: 0, z: 0 };
let strokes = 0;
let dragging = false;
let dragPoint = { x: 0, y: 0 };
let sunk = false;

function worldToScreen(point: Vec2): { x: number; y: number } {
  const rect = overlay.getBoundingClientRect();
  const playableWidth = Math.min(rect.width * 0.62, rect.height * 0.48);
  const playableHeight = playableWidth * (course.length / course.width);
  const centerX = rect.width * 0.5;
  const centerY = rect.height * 0.53;
  return {
    x: centerX + (point.x / course.width) * playableWidth,
    y: centerY + (point.z / course.length) * playableHeight
  };
}

function screenToWorld(point: { x: number; y: number }): Vec2 {
  const rect = overlay.getBoundingClientRect();
  const playableWidth = Math.min(rect.width * 0.62, rect.height * 0.48);
  const playableHeight = playableWidth * (course.length / course.width);
  const centerX = rect.width * 0.5;
  const centerY = rect.height * 0.53;
  return {
    x: ((point.x - centerX) / playableWidth) * course.width,
    z: ((point.y - centerY) / playableHeight) * course.length
  };
}

function renderOverlay(): void {
  const ballScreen = worldToScreen(ball);
  const holeScreen = worldToScreen(course.hole);
  const obstacleScreen = worldToScreen({ x: course.obstacle.x, z: course.obstacle.z });
  ballEl.style.left = `${ballScreen.x}px`;
  ballEl.style.top = `${ballScreen.y}px`;
  holeEl.style.left = `${holeScreen.x}px`;
  holeEl.style.top = `${holeScreen.y}px`;
  obstacleEl.style.left = `${obstacleScreen.x}px`;
  obstacleEl.style.top = `${obstacleScreen.y}px`;
}

function setAimLine(target: { x: number; y: number } | null): void {
  const ballScreen = worldToScreen(ball);
  if (!target || sunk) {
    aimLine.style.display = "none";
    powerFill.style.width = "0%";
    return;
  }

  const dx = target.x - ballScreen.x;
  const dy = target.y - ballScreen.y;
  const distance = Math.min(Math.hypot(dx, dy), 180);
  const angle = Math.atan2(dy, dx);
  aimLine.style.display = "block";
  aimLine.style.left = `${ballScreen.x}px`;
  aimLine.style.top = `${ballScreen.y}px`;
  aimLine.style.width = `${distance}px`;
  aimLine.style.transform = `rotate(${angle}rad)`;
  powerFill.style.width = `${Math.round((distance / 180) * 100)}%`;
}

function moving(): boolean {
  return Math.hypot(velocity.x, velocity.z) > 0.018;
}

function clampToRail(): void {
  const halfWidth = course.width / 2 - course.ballRadius;
  const halfLength = course.length / 2 - course.ballRadius;
  if (ball.x < -halfWidth || ball.x > halfWidth) {
    ball.x = Math.max(-halfWidth, Math.min(halfWidth, ball.x));
    velocity.x *= -0.62;
  }
  if (ball.z < -halfLength || ball.z > halfLength) {
    ball.z = Math.max(-halfLength, Math.min(halfLength, ball.z));
    velocity.z *= -0.62;
  }
}

function collideObstacle(): void {
  const halfW = course.obstacle.width / 2 + course.ballRadius;
  const halfD = course.obstacle.depth / 2 + course.ballRadius;
  const dx = ball.x - course.obstacle.x;
  const dz = ball.z - course.obstacle.z;
  if (Math.abs(dx) > halfW || Math.abs(dz) > halfD) return;

  const overlapX = halfW - Math.abs(dx);
  const overlapZ = halfD - Math.abs(dz);
  if (overlapX < overlapZ) {
    ball.x += Math.sign(dx || 1) * overlapX;
    velocity.x *= -0.72;
    velocity.z *= 0.86;
  } else {
    ball.z += Math.sign(dz || 1) * overlapZ;
    velocity.z *= -0.72;
    velocity.x *= 0.86;
  }
}

function updatePhysics(): void {
  if (sunk) return;

  ball.x += velocity.x;
  ball.z += velocity.z;
  velocity.x *= 0.982;
  velocity.z *= 0.982;

  clampToRail();
  collideObstacle();

  const holeDistance = Math.hypot(ball.x - course.hole.x, ball.z - course.hole.z);
  if (holeDistance < 0.31 && Math.hypot(velocity.x, velocity.z) < 0.12) {
    ball = { ...course.hole };
    velocity = { x: 0, z: 0 };
    sunk = true;
    shotStatus.textContent = `Holed in ${strokes} ${strokes === 1 ? "stroke" : "strokes"}`;
    ballEl.style.transform = "scale(0.68)";
  } else if (!moving()) {
    velocity = { x: 0, z: 0 };
    if (!dragging) shotStatus.textContent = "Click and drag from the ball to aim";
  }
}

function animationLoop(): void {
  updatePhysics();
  renderOverlay();
  if (dragging) setAimLine(dragPoint);
  requestAnimationFrame(animationLoop);
}

overlay.addEventListener("pointerdown", (event) => {
  if (sunk || moving()) return;
  const ballScreen = worldToScreen(ball);
  const distance = Math.hypot(event.clientX - ballScreen.x, event.clientY - ballScreen.y);
  if (distance > 90) return;
  dragging = true;
  dragPoint = { x: event.clientX, y: event.clientY };
  overlay.setPointerCapture(event.pointerId);
  shotStatus.textContent = "Release to shoot";
  setAimLine(dragPoint);
});

overlay.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  dragPoint = { x: event.clientX, y: event.clientY };
  setAimLine(dragPoint);
});

overlay.addEventListener("pointerup", (event) => {
  if (!dragging) return;
  dragging = false;
  overlay.releasePointerCapture(event.pointerId);
  const aimWorld = screenToWorld(dragPoint);
  const dx = ball.x - aimWorld.x;
  const dz = ball.z - aimWorld.z;
  const force = Math.min(Math.hypot(dx, dz), 2.6) * 0.055;
  if (force > 0.014) {
    const length = Math.hypot(dx, dz) || 1;
    velocity = { x: (dx / length) * force, z: (dz / length) * force };
    strokes += 1;
    strokeCount.textContent = String(strokes);
    shotStatus.textContent = "Ball rolling";
  }
  setAimLine(null);
});

overlay.addEventListener("pointercancel", () => {
  dragging = false;
  setAimLine(null);
});

window.addEventListener("resize", renderOverlay);
renderOverlay();
animationLoop();
