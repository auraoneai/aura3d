import { AnimationClip, AnimationMixer, AnimationTrack } from "@galileo3d/animation";
import { AudioSystem } from "@galileo3d/audio";
import { InputSnapshot, InputSystem } from "@galileo3d/input";
import { PhysicsWorld, Shape } from "@galileo3d/physics";
import { Geometry, PBRMaterial, ParticleEmitter, ParticleSystem, Renderer, UnlitMaterial, type RenderDeviceDiagnostics, type RenderItem } from "@galileo3d/rendering";
import { Scene } from "@galileo3d/scene";

type DemoStatus = {
  id: string;
  status: "ready" | "error";
  renderer: "webgl2";
  interactions: number;
  metrics: Record<string, number | string | boolean>;
  diagnostics?: RenderDeviceDiagnostics;
  error?: string;
};

declare global {
  interface Window {
    __GALILEO3D_GAME_DEMO__?: DemoStatus;
  }
}

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_GAME_DEMO__ = {
      id: "game-slice",
      status: "error",
      renderer: "webgl2",
      interactions: 0,
      metrics: {},
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { canvas, status } = createShell();
  const resize = () => resizeCanvas(canvas);
  resize();
  window.addEventListener("resize", resize);

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.014, 0.02, 0.028, 1],
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const input = new InputSystem(canvas);
  const audio = new AudioSystem();
  const physics = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 3 });
  const ground = physics.createRigidBody({ type: "static", position: [0, -0.72, 0] });
  physics.createCollider(ground, { shape: Shape.plane([0, 1, 0], -0.72) });
  const player = physics.createRigidBody({ position: [0, 0.2, 0], velocity: [0.12, 0, 0] });
  physics.createCollider(player, { shape: Shape.box(0.24, 0.24, 0.24), restitution: 0.08 });

  const particles = new ParticleSystem({
    maxParticles: 400,
    emitters: [
      new ParticleEmitter({
        seed: 908,
        emissionRate: 80,
        lifetime: { min: 0.7, max: 1.2 },
        speed: { min: 0.12, max: 0.42 },
        shape: { type: "sphere", radius: 0.2 },
        initial: { size: 0.04 },
      }),
    ],
  });

  const mixer = new AnimationMixer();
  mixer.play(new AnimationClip({
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
  }));

  let interactions = 0;
  let lastFrame: number | undefined;
  let frameMs = 0;
  let diagnostics: RenderDeviceDiagnostics | undefined;
  let running = true;
  const scene = createLitScene(canvas);
  canvas.addEventListener("pointerdown", () => {
    interactions += 1;
    player.velocity[1] = 1.8;
  });

  const render = (time: number) => {
    if (!running) return;
    const elapsedMs = lastFrame === undefined ? 16.67 : Math.max(1, time - lastFrame);
    const dt = Math.min(1 / 30, elapsedMs / 1000);
    frameMs = frameMs * 0.85 + elapsedMs * 0.15;
    lastFrame = time;

    const snapshot = input.update();
    if (snapshot.keys.has("Space")) {
      interactions += 1;
      player.velocity[1] = 1.8;
    }
    input.endFrame();
    physics.step(dt);
    particles.update(dt);
    mixer.update(dt);

    const pickupScale = Number((mixer.getValue("pickup.scale") ?? 1));
    renderer.resize(canvas.width, canvas.height);
    diagnostics = renderer.render({ scene, renderItems: buildRenderItems(player.position[0], pickupScale) });

    window.__GALILEO3D_GAME_DEMO__ = {
      id: "game-slice",
      status: "ready",
      renderer: "webgl2",
      interactions,
      diagnostics,
      metrics: {
        frameMs: Number(frameMs.toFixed(2)),
        drawCalls: diagnostics.drawCalls,
        physicsBodies: physics.snapshot().stats.bodies,
        liveParticles: particles.getStats().liveCount,
        audioState: audio.contextManager.state,
        inputSnapshot: snapshot instanceof InputSnapshot,
        rendererBacked: true,
      },
    };
    status.textContent = JSON.stringify(window.__GALILEO3D_GAME_DEMO__, null, 2);
    if (running) requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
  window.addEventListener("pagehide", () => {
    running = false;
    window.removeEventListener("resize", resize);
    input.dispose();
    void audio.dispose();
    renderer.dispose();
  }, { once: true });
}

