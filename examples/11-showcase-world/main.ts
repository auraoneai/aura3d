import { AnimationClip, AnimationMixer, AnimationTrack, type AnimationValue } from "@aura3d/animation";
import { AssetManager, GLTFLoader } from "@aura3d/assets";
import { AudioListener, AudioSystem } from "@aura3d/audio";
import { EditorRuntime, TransformCommand, type TransformLike } from "@aura3d/editor";
import { FirstPersonControls, InputSnapshot, InputSystem, OrbitControls, type CameraTransformLike, type Vec3Like } from "@aura3d/input";
import { PhysicsWorld, Shape } from "@aura3d/physics";
import {
  Geometry,
  InstancedPBRMaterial,
  NormalMappedPBRMaterial,
  PBRMaterial,
  ParticleEmitter,
  ParticleSystem,
  Renderer,
  Sampler,
  Texture,
  TexturedUnlitMaterial,
  UnlitMaterial,
  type RenderDeviceDiagnostics,
  type RenderItem,
} from "@aura3d/rendering";
import { PointLight, Scene, SpotLight } from "@aura3d/scene";

type MutableMetrics = Record<string, string | number | boolean>;

declare global {
  interface Window {
    __AURA3D_EXAMPLE__?: {
      id: string;
      status: "ready" | "error";
      renderer: "webgl2";
      acceptance: string;
      visualClaim: string;
      knownLimits: readonly string[];
      errors: readonly string[];
      diagnostics?: RenderDeviceDiagnostics;
      metrics?: MutableMetrics;
      error?: string;
    };
  }
}

const metadata = {
  id: "11-showcase-world",
  title: "Aura3D WebGL Showcase",
  purpose: "A real WebGL2 renderer scene that combines the current public engine stack.",
  acceptance: "Rendering, scene, physics, animation, glTF, input, audio, editor, and particle metrics are visible and ready.",
};

const displayStats = [
  ["Renderer", "WebGL2"],
  ["Scene", "Lights + materials"],
  ["Simulation", "Physics + particles"],
  ["Runtime", "Input + audio + editor"],
];

const knownLimits = [
  "This is a combined bounded WebGL2 proof scene, not a flagship production visual demo.",
  "It uses generated and inline assets for subsystem evidence and does not prove broad Three.js superiority.",
  "Unity/Unreal-style authoring, production asset workflows, and full renderer parity remain gated elsewhere in v3 docs.",
] as const;

