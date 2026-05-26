import { PhysicsDebugDraw, PhysicsWorld, Shape, samplePhysicsSandboxFixture, type DebugLine, type PhysicsSandboxFixture } from "@aura3d/physics";
import { Geometry, Renderer, UnlitMaterial, type RenderDeviceDiagnostics, type RenderItem } from "@aura3d/rendering";

interface PhysicsSandboxState {
  readonly id: "physics-sandbox";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: "bounded-physics-sandbox-debug-view";
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly rendererBacked: boolean;
  readonly debugVisible: boolean;
  readonly interactions: number;
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly oldBranchPhysicsSandbox?: PhysicsSandboxFixture;
  readonly metrics?: Record<string, string | number | boolean>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_PHYSICS_SANDBOX__?: PhysicsSandboxState;
  }
}

const canvasWidth = 960;
const canvasHeight = 540;
const knownLimits = [
  "This sandbox validates current physics scenes and debug rendering, not a Rapier/Ammo/Cannon advantage claim.",
  "Editor collider authoring, production material editing, robust joint tooling, and full CCD evidence remain incomplete.",
  "The scene uses generated debug geometry for repeatable browser validation.",
] as const;

if (typeof document !== "undefined") {
  void boot();
}

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  installStyles();
  root.innerHTML = `
    <main class="physics-sandbox">
      <canvas data-testid="physics-sandbox-canvas" width="${canvasWidth}" height="${canvasHeight}"></canvas>
      <aside class="physics-sandbox-panel">
        <h1>Physics Sandbox</h1>
        <div class="toolbar">
          <button type="button" data-testid="spawn-box">Spawn</button>
          <button type="button" data-testid="step-sim">Step</button>
          <button type="button" data-testid="toggle-debug">Debug</button>
        </div>
        <label class="scene-picker">
          Scene focus
          <select data-testid="physics-scene-select">
            <option value="stack">Stack</option>
            <option value="constraints">Constraints</option>
            <option value="triggers">Triggers</option>
            <option value="raycasts">Raycasts</option>
            <option value="shape-casts">Shape casts</option>
            <option value="sleeping">Sleeping</option>
            <option value="stress">Stress</option>
          </select>
        </label>
        <div class="debug-toggles">
          <label><input type="checkbox" data-debug-layer="colliders" checked /> Colliders</label>
          <label><input type="checkbox" data-debug-layer="contacts" checked /> Contacts</label>
          <label><input type="checkbox" data-debug-layer="aabbs" checked /> AABBs</label>
          <label><input type="checkbox" data-debug-layer="sleeping" checked /> Sleeping</label>
        </div>
        <pre data-testid="physics-sandbox-status">booting</pre>
      </aside>
    </main>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>("[data-testid='physics-sandbox-canvas']");
  const status = root.querySelector<HTMLElement>("[data-testid='physics-sandbox-status']");
  if (!canvas || !status) throw new Error("Physics sandbox DOM failed to initialize.");

  try {
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: canvasWidth,
      height: canvasHeight,
      clearColor: [0.015, 0.02, 0.026, 1],
      preserveDrawingBuffer: true
    });
    const sandbox = createSandbox(renderer, status);
    root.querySelector<HTMLButtonElement>("[data-testid='spawn-box']")?.addEventListener("click", () => sandbox.spawnBox());
    root.querySelector<HTMLButtonElement>("[data-testid='step-sim']")?.addEventListener("click", () => sandbox.stepBurst());
    root.querySelector<HTMLButtonElement>("[data-testid='toggle-debug']")?.addEventListener("click", () => sandbox.toggleDebug());
    root.querySelector<HTMLSelectElement>("[data-testid='physics-scene-select']")?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      sandbox.setScene(select.value);
    });
    for (const checkbox of root.querySelectorAll<HTMLInputElement>("[data-debug-layer]")) {
      checkbox.addEventListener("change", () => sandbox.setDebugLayer(checkbox.dataset.debugLayer ?? "", checkbox.checked));
    }
    sandbox.stepBurst();
    sandbox.render();
    window.addEventListener("beforeunload", () => renderer.dispose());
  } catch (error) {
    window.__AURA3D_PHYSICS_SANDBOX__ = {
      id: "physics-sandbox",
      status: "error",
      renderer: "webgl2",
      visualClaim: "bounded-physics-sandbox-debug-view",
      knownLimits,
      errors: [error instanceof Error ? error.message : String(error)],
      rendererBacked: false,
      debugVisible: false,
      interactions: 0,
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    status.textContent = JSON.stringify(window.__AURA3D_PHYSICS_SANDBOX__, null, 2);
  }
}

function createSandbox(renderer: Renderer, status: HTMLElement): {
  spawnBox(): void;
  stepBurst(): void;
  toggleDebug(): void;
  setDebugLayer(layer: string, enabled: boolean): void;
  setScene(scene: string): void;
  render(): void;
} {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 6 });
  const debugDraw = new PhysicsDebugDraw();
  const cubeGeometry = Geometry.cube(0.12);
  const groundGeometry = Geometry.lineSegments([[worldX(-5), worldY(0), 0], [worldX(5), worldY(0), 0]]);
  const cubeMaterial = new UnlitMaterial({ color: [0.28, 0.8, 0.48, 1] });
  const sleepingMaterial = new UnlitMaterial({ color: [0.95, 0.72, 0.25, 1] });
  const sensorMaterial = new UnlitMaterial({ color: [1, 0.55, 0.12, 1] });
  const groundMaterial = new UnlitMaterial({ color: [0.42, 0.48, 0.55, 1] });
  const debugMaterial = new UnlitMaterial({ color: [0.08, 0.82, 1, 1] });
  const contactMaterial = new UnlitMaterial({ color: [1, 0.48, 0.24, 1] });
  const aabbMaterial = new UnlitMaterial({ color: [0.55, 0.42, 1, 1] });
  const sleepingDebugMaterial = new UnlitMaterial({ color: [0.95, 0.82, 0.18, 1] });
  const fastMaterial = new UnlitMaterial({ color: [0.95, 0.24, 0.48, 1] });
  const constraintMaterial = new UnlitMaterial({ color: [0.54, 0.72, 1, 1] });
  const castMaterial = new UnlitMaterial({ color: [0.78, 1, 0.35, 1] });
  const platformMaterial = new UnlitMaterial({ color: [0.72, 0.84, 0.94, 1] });
  let debugVisible = true;
  const debugLayers: Record<string, boolean> = {
    colliders: true,
    contacts: true,
    aabbs: true,
    sleeping: true
  };
  let interactions = 0;
  let spawned = 0;
  let activeScene = "stack";
  let lastDiagnostics: RenderDeviceDiagnostics | undefined;
  const oldBranchPhysicsSandbox = samplePhysicsSandboxFixture({ seed: 0x3d2025, steps: 24 });

  const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(ground, { shape: Shape.plane([0, 1, 0], 0) });
  const sensor = world.createRigidBody({ type: "static", position: [1.4, 1.2, 0] });
  world.createCollider(sensor, { shape: Shape.box(0.35, 0.35, 0.35), sensor: true });
  const constraintAnchor = world.createRigidBody({ type: "static", position: [-2.0, 2.5, 0] });
  world.createCollider(constraintAnchor, { shape: Shape.box(0.12, 0.12, 0.12) });
  const constraintBob = world.createRigidBody({ position: [-1.45, 2.15, 0], velocity: [0.4, 0, 0], linearDamping: 0.05 });
  world.createCollider(constraintBob, { shape: Shape.box(0.14, 0.14, 0.14), material: { restitution: 0.05, friction: 0.5 } });
  world.createConstraint({ type: "spring", bodyA: constraintAnchor, bodyB: constraintBob, restLength: 0.6, stiffness: 0.55 });
  const sliderA = world.createRigidBody({ type: "static", position: [2.0, 2.1, 0] });
  const sliderB = world.createRigidBody({ position: [2.5, 2.1, 0], velocity: [-0.35, 0, 0], linearDamping: 0.02 });
  world.createCollider(sliderA, { shape: Shape.box(0.1, 0.1, 0.1) });
  world.createCollider(sliderB, { shape: Shape.box(0.14, 0.14, 0.14) });
  world.createConstraint({ type: "slider", bodyA: sliderA, bodyB: sliderB, axis: [1, 0, 0], stiffness: 0.85 });
  const sleepingBody = world.createRigidBody({ position: [-2.65, 0.26, 0], sleeping: true });
  world.createCollider(sleepingBody, { shape: Shape.box(0.16, 0.16, 0.16) });
  const movingPlatform = world.createRigidBody({ type: "kinematic", position: [0, 0.42, 0] });
  world.createCollider(movingPlatform, { shape: Shape.box(0.48, 0.06, 0.12), material: { friction: 0.9, restitution: 0 } });
  for (let index = 0; index < 5; index += 1) {
    spawnDynamicBox(index * 0.24 - 0.48, 1.2 + index * 0.42);
  }
  for (let index = 0; index < 18; index += 1) {
    spawnDynamicBox(2.2 + (index % 6) * 0.16, 0.3 + Math.floor(index / 6) * 0.28);
  }
  const fast = world.createRigidBody({ position: [-2.4, 2.6, 0], velocity: [8, -1, 0], restitution: 0.05 });
  world.createCollider(fast, { shape: Shape.box(0.16, 0.16, 0.16) });

  return { spawnBox, stepBurst, toggleDebug, setDebugLayer, setScene, render };

  function spawnBox(): void {
    interactions += 1;
    spawnDynamicBox((spawned % 7) * 0.22 - 0.66, 3.4 + (spawned % 3) * 0.22);
    stepBurst();
  }

  function stepBurst(): void {
    interactions += 1;
    for (let step = 0; step < 30; step += 1) {
      const t = (world.snapshot().stats.steps + step) / 60;
      movingPlatform.setPosition([Math.sin(t * 1.8) * 0.85, 0.42, 0]);
      world.step();
    }
    render();
  }

  function toggleDebug(): void {
    interactions += 1;
    debugVisible = !debugVisible;
    render();
  }

  function setDebugLayer(layer: string, enabled: boolean): void {
    if (!(layer in debugLayers)) return;
    interactions += 1;
    debugLayers[layer] = enabled;
    render();
  }

  function setScene(scene: string): void {
    activeScene = scene;
    interactions += 1;
    stepBurst();
  }

  function spawnDynamicBox(x: number, y: number): void {
    const body = world.createRigidBody({ position: [x, y, 0], restitution: 0.08, friction: 0.8, linearDamping: 0.015 });
    world.createCollider(body, { shape: Shape.box(0.18, 0.18, 0.18), material: { friction: 0.8, restitution: 0.04 } });
    spawned += 1;
  }

  function render(): void {
    const renderItems: RenderItem[] = [
      { geometry: groundGeometry, material: groundMaterial, label: "sandbox-ground" }
    ];
    for (const body of world.bodies()) {
      if (body.type === "static" && body.id !== sensor.id && body.id !== constraintAnchor.id && body.id !== sliderA.id) continue;
      const material = body.id === sensor.id
        ? sensorMaterial
        : body.id === fast.id
          ? fastMaterial
          : body.id === constraintBob.id || body.id === sliderB.id || body.id === constraintAnchor.id || body.id === sliderA.id
            ? constraintMaterial
            : body.id === movingPlatform.id
              ? platformMaterial
              : body.sleeping
                ? sleepingMaterial
                : cubeMaterial;
      renderItems.push({
        geometry: cubeGeometry,
        material,
        label: `body-${body.id}`,
        modelMatrix: translationMatrix(worldX(body.position[0]), worldY(body.position[1]), 0)
      });
    }
    const snapshot = world.snapshot();
    const debugLines = debugDraw.buildLines(world);
    const contactLines = buildContactNormalLines(snapshot.contacts);
    const aabbLines = buildAabbLines();
    const sleepingLines = buildSleepingLines();
    const raycastLines = buildCastLines();
    const constraintLines = buildConstraintLines();
    if (debugVisible) {
      appendLineItem(renderItems, debugLayers.colliders ? debugLines : [], debugMaterial, "physics-debug-colliders");
      appendLineItem(renderItems, debugLayers.contacts ? contactLines : [], contactMaterial, "physics-debug-contact-normals");
      appendLineItem(renderItems, debugLayers.aabbs ? aabbLines : [], aabbMaterial, "physics-debug-aabbs");
      appendLineItem(renderItems, debugLayers.sleeping ? sleepingLines : [], sleepingDebugMaterial, "physics-debug-sleeping");
      appendLineItem(renderItems, constraintLines, constraintMaterial, "physics-debug-constraints");
      appendLineItem(renderItems, raycastLines, castMaterial, "physics-debug-casts");
    }
    lastDiagnostics = renderer.render(renderItems);
    publish({
      colliderLines: debugLines.length,
      contactLines: contactLines.length,
      aabbLines: aabbLines.length,
      sleepingLines: sleepingLines.length
    });
  }

  function buildContactNormalLines(contacts: readonly { readonly bodyA: number; readonly bodyB: number; readonly normal: readonly [number, number, number] }[]): readonly DebugLine[] {
    return contacts.map((contact) => {
      const bodyA = world.getBody(contact.bodyA);
      const bodyB = world.getBody(contact.bodyB);
      const origin = bodyA && bodyB
        ? [
            (bodyA.position[0] + bodyB.position[0]) * 0.5,
            (bodyA.position[1] + bodyB.position[1]) * 0.5,
            (bodyA.position[2] + bodyB.position[2]) * 0.5
          ] as [number, number, number]
        : [0, 0, 0] as [number, number, number];
      return {
        from: origin,
        to: [
          origin[0] + contact.normal[0] * 0.35,
          origin[1] + contact.normal[1] * 0.35,
          origin[2] + contact.normal[2] * 0.35
        ],
        color: [1, 0.48, 0.24]
      };
    });
  }

  function buildAabbLines(): readonly DebugLine[] {
    const lines: DebugLine[] = [];
    for (const collider of world.colliders()) {
      const body = world.getBody(collider.bodyId);
      if (!body) continue;
      const bounds = collider.bounds(body.position);
      if (!isRenderableBounds(bounds)) continue;
      const z = 0;
      const corners = [
        [bounds.min[0], bounds.min[1], z],
        [bounds.max[0], bounds.min[1], z],
        [bounds.max[0], bounds.max[1], z],
        [bounds.min[0], bounds.max[1], z]
      ] as [number, number, number][];
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]] as const) {
        lines.push({ from: corners[a], to: corners[b], color: [0.55, 0.42, 1] });
      }
    }
    return lines;
  }

  function buildSleepingLines(): readonly DebugLine[] {
    const lines: DebugLine[] = [];
    for (const body of world.bodies()) {
      if (!body.sleeping) continue;
      const y = body.position[1] + 0.28;
      lines.push({ from: [body.position[0] - 0.18, y, body.position[2]], to: [body.position[0] + 0.18, y, body.position[2]], color: [0.95, 0.82, 0.18] });
    }
    return lines;
  }

  function buildConstraintLines(): readonly DebugLine[] {
    return world.constraints().map((constraint) => ({
      from: constraint.bodyA.position,
      to: constraint.bodyB.position,
      color: [0.54, 0.72, 1]
    }));
  }

  function buildCastLines(): readonly DebugLine[] {
    const lines: DebugLine[] = [];
    const rayOrigin: [number, number, number] = [-2.7, 2.8, 0];
    const rayHit = world.raycast(rayOrigin, [1, -0.55, 0], { maxDistance: 6, includeSensors: true });
    lines.push({ from: rayOrigin, to: rayHit?.point ?? [2.2, 0.1, 0], color: [0.78, 1, 0.35] });
    const castOrigin: [number, number, number] = [-0.8, 1.08, 0];
    const sphereHit = world.sphereCast(castOrigin, 0.18, [1, 0.02, 0], { maxDistance: 3.4, includeSensors: true });
    lines.push({ from: castOrigin, to: sphereHit?.castCenter ?? [2.4, 1.14, 0], color: [0.78, 1, 0.35] });
    return lines;
  }

  function publish(lineCounts: { readonly colliderLines: number; readonly contactLines: number; readonly aabbLines: number; readonly sleepingLines: number }): void {
    const snapshot = world.snapshot();
    const rayHit = world.raycast([-2.7, 2.8, 0], [1, -0.55, 0], { maxDistance: 6, includeSensors: true });
    const sphereHit = world.sphereCast([-0.8, 1.08, 0], 0.18, [1, 0.02, 0], { maxDistance: 3.4, includeSensors: true });
    window.__AURA3D_PHYSICS_SANDBOX__ = {
      id: "physics-sandbox",
      status: "ready",
      renderer: "webgl2",
      visualClaim: "bounded-physics-sandbox-debug-view",
      knownLimits,
      errors: [],
      rendererBacked: true,
      debugVisible,
      interactions,
      diagnostics: lastDiagnostics,
      oldBranchPhysicsSandbox,
      metrics: {
        activeScene,
        availableScenes: "stack,constraints,triggers,raycasts,shape-casts,sleeping,stress",
        oldBranchPhysicsSandboxPort: true,
        oldBranchPhysicsSandboxSource: oldBranchPhysicsSandbox.source,
        oldBranchPhysicsSandboxHash: oldBranchPhysicsSandbox.hash,
        oldBranchSpawnerPresetCount: oldBranchPhysicsSandbox.spawners.length,
        oldBranchSpawnerBodyCount: oldBranchPhysicsSandbox.metrics.totalSpawnedBodies,
        oldBranchSpawnerConstraintCount: oldBranchPhysicsSandbox.metrics.totalSpawnerConstraints,
        oldBranchSupportedToolCount: oldBranchPhysicsSandbox.metrics.supportedToolCount,
        oldBranchBlockedToolCount: oldBranchPhysicsSandbox.metrics.blockedToolCount,
        oldBranchUnsupportedAdvancedSimulationCount: oldBranchPhysicsSandbox.unsupportedAdvancedSimulations.length,
        bodies: snapshot.stats.bodies,
        colliders: snapshot.stats.colliders,
        constraints: snapshot.stats.constraints,
        contacts: snapshot.stats.contacts,
        sensors: world.colliders().filter((collider) => collider.sensor).length,
        raycastHit: rayHit !== undefined,
        raycastDistance: Number((rayHit?.distance ?? 0).toFixed(3)),
        shapeCastHit: sphereHit !== undefined,
        shapeCastDistance: Number((sphereHit?.distance ?? 0).toFixed(3)),
        sleepingBodies: snapshot.stats.sleepingBodies,
        broadphasePairs: snapshot.stats.broadphasePairs,
        broadphaseCandidateTests: snapshot.stats.broadphaseCandidateTests,
        kineticEnergy: Number(snapshot.stats.kineticEnergy.toFixed(3)),
        maxContactPenetration: Number(snapshot.stats.maxContactPenetration.toFixed(4)),
        debugLineCount: lineCounts.colliderLines + lineCounts.contactLines + lineCounts.aabbLines + lineCounts.sleepingLines,
        colliderDebugLines: lineCounts.colliderLines,
        contactNormalLines: lineCounts.contactLines,
        aabbDebugLines: lineCounts.aabbLines,
        sleepingDebugLines: lineCounts.sleepingLines,
        debugColliders: debugLayers.colliders,
        debugContacts: debugLayers.contacts,
        debugAabbs: debugLayers.aabbs,
        debugSleeping: debugLayers.sleeping,
        rendererBacked: true,
        fastBodyX: Number((fast.position[0]).toFixed(3)),
        movingPlatformX: Number(movingPlatform.position[0].toFixed(3)),
        constraintBobX: Number(constraintBob.position[0].toFixed(3)),
        stressBodies: 18
      }
    };
    status.textContent = JSON.stringify(window.__AURA3D_PHYSICS_SANDBOX__, null, 2);
  }
}

function appendLineItem(renderItems: RenderItem[], lines: readonly DebugLine[], material: UnlitMaterial, label: string): void {
  const linePositions = lines.flatMap((line) => lineToRenderPositions(line));
  if (linePositions.length < 2) return;
  renderItems.push({
    geometry: Geometry.lineSegments(linePositions),
    material,
    label
  });
}

function lineToRenderPositions(line: DebugLine): readonly [readonly [number, number, number], readonly [number, number, number]] {
  return [
    [worldX(line.from[0]), worldY(line.from[1]), 0],
    [worldX(line.to[0]), worldY(line.to[1]), 0]
  ];
}

function isRenderableBounds(bounds: { readonly min: readonly number[]; readonly max: readonly number[] }): boolean {
  return [...bounds.min, ...bounds.max].every((value) => Number.isFinite(value) && Math.abs(value) < 1000);
}

function worldX(value: number): number {
  return Math.max(-1.2, Math.min(1.2, value * 0.22));
}

function worldY(value: number): number {
  return Math.max(-1.1, Math.min(1.1, value * 0.28 - 0.72));
}

function translationMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #090d13; color: #eef3f6; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .physics-sandbox { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 320px; }
    canvas { width: 100%; height: 100vh; display: block; background: #090d13; }
    .physics-sandbox-panel { border-left: 1px solid #24313a; background: #101820; padding: 16px; overflow: auto; }
    h1 { margin: 0 0 12px; font-size: 18px; line-height: 1.2; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
    .scene-picker { display: grid; gap: 6px; margin-bottom: 12px; color: #c6d0da; font-size: 13px; }
    .debug-toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; color: #c6d0da; font-size: 13px; }
    .debug-toggles label { display: flex; gap: 6px; align-items: center; }
    button, select { border: 1px solid #36515e; background: #18242d; color: #eef3f6; padding: 7px 10px; font: inherit; }
    button { cursor: pointer; }
    button:hover, select:hover { background: #20323c; }
    pre { margin: 0; white-space: pre-wrap; font-size: 12px; line-height: 1.45; color: #b8e4b3; }
    @media (max-width: 800px) { .physics-sandbox { grid-template-columns: 1fr; } canvas { height: 68vh; } .physics-sandbox-panel { border-left: 0; border-top: 1px solid #24313a; } }
  `;
  document.head.append(style);
}