function buildRenderItems(playerX: number, pickupScale: number): RenderItem[] {
  return [
    {
      geometry: Geometry.litCube(0.48),
      material: new PBRMaterial({ name: "player", baseColor: [0.2, 0.76, 1, 1], roughness: 0.34, metallic: 0.18, emissiveColor: [0.02, 0.18, 0.36], emissiveStrength: 1.0, renderState: { cullMode: "none" } }),
      modelMatrix: modelMatrix(Math.max(-0.55, Math.min(0.55, playerX * 0.45)), -0.1, 0, 0.55, 0.55, 0.55),
      label: `player-${playerX.toFixed(2)}`,
    },
    {
      geometry: Geometry.uvSphere(0.26 * pickupScale, 16, 8),
      material: new PBRMaterial({ name: "pickup", baseColor: [1, 0.76, 0.22, 1], roughness: 0.26, metallic: 0.2, emissiveColor: [0.9, 0.5, 0.08], emissiveStrength: 1.4, renderState: { cullMode: "none" } }),
      modelMatrix: modelMatrix(0.48, 0.22, 0, 1, 1, 1),
      label: "animated-pickup",
    },
    {
      geometry: Geometry.points([
        [-0.55, -0.3, 0],
        [-0.25, -0.18, 0],
        [0.15, -0.28, 0],
        [0.48, -0.18, 0],
      ]),
      material: new UnlitMaterial({ name: "particle-sparks", color: [1, 0.34, 0.62, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
      label: "particle-sparks",
    },
    {
      geometry: Geometry.lineSegments([
        [-0.9, -0.74, 0],
        [0.9, -0.74, 0],
      ]),
      material: new UnlitMaterial({ name: "arena-floor", color: [0.65, 0.78, 0.88, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
      label: "arena-floor",
    },
  ];
}

function createLitScene(canvas: HTMLCanvasElement): Scene {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "game-camera", fovYRadians: Math.PI / 4, aspect: canvas.width / canvas.height, near: 0.1, far: 24 });
  camera.transform.setPosition(0, 0, 4.6);
  scene.root.addChild(camera);
  const key = scene.createLight("directional", "game-key");
  key.intensity = 2.5;
  key.color = [1, 0.92, 0.75];
  scene.root.addChild(key);
  const fill = scene.createLight("point", "game-fill");
  fill.intensity = 1.8;
  fill.range = 8;
  fill.color = [0.3, 0.78, 1];
  fill.transform.setPosition(-1.8, 1.3, 2.6);
  scene.root.addChild(fill);
  return scene;
}

function modelMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1,
  ]);
}

function createShell(): { canvas: HTMLCanvasElement; status: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "game-demo-shell";
  shell.innerHTML = `
    <canvas data-testid="game-slice-canvas" width="960" height="540" tabindex="0"></canvas>
    <section>
      <h1>Game Slice</h1>
      <p>Click or press Space in the viewport to jump.</p>
      <pre data-testid="game-slice-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return { canvas: shell.querySelector("canvas")!, status: shell.querySelector("pre")! };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #0f151c; color: #edf4f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .game-demo-shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; }
    canvas { width: 100%; height: 100vh; display: block; background: #0d131a; outline: none; }
    section { border-left: 1px solid #2a3842; background: #151e25; padding: 1.25rem; display: grid; align-content: start; gap: 1rem; }
    h1, p { margin: 0; }
    p { color: #bbcad4; }
    pre { margin: 0; white-space: pre-wrap; color: #b8e4b3; font-size: 0.78rem; line-height: 1.4; }
    @media (max-width: 780px) { .game-demo-shell { grid-template-columns: 1fr; } canvas { height: 64vh; } section { border-left: 0; border-top: 1px solid #2a3842; } }
  `;
  document.head.append(style);
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
  const height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}