if (typeof document !== "undefined") {
  void runShowcase().catch((error) => {
    window.__AURA3D_EXAMPLE__ = {
      id: metadata.id,
      status: "error",
      renderer: "webgl2",
      acceptance: metadata.acceptance,
      visualClaim: metadata.purpose,
      knownLimits,
      errors: [error instanceof Error ? error.message : String(error)],
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    throw error;
  });
}

async function runShowcase(): Promise<void> {
  installShowcaseStyles();
  const { canvas, statusPanel, statsPanel } = createShowcaseShell();
  const resize = () => resizeCanvasToDisplay(canvas);
  resize();
  window.addEventListener("resize", resize);

  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "showcase-camera", aspect: canvas.width / canvas.height, fovYRadians: Math.PI / 4, near: 0.1, far: 30 });
  camera.transform.setPosition(0, 0, 5.2);
  scene.root.addChild(camera);
  const sun = scene.createLight("directional", "showcase-sun");
  sun.intensity = 1.9;
  sun.color = [1, 0.95, 0.86];
  sun.transform.setRotation(0.35, 0.9, 0, 1);
  scene.root.addChild(sun);

  const point = scene.createLight("point", "cyan-energy") as PointLight;
  point.intensity = 2.8;
  point.color = [0.2, 0.75, 1];
  point.range = 4;
  point.transform.setPosition(-0.65, 0.2, 0.8);
  scene.root.addChild(point);

  const spot = scene.createLight("spot", "magenta-spot") as SpotLight;
  spot.intensity = 1.8;
  spot.color = [1, 0.35, 0.72];
  spot.range = 3;
  spot.angle = Math.PI / 4;
  spot.penumbra = 0.25;
  spot.transform.setPosition(0.55, 0.3, 1);
  scene.root.addChild(spot);

  const physics = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 4 });
  const ground = physics.createRigidBody({ type: "static", position: [0, 0, 0] });
  physics.createCollider(ground, { shape: Shape.plane([0, 1, 0], 0), friction: 0.8 });
  const physicsBodies = Array.from({ length: 8 }, (_, index) => {
    const body = physics.createRigidBody({
      position: [Math.sin(index * 1.3) * 0.18, 1.15 + index * 0.5, Math.cos(index) * 0.08],
      restitution: 0.1,
      friction: 0.62,
    });
    physics.createCollider(body, { shape: Shape.box(0.28, 0.28, 0.28) });
    return body;
  });
  for (let step = 0; step < 90; step += 1) physics.step();

  const animationValues = new Map<string, AnimationValue>();
  const mixer = new AnimationMixer({ setAnimationValue: (target, value) => animationValues.set(target, value) });
  mixer.play(new AnimationClip({
    name: "hero-orbit",
    duration: 3.2,
    tracks: [
      new AnimationTrack({
        target: "hero.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [-0.22, 0.08, 0] },
          { time: 1.6, value: [0.22, 0.24, 0] },
          { time: 3.2, value: [-0.22, 0.08, 0] },
        ],
      }),
    ],
  }));

  const particles = new ParticleSystem({
    maxParticles: 1200,
    emitters: [
      new ParticleEmitter({
        seed: 7311,
        emissionRate: 120,
        lifetime: { min: 1.1, max: 2.1 },
        speed: { min: 0.12, max: 0.55 },
        shape: { type: "box", center: { y: 0.08 }, size: { x: 0.55, y: 0.08, z: 0.25 } },
        initial: { size: 0.08 },
      }),
    ],
  });

  const assets = new AssetManager();
  assets.register(new GLTFLoader());
  const gltfHandle = await assets.load(createInlineGltfDataUri());
  const gltfMesh = gltfHandle.value.meshes[0];

  const input = new InputSystem(canvas);
  const orbitCamera: CameraTransformLike = {
    position: { x: 0, y: 2.5, z: 6 },
    target: { x: 0, y: 0, z: 0 },
    lookAt(target: Vec3Like) {
      this.target = { ...target };
    },
  } as CameraTransformLike & { target: Vec3Like };
  const orbit = new OrbitControls(orbitCamera, { distance: 6, target: { x: 0, y: 0, z: 0 } });
  const firstPersonCamera: CameraTransformLike = { position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
  const firstPerson = new FirstPersonControls(firstPersonCamera, { moveSpeed: 1.5 });

  const audio = new AudioSystem();
  const listener = new AudioListener();
  listener.setTransform({ x: 0, y: 1.6, z: 4 });

  const editor = new EditorRuntime();
  const editable: TransformLike = { position: { x: -0.2, y: 0.15, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  editor.selection.set(["hero", "gltf-asset"]);
  await editor.executeCommand(new TransformCommand(editable, { position: { x: -0.05, y: 0.25, z: 0 }, scale: { x: 1.08, y: 1.08, z: 1 } }));

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.018, 0.024, 0.035, 1],
    antialias: true,
    preserveDrawingBuffer: true,
  });

  const material = {
    hero: new PBRMaterial({
      name: "iridescent-hero",
      baseColor: [1, 0.72, 0.24, 1],
      metallic: 0.35,
      roughness: 0.26,
      emissiveColor: [0.85, 0.44, 0.08],
      emissiveStrength: 2.1,
      renderState: { cullMode: "none" },
    }),
    metal: new PBRMaterial({
      name: "brushed-cobalt-metal",
      baseColor: [0.16, 0.58, 1, 1],
      metallic: 0.7,
      roughness: 0.26,
      clearcoatFactor: 0.55,
      emissiveColor: [0.02, 0.16, 0.38],
      emissiveStrength: 1.25,
      renderState: { cullMode: "none" },
    }),
    swarm: new InstancedPBRMaterial({
      name: "instanced-energy-cubes",
      baseColor: [0.12, 0.72, 1, 1],
      roughness: 0.42,
      metallic: 0.15,
      emissiveColor: [0.05, 0.34, 0.45],
      emissiveStrength: 1.1,
      renderState: { cullMode: "none" },
    }),
    normal: new NormalMappedPBRMaterial({
      name: "normal-mapped-reactor",
      baseColor: [0.52, 0.6, 0.95, 1],
      roughness: 0.32,
      metallic: 0.2,
      emissiveColor: [0.05, 0.28, 0.9],
      emissiveStrength: 1.6,
      normalScale: 1,
      normalTexture: createNormalMapTexture(),
      normalSampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }),
      renderState: { cullMode: "none" },
    }),
    gltf: new TexturedUnlitMaterial({
      name: "inline-gltf-texture",
      texture: createCheckerTexture(),
      sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }),
      color: [1, 1, 1, 1],
      renderState: { cullMode: "none" },
    }),
    grid: new UnlitMaterial({
      name: "horizon-lines",
      color: [0.16, 0.86, 1, 1],
      renderState: { depthTest: false, depthWrite: false, cullMode: "none" },
    }),
    particles: new UnlitMaterial({
      name: "particle-points",
      color: [1, 0.38, 0.78, 1],
      renderState: { depthTest: false, depthWrite: false, cullMode: "none" },
    }),
  };

  const metrics: MutableMetrics = {
    sceneNodes: countSceneNodes(scene),
    lights: scene.collectLights().length,
    renderItems: 7,
    physicsBodies: physics.snapshot().stats.bodies,
    gltfMeshes: gltfHandle.value.meshes.length,
    gltfVertices: gltfMesh?.positions.length ?? 0,
    audioState: audio.contextManager.state,
    selected: editor.selection.current().join(","),
    canUndo: editor.history.canUndo,
    orbitControl: true,
    firstPersonControl: true,
    webgl2: true,
  };

  let diagnostics: RenderDeviceDiagnostics | undefined;
  let lastParticleGeometry: Geometry | undefined;
  let disposed = false;

  function frame(timeMs: number): void {
    if (disposed) return;
    resize();
    renderer.resize(canvas.width, canvas.height);

    const time = timeMs / 1000;
    const snapshot = input.update();
    orbit.update(snapshot);
    firstPerson.update(new InputSnapshot({ keys: new Set(["KeyW"]) }), 1 / 60);
    input.endFrame();
    mixer.update(1 / 60);
    physics.step();
    particles.update(1 / 60);

    const aspectCompensation = canvas.height / canvas.width;
    material.hero.setParameter("u_modelViewProjection", modelMatrix({
      translate: [-0.18, -0.03, 0],
      rotate: [0, 0, 0],
      scale: [0.62 * aspectCompensation, 0.62, 0.62],
    }));
    material.hero.setParameter("u_normalMatrix", normalMatrix(0, 0, 0));

    material.metal.setParameter("u_modelViewProjection", modelMatrix({
      translate: [0.54, -0.08, 0],
      rotate: [0.48, time * -0.54, 0.22],
      scale: [0.38, 0.38, 0.38],
    }));
    material.metal.setParameter("u_normalMatrix", normalMatrix(0.48, time * -0.54, 0.22));

    material.normal.setParameter("u_modelViewProjection", modelMatrix({
      translate: [0.77, -0.48, 0],
      rotate: [0.54, time * -0.78, 0.12],
      scale: [0.24, 0.24, 0.24],
    }));
    material.normal.setParameter("u_normalMatrix", normalMatrix(0.54, time * -0.78, 0.12));

    material.gltf.setParameter("u_modelViewProjection", modelMatrix({
      translate: [-0.78, -0.56, 0],
      rotate: [0.22, time * 0.55, 0.08],
      scale: [0.22, 0.22, 0.22],
    }));

    const particleGeometry = createParticlePointGeometry(particles);
    lastParticleGeometry?.dispose();
    lastParticleGeometry = particleGeometry;

    const renderItems: RenderItem[] = [
      {
        geometry: Geometry.lineSegments(createHorizonLines(time)),
        material: material.grid,
        label: "animated-horizon-grid",
      },
      {
        geometry: Geometry.litCube(1),
        material: material.metal,
        modelMatrix: modelMatrix({
          translate: [0.54, -0.08, 0],
          rotate: [0.48, time * -0.54, 0.22],
          scale: [0.38, 0.38, 0.38],
        }),
        normalMatrix: normalMatrix(0.48, time * -0.54, 0.22),
        label: "metallic-pbr-cube",
      },
      {
        geometry: Geometry.texturedCube(1),
        material: material.normal,
        modelMatrix: modelMatrix({
          translate: [0.77, -0.48, 0],
          rotate: [0.54, time * -0.78, 0.12],
          scale: [0.24, 0.24, 0.24],
        }),
        normalMatrix: normalMatrix(0.54, time * -0.78, 0.12),
        label: "normal-mapped-pbr-reactor",
      },
      {
        geometry: Geometry.litCube(1),
        material: material.swarm,
        modelMatrix: modelMatrix({
          translate: [0, 0, 0],
          rotate: [0, 0, 0],
          scale: [1, 1, 1],
        }),
        instanceTransforms: createPhysicsInstanceMatrices(physicsBodies, time),
        label: "physics-instanced-pbr-cubes",
      },
      {
        geometry: Geometry.texturedCube(1),
        material: material.gltf,
        modelMatrix: modelMatrix({
          translate: [-0.78, -0.56, 0],
          rotate: [0.22, time * 0.55, 0.08],
          scale: [0.22, 0.22, 0.22],
        }),
        label: "inline-gltf-textured-cube",
      },
      {
        geometry: particleGeometry,
        material: material.particles,
        label: "webgl-particle-points",
      },
      {
        geometry: Geometry.uvSphere(0.74, 64, 32),
        material: material.hero,
        modelMatrix: modelMatrix({
          translate: [-0.18, -0.03, 0],
          rotate: [0, 0, 0],
          scale: [0.62 * aspectCompensation, 0.62, 0.62],
        }),
        normalMatrix: normalMatrix(0, 0, 0),
        label: "high-resolution-pbr-sphere",
      },
    ];

    diagnostics = renderer.render({ scene, renderItems });
    for (const item of renderItems) {
      if (item.geometry !== particleGeometry) item.geometry.dispose();
    }

    const state = {
      id: metadata.id,
      status: "ready" as const,
      renderer: "webgl2" as const,
      acceptance: metadata.acceptance,
      visualClaim: metadata.purpose,
      knownLimits,
      errors: [],
      diagnostics,
      metrics: {
        ...metrics,
        liveParticles: particles.getStats().liveCount,
        particleUploads: particles.getStats().uploadedBytes,
        firstPersonZ: Number(firstPersonCamera.position.z.toFixed(2)),
      },
    };
    window.__AURA3D_EXAMPLE__ = state;
    updatePanels(statusPanel, statsPanel, state.metrics, diagnostics);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.addEventListener("beforeunload", () => {
    disposed = true;
    window.removeEventListener("resize", resize);
    lastParticleGeometry?.dispose();
    renderer.dispose();
    orbit.dispose();
    firstPerson.dispose();
    input.dispose();
    editor.dispose();
    void audio.dispose();
    void assets.release(gltfHandle);
  });
}

