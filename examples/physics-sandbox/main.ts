import { PhysicsDebugDraw, PhysicsWorld, Shape, type DebugLine } from "@galileo3d/physics";
import { Geometry, Renderer, UnlitMaterial, type RenderDeviceDiagnostics, type RenderItem } from "@galileo3d/rendering";

interface PhysicsSandboxState {
  readonly id: "physics-sandbox";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly rendererBacked: boolean;
  readonly debugVisible: boolean;
  readonly interactions: number;
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly metrics?: Record<string, string | number | boolean>;
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_PHYSICS_SANDBOX__?: PhysicsSandboxState;
  }
}

const canvasWidth = 960;
const canvasHeight = 540;

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
    for (const checkbox of root.querySelectorAll<HTMLInputElement>("[data-debug-layer]")) {
      checkbox.addEventListener("change", () => sandbox.setDebugLayer(checkbox.dataset.debugLayer ?? "", checkbox.checked));
    }
    sandbox.stepBurst();
    sandbox.render();
    window.addEventListener("beforeunload", () => renderer.dispose());
  } catch (error) {
    window.__GALILEO3D_PHYSICS_SANDBOX__ = {
      id: "physics-sandbox",
      status: "error",
      renderer: "webgl2",
      rendererBacked: false,
      debugVisible: false,
      interactions: 0,
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    status.textContent = JSON.stringify(window.__GALILEO3D_PHYSICS_SANDBOX__, null, 2);
  }
}

function createSandbox(renderer: Renderer, status: HTMLElement): {
  spawnBox(): void;
  stepBurst(): void;
  toggleDebug(): void;
  setDebugLayer(layer: string, enabled: boolean): void;
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
  let debugVisible = true;
  const debugLayers: Record<string, boolean> = {
    colliders: true,
    contacts: true,
    aabbs: true,
    sleeping: true
  };
  let interactions = 0;
  let spawned = 0;
  let lastDiagnostics: RenderDeviceDiagnostics | undefined;

  const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(ground, { shape: Shape.plane([0, 1, 0], 0) });
  const sensor = world.createRigidBody({ type: "static", position: [1.4, 1.2, 0] });
  world.createCollider(sensor, { shape: Shape.box(0.35, 0.35, 0.35), sensor: true });
  for (let index = 0; index < 5; index += 1) {
    spawnDynamicBox(index * 0.24 - 0.48, 1.2 + index * 0.42);
  }
  const fast = world.createRigidBody({ position: [-2.4, 2.6, 0], velocity: [8, -1, 0], restitution: 0.05 });
  world.createCollider(fast, { shape: Shape.box(0.16, 0.16, 0.16) });

  return { spawnBox, stepBurst, toggleDebug, setDebugLayer, render };

  function spawnBox(): void {
    interactions += 1;
    spawnDynamicBox((spawned % 7) * 0.22 - 0.66, 3.4 + (spawned % 3) * 0.22);
    stepBurst();
  }

  function stepBurst(): void {
    interactions += 1;
    for (let step = 0; step < 30; step += 1) {
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
      if (body.type === "static" && body.id !== sensor.id) continue;
      const material = body.id === sensor.id ? sensorMaterial : body.id === fast.id ? fastMaterial : body.sleeping ? sleepingMaterial : cubeMaterial;
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
    if (debugVisible) {
      appendLineItem(renderItems, debugLayers.colliders ? debugLines : [], debugMaterial, "physics-debug-colliders");
      appendLineItem(renderItems, debugLayers.contacts ? contactLines : [], contactMaterial, "physics-debug-contact-normals");
      appendLineItem(renderItems, debugLayers.aabbs ? aabbLines : [], aabbMaterial, "physics-debug-aabbs");
      appendLineItem(renderItems, debugLayers.sleeping ? sleepingLines : [], sleepingDebugMaterial, "physics-debug-sleeping");
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

  function publish(lineCounts: { readonly colliderLines: number; readonly contactLines: number; readonly aabbLines: number; readonly sleepingLines: number }): void {
    const snapshot = world.snapshot();
    window.__GALILEO3D_PHYSICS_SANDBOX__ = {
      id: "physics-sandbox",
      status: "ready",
      renderer: "webgl2",
      rendererBacked: true,
      debugVisible,
      interactions,
      diagnostics: lastDiagnostics,
      metrics: {
        bodies: snapshot.stats.bodies,
        colliders: snapshot.stats.colliders,
        constraints: snapshot.stats.constraints,
        contacts: snapshot.stats.contacts,
        sensors: world.colliders().filter((collider) => collider.sensor).length,
        sleepingBodies: snapshot.stats.sleepingBodies,
        broadphasePairs: snapshot.stats.broadphasePairs,
        broadphaseCandidateTests: snapshot.stats.broadphaseCandidateTests,
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
        fastBodyX: Number((fast.position[0]).toFixed(3))
      }
    };
    status.textContent = JSON.stringify(window.__GALILEO3D_PHYSICS_SANDBOX__, null, 2);
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
    .debug-toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; color: #c6d0da; font-size: 13px; }
    .debug-toggles label { display: flex; gap: 6px; align-items: center; }
    button { border: 1px solid #36515e; background: #18242d; color: #eef3f6; padding: 7px 10px; font: inherit; cursor: pointer; }
    button:hover { background: #20323c; }
    pre { margin: 0; white-space: pre-wrap; font-size: 12px; line-height: 1.45; color: #b8e4b3; }
    @media (max-width: 800px) { .physics-sandbox { grid-template-columns: 1fr; } canvas { height: 68vh; } .physics-sandbox-panel { border-left: 0; border-top: 1px solid #24313a; } }
  `;
  document.head.append(style);
}
