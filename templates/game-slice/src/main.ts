import { AnimationClip, AnimationMixer, AnimationTrack } from "@aura3d/animation";
import { InputSystem } from "@aura3d/input";
import { PhysicsWorld, Shape } from "@aura3d/physics";
import { Geometry, PBRMaterial, Renderer, UnlitMaterial, type RenderItem } from "@aura3d/rendering";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing app root.");

root.innerHTML = `
  <main class="shell">
    <canvas width="960" height="540" tabindex="0"></canvas>
    <section>
      <h1>Game Slice</h1>
      <p>Click or press Space in the viewport to jump.</p>
      <pre data-status>booting</pre>
    </section>
  </main>
`;

installStyles();

const canvas = root.querySelector<HTMLCanvasElement>("canvas");
const status = root.querySelector<HTMLElement>("[data-status]");
if (!canvas || !status) throw new Error("Template shell failed to initialize.");

let renderer: Renderer;
const input = new InputSystem(canvas);
const physics = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 3 });
const player = physics.createRigidBody({ position: [0, 0.2, 0], velocity: [0.16, 0, 0] });
physics.createCollider(player, { shape: Shape.box(0.24, 0.24, 0.24), restitution: 0.08 });

const mixer = new AnimationMixer();
mixer.play(
  new AnimationClip({
    name: "pickup-pulse",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "pickup.scale",
        valueType: "scalar",
        keyframes: [
          { time: 0, value: 0.72 },
          { time: 0.5, value: 1.1 },
          { time: 1, value: 0.72 },
        ],
      }),
    ],
  }),
);

let interactions = 0;
let lastFrame: number | undefined;

canvas.addEventListener("pointerdown", jump);

function jump(): void {
  interactions += 1;
  player.velocity[1] = 1.8;
}

function frame(time: number): void {
  const elapsedMs = lastFrame === undefined ? 16.67 : Math.max(1, time - lastFrame);
  const dt = Math.min(1 / 30, elapsedMs / 1000);
  lastFrame = time;

  const snapshot = input.update();
  if (snapshot.keys.has("Space")) jump();
  input.endFrame();
  physics.step(dt);
  mixer.update(dt);

  const pickupScale = Number(mixer.getValue("pickup.scale") ?? 1);
  const diagnostics = renderer.render(createRenderItems(player.position[0], pickupScale));
  status.textContent = JSON.stringify(
    {
      template: "game-slice",
      interactions,
      drawCalls: diagnostics.drawCalls,
      physicsBodies: physics.snapshot().stats.bodies,
      publicRuntime: ["@aura3d/rendering", "@aura3d/input", "@aura3d/physics", "@aura3d/animation"],
    },
    null,
    2,
  );

  requestAnimationFrame(frame);
}

void boot();
window.addEventListener("beforeunload", () => {
  input.dispose();
  renderer?.dispose();
});

async function boot(): Promise<void> {
  renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.014, 0.02, 0.028, 1],
    preserveDrawingBuffer: true,
  });
  requestAnimationFrame(frame);
}

function createRenderItems(playerX: number, pickupScale: number): RenderItem[] {
  return [
    {
      geometry: Geometry.litCube(0.48),
      material: new PBRMaterial({
        name: "player",
        baseColor: [0.2, 0.76, 1, 1],
        roughness: 0.34,
        metallic: 0.18,
        emissiveColor: [0.02, 0.18, 0.36],
        emissiveStrength: 1,
        renderState: { cullMode: "none" },
      }),
      label: `player-${playerX.toFixed(2)}`,
    },
    {
      geometry: Geometry.uvSphere(0.26 * pickupScale, 16, 8),
      material: new PBRMaterial({
        name: "pickup",
        baseColor: [1, 0.76, 0.22, 1],
        roughness: 0.26,
        metallic: 0.2,
        emissiveColor: [0.9, 0.5, 0.08],
        emissiveStrength: 1.4,
        renderState: { cullMode: "none" },
      }),
      label: "animated-pickup",
    },
    {
      geometry: Geometry.lineSegments([
        [-0.9, -0.74, 0],
        [0.9, -0.74, 0],
      ]),
      material: new UnlitMaterial({ name: "floor", color: [0.65, 0.78, 0.88, 1] }),
      label: "floor",
    },
  ];
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #0f151c; color: #edf4f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; }
    canvas { width: 100%; height: 100vh; display: block; background: #0d131a; outline: none; }
    section { border-left: 1px solid #2a3842; background: #151e25; padding: 1.25rem; display: grid; align-content: start; gap: 1rem; }
    h1, p { margin: 0; }
    p { color: #bbcad4; }
    pre { margin: 0; white-space: pre-wrap; color: #b8e4b3; font-size: 0.78rem; line-height: 1.4; }
    @media (max-width: 780px) { .shell { grid-template-columns: 1fr; } canvas { height: 64vh; } section { border-left: 0; border-top: 1px solid #2a3842; } }
  `;
  document.head.append(style);
}