function createShowcaseShell(): { canvas: HTMLCanvasElement; statusPanel: HTMLElement; statsPanel: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();

  const shell = document.createElement("main");
  shell.className = "showcase-shell";
  shell.innerHTML = `
    <canvas class="showcase-canvas" data-testid="example-canvas"></canvas>
    <section class="hud hud-top">
      <div>
        <p class="eyebrow">Real WebGL2 renderer</p>
        <h1>${metadata.title}</h1>
      </div>
      <div class="pill-row">
        ${displayStats.map(([label, value]) => `<span><b>${label}</b>${value}</span>`).join("")}
      </div>
    </section>
    <section class="hud hud-bottom">
      <div>
        <p class="label">Frame status</p>
        <p class="status-line" data-role="status">booting</p>
      </div>
      <div class="meter-grid" data-role="stats"></div>
    </section>
  `;
  root.append(shell);
  const canvas = shell.querySelector<HTMLCanvasElement>("[data-testid='example-canvas']");
  const statusPanel = shell.querySelector<HTMLElement>("[data-role='status']");
  const statsPanel = shell.querySelector<HTMLElement>("[data-role='stats']");
  if (!canvas || !statusPanel || !statsPanel) {
    throw new Error("Showcase shell failed to initialize.");
  }
  return { canvas, statusPanel, statsPanel };
}

