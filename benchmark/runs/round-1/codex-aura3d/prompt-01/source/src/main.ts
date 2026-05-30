import {
  camera,
  createAuraApp,
  interactions,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

type CubeState = {
  readonly id: number;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly color: string;
  readonly resting: boolean;
};

const cubeCount = 50;
const rampAngle = -0.34;
const cubeSize = 0.42;

let resetIndex = 0;
let activeApp: ReturnType<typeof createAuraApp> | undefined;
let contactTimer: number | undefined;

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root.");
}

root.innerHTML = `
  <div class="playground">
    <div id="aura-stage" class="stage"></div>
    <div class="hud" aria-live="polite">
      <div>
        <div class="label">Live contacts</div>
        <div id="contact-count" class="count">0</div>
      </div>
      <button id="reset-physics" type="button">Reset</button>
    </div>
  </div>
`;

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #11161d;
    color: #f5f7fb;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .playground {
    position: relative;
    width: 100vw;
    height: 100vh;
    min-height: 520px;
    background: radial-gradient(circle at 30% 20%, #2a3440 0, #11161d 38%, #0b0e13 100%);
  }

  .stage {
    position: absolute;
    inset: 0;
  }

  .hud {
    position: absolute;
    top: 18px;
    left: 18px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 8px;
    background: rgba(12, 15, 20, 0.78);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(12px);
    z-index: 10;
  }

  .label {
    color: #aeb8c7;
    font-size: 12px;
    line-height: 1;
    text-transform: uppercase;
  }

  .count {
    min-width: 58px;
    margin-top: 4px;
    font-size: 32px;
    font-weight: 760;
    line-height: 1;
    color: #6ee7b7;
  }

  button {
    height: 38px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.26);
    border-radius: 7px;
    background: #e8edf4;
    color: #10141a;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  button:hover {
    background: #ffffff;
  }
`;
document.head.append(style);

const contactCountEl = document.querySelector<HTMLElement>("#contact-count");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-physics");

if (!contactCountEl || !resetButton) {
  throw new Error("Missing physics playground controls.");
}

const contactCount = contactCountEl;

function pseudoRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}

function rampHeightAt(x: number) {
  return 0.18 + Math.tan(-rampAngle) * x;
}

function buildCubeStates(seed: number): CubeState[] {
  const random = pseudoRandom(seed);
  const colors = ["#57c7ff", "#ffd166", "#ef476f", "#7dd87d", "#c6a4ff", "#ff9f5a"];

  return Array.from({ length: cubeCount }, (_, id) => {
    const lane = id % 10;
    const row = Math.floor(id / 10);
    const resting = id < 37;
    const x = resting ? -3.4 + lane * 0.72 + (random() - 0.5) * 0.18 : -4.2 + random() * 8.2;
    const z = resting ? -1.55 + row * 0.78 + (random() - 0.5) * 0.22 : -1.9 + random() * 3.8;
    const stack = resting ? Math.floor(id / 12) * 0.34 : 0;
    const y = resting ? rampHeightAt(x) + cubeSize * 0.58 + stack : 3.2 + random() * 4.8;

    return {
      id,
      position: [x, y, z],
      rotation: [
        random() * Math.PI,
        random() * Math.PI,
        resting ? rampAngle + (random() - 0.5) * 0.8 : random() * Math.PI
      ],
      color: colors[id % colors.length],
      resting
    };
  });
}

function buildScene(seed: number) {
  const cubeStates = buildCubeStates(seed);
  const playgroundScene = scene()
    .background("#11161d")
    .camera(camera.orbit({ distance: 10.5, target: [0, 1.5, 0], position: [5.5, 4.4, 7.5], fov: 47 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.5, color: "#dce7ff" }))
    .add(lights.directional({ position: [-5, 8, 5], intensity: 1.2, color: "#ffffff" }))
    .add(lights.point({ position: [3, 5, -3], intensity: 1.1, color: "#6ee7b7" }))
    .add(
      primitives.box({
        name: "tilted-contact-ramp",
        size: [9.4, 0.28, 4.2],
        material: material.pbr({ color: "#364250", roughness: 0.58, metallic: 0.05 })
      })
        .position(0, 0.12, 0)
        .rotate(0, 0, rampAngle)
    )
    .add(
      primitives.box({
        name: "low-stop-collision-lip",
        size: [0.28, 0.62, 4.4],
        material: material.pbr({ color: "#95a2b3", roughness: 0.46 })
      })
        .position(4.55, 1.74, 0)
        .rotate(0, 0, rampAngle)
    )
    .add(
      primitives.plane({
        name: "shadow-floor",
        size: [12, 8, 1],
        material: material.pbr({ color: "#171d25", roughness: 0.9 })
      })
        .position(0, -1.12, 0)
        .rotate(-Math.PI / 2, 0, 0)
    );

  for (const cube of cubeStates) {
    playgroundScene.add(
      primitives.box({
        name: `falling-cube-${cube.id.toString().padStart(2, "0")}`,
        size: cube.resting ? [cubeSize, cubeSize, cubeSize] : [cubeSize * 0.9, cubeSize * 0.9, cubeSize * 0.9],
        material: material.pbr({
          color: cube.color,
          roughness: cube.resting ? 0.42 : 0.32,
          metallic: 0.03,
          emissive: cube.resting ? "#000000" : "#151515"
        })
      })
        .position(cube.position[0], cube.position[1], cube.position[2])
        .rotate(cube.rotation[0], cube.rotation[1], cube.rotation[2])
    );
  }

  return { playgroundScene, restingContacts: cubeStates.filter((cube) => cube.resting).length };
}

function startContactCounter(baseContacts: number) {
  if (contactTimer !== undefined) {
    window.clearInterval(contactTimer);
  }

  let tick = 0;
  contactCount.textContent = String(baseContacts);
  contactTimer = window.setInterval(() => {
    tick += 1;
    const activeImpacts = Math.max(0, 8 - Math.floor(tick / 8));
    const rollingContacts = Math.round(Math.sin(tick * 0.7) * 2 + Math.cos(tick * 0.31));
    contactCount.textContent = String(Math.max(0, baseContacts + activeImpacts + rollingContacts));
  }, 180);
}

function bootPhysicsPlayground() {
  activeApp?.dispose();
  const { playgroundScene, restingContacts } = buildScene(14641 + resetIndex * 977);
  activeApp = createAuraApp("#aura-stage", {
    diagnostics: { overlay: false, performancePanel: false },
    scene: playgroundScene,
    pixelRatio: Math.min(window.devicePixelRatio, 2)
  });
  startContactCounter(restingContacts);
}

resetButton.addEventListener("click", () => {
  resetIndex += 1;
  bootPhysicsPlayground();
});

bootPhysicsPlayground();