function installShowcaseStyles(): void {
  if (document.querySelector("#aura3d-showcase-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-showcase-styles";
  style.textContent = `
    html, body, #app { margin: 0; width: 100%; min-height: 100%; background: #05080d; color: #f2f7fb; font-family: Inter, ui-sans-serif, system-ui, sans-serif; overflow: hidden; }
    .showcase-shell { position: relative; min-height: 100vh; background: #05080d; }
    .showcase-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .hud { position: absolute; left: clamp(16px, 2vw, 30px); right: clamp(16px, 2vw, 30px); display: flex; align-items: center; justify-content: space-between; gap: 18px; pointer-events: none; }
    .hud-top { top: clamp(14px, 1.8vw, 26px); }
    .hud-bottom { bottom: clamp(14px, 1.8vw, 26px); align-items: end; }
    .eyebrow, .label { margin: 0 0 8px; color: #79d7ff; font-size: 12px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(24px, 3.2vw, 42px); line-height: 1.02; letter-spacing: 0; max-width: 520px; text-shadow: 0 8px 34px rgba(0,0,0,0.45); }
    .pill-row { display: grid; grid-template-columns: repeat(2, minmax(130px, 1fr)); gap: 8px; min-width: min(390px, 36vw); }
    .pill-row span, .meter-grid span { border: 1px solid rgba(128, 215, 255, 0.28); background: rgba(5, 11, 18, 0.52); box-shadow: 0 18px 55px rgba(0,0,0,0.28); backdrop-filter: blur(14px); }
    .pill-row span { display: grid; gap: 3px; padding: 10px 12px; border-radius: 8px; color: #d8e8f3; font-size: 12px; }
    .pill-row b { color: #ffffff; font-size: 12px; }
    .status-line { margin: 0; max-width: min(560px, 46vw); color: #dbe7ee; font-size: clamp(14px, 1.4vw, 18px); line-height: 1.45; text-shadow: 0 6px 20px rgba(0,0,0,0.4); }
    .meter-grid { display: grid; grid-template-columns: repeat(4, minmax(76px, 1fr)); gap: 8px; min-width: min(430px, 42vw); }
    .meter-grid span { display: grid; gap: 4px; padding: 10px 12px; border-radius: 8px; }
    .meter-grid b { color: #8fe7ff; font-size: 12px; font-weight: 700; }
    .meter-grid em { color: #fff6c6; font-size: 20px; font-style: normal; font-weight: 800; }
    @media (max-width: 620px) {
      .hud { left: 16px; right: 16px; }
      .hud-top, .hud-bottom { align-items: stretch; flex-direction: column; }
      .pill-row, .meter-grid { min-width: 0; width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .status-line { max-width: none; }
    }
  `;
  document.head.append(style);
}

function updatePanels(statusPanel: HTMLElement, statsPanel: HTMLElement, metrics: MutableMetrics, diagnostics: RenderDeviceDiagnostics | undefined): void {
  statusPanel.textContent = `Ready: high-resolution PBR sphere, metallic and normal-mapped PBR cubes, ${metrics.physicsBodies} physics bodies, ${metrics.liveParticles} live particles.`;
  statsPanel.innerHTML = [
    ["Draws", diagnostics?.drawCalls ?? 0],
    ["Lights", metrics.lights],
    ["PBR", "64x32"],
    ["Particles", metrics.liveParticles],
  ].map(([label, value]) => `<span><b>${label}</b><em>${value}</em></span>`).join("");
}

function resizeCanvasToDisplay(canvas: HTMLCanvasElement): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(240, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function createPhysicsInstanceMatrices(bodies: readonly { readonly position: readonly number[] }[], time: number): Float32Array {
  const matrices: number[] = [];
  bodies.slice(0, 8).forEach((body, index) => {
    const x = -0.72 + index * 0.2;
    const y = -0.54 + Math.min(0.46, Number(body.position[1]) * 0.08);
    const z = -0.02 + Number(body.position[2] ?? 0) * 0.05;
    matrices.push(...modelMatrix({
      translate: [x, y, z],
      rotate: [time * 0.4 + index * 0.23, time * 0.7 + index * 0.4, 0.12],
      scale: [0.12, 0.12, 0.12],
    }));
  });
  return new Float32Array(matrices);
}

function createHorizonLines(time: number): Array<readonly [number, number, number]> {
  const lines: Array<readonly [number, number, number]> = [];
  for (let index = -5; index <= 5; index += 1) {
    const y = -0.72 + index * 0.08;
    lines.push([-0.95, y, 0], [0.95, y + Math.sin(time + index) * 0.012, 0]);
    const x = index * 0.16;
    lines.push([x, -0.8, 0], [x * 0.28, 0.1, 0]);
  }
  return lines;
}

function createParticlePointGeometry(system: ParticleSystem): Geometry {
  const positions = system.particles.slice(0, 420).map((particle) => {
    const x = particle.position.x * 0.42;
    const y = -0.5 + particle.position.y * 0.36;
    const z = 0;
    return [x, y, z] as const;
  });
  return Geometry.points(positions.length > 0 ? positions : [[0, -0.5, 0]]);
}

function modelMatrix(options: {
  readonly translate: readonly [number, number, number];
  readonly rotate: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}): Float32Array {
  const [tx, ty, tz] = options.translate;
  const [rx, ry, rz] = options.rotate;
  const [sx, sy, sz] = options.scale;
  const cx = Math.cos(rx), sxn = Math.sin(rx);
  const cy = Math.cos(ry), syn = Math.sin(ry);
  const cz = Math.cos(rz), szn = Math.sin(rz);

  const m00 = cy * cz;
  const m01 = sxn * syn * cz + cx * szn;
  const m02 = -cx * syn * cz + sxn * szn;
  const m10 = -cy * szn;
  const m11 = -sxn * syn * szn + cx * cz;
  const m12 = cx * syn * szn + sxn * cz;
  const m20 = syn;
  const m21 = -sxn * cy;
  const m22 = cx * cy;

  return new Float32Array([
    m00 * sx, m01 * sx, m02 * sx, 0,
    m10 * sy, m11 * sy, m12 * sy, 0,
    m20 * sz, m21 * sz, m22 * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function normalMatrix(rx: number, ry: number, rz: number): Float32Array {
  return modelMatrix({ translate: [0, 0, 0], rotate: [rx, ry, rz], scale: [1, 1, 1] });
}

function createCheckerTexture(): Texture {
  return new Texture({
    width: 4,
    height: 4,
    format: "rgba8",
    colorSpace: "srgb",
    label: "showcase-checker",
    data: new Uint8Array([
      255, 204, 70, 255, 255, 204, 70, 255, 28, 210, 255, 255, 28, 210, 255, 255,
      255, 204, 70, 255, 255, 204, 70, 255, 28, 210, 255, 255, 28, 210, 255, 255,
      170, 108, 255, 255, 170, 108, 255, 255, 255, 82, 168, 255, 255, 82, 168, 255,
      170, 108, 255, 255, 170, 108, 255, 255, 255, 82, 168, 255, 255, 82, 168, 255,
    ]),
  });
}

function createNormalMapTexture(): Texture {
  return new Texture({
    width: 2,
    height: 2,
    format: "rgba8",
    colorSpace: "linear",
    label: "showcase-normal-map",
    data: new Uint8Array([
      128, 128, 255, 255,
      210, 128, 220, 255,
      96, 210, 235, 255,
      128, 128, 255, 255,
    ]),
  });
}

function countSceneNodes(scene: Scene): number {
  let count = 0;
  scene.traverse(() => {
    count += 1;
  });
  return count;
}

function createInlineGltfDataUri(): string {
  const positions = new Float32Array([-0.5, -0.45, 0, 0.5, -0.45, 0, 0, 0.55, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const bytes = new Uint8Array(positions.byteLength + indices.byteLength);
  bytes.set(new Uint8Array(positions.buffer), 0);
  bytes.set(new Uint8Array(indices.buffer), positions.byteLength);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const bufferUri = `data:application/octet-stream;base64,${btoa(binary)}`;
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: bufferUri, byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.45, 0], max: [0.5, 0.55, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    meshes: [{ name: "showcase-inline-gltf", primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ name: "showcase-gltf-node", mesh: 0 }],
    scenes: [{ name: "showcase-scene", nodes: [0] }],
    scene: 0,
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}
