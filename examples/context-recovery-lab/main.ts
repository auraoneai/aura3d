import {
  camera,
  createAuraApp,
  lights,
  material,
  primitives,
  scene,
  type AuraApp,
  type AuraSceneBuilder
} from "@aura3d/engine";

interface LoseContextExtension {
  loseContext(): void;
  restoreContext(): void;
}

type RecoveryStatus = "loading" | "ready" | "lost" | "recovering" | "restored" | "error";

interface FrameReading {
  readonly litPixels: number;
  readonly pixelHash: string;
  readonly runtimeMounted: boolean;
}

interface ContextRecoveryEvidence {
  readonly id: "context-recovery-lab";
  readonly status: RecoveryStatus;
  readonly claim: "root-app-driven-webgl2-context-recovery-example";
  readonly extensionAvailable: boolean;
  readonly cycle: number;
  readonly lostCount: number;
  readonly restoredCount: number;
  readonly recoveryCount: number;
  readonly deviceLost: boolean;
  readonly pausedOnLoss: boolean;
  readonly resourcesRecreated: boolean;
  readonly sceneRestored: boolean;
  readonly beforeLoss: FrameReading;
  readonly afterRestore: FrameReading;
  readonly runtimeBackend?: string;
  readonly rendererMode?: string;
  readonly errors: readonly string[];
  readonly knownLimits: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_CONTEXT_RECOVERY_LAB__?: ContextRecoveryEvidence;
    __AURA3D_CONTEXT_RECOVERY_LOSE__?: () => void;
    __AURA3D_CONTEXT_RECOVERY_RESTORE__?: () => void;
  }
}

const emptyFrame: FrameReading = { litPixels: 0, pixelHash: "00000000", runtimeMounted: false };
const knownLimits = [
  "Recovery is app-driven through public loss/restoration subscriptions and an explicit setScene remount.",
  "This does not claim transparent recreation of arbitrary caller-owned GPU resources or WebGPU device-loss recovery."
] as const;

let app: AuraApp | undefined;
let extension: LoseContextExtension | null = null;
let lifecycleStatus: RecoveryStatus = "loading";
let cycle = 0;
let lostCount = 0;
let restoredCount = 0;
let recoveryCount = 0;
let pausedOnLoss = false;
let resourcesRecreated = false;
let sceneRestored = false;
let beforeLoss = emptyFrame;
let afterRestore = emptyFrame;
let presentHandle = 0;

installShell();
publish();
void boot().catch(fail);

async function boot(): Promise<void> {
  const canvas = requiredElement<HTMLCanvasElement>("[data-testid='context-recovery-canvas']");
  const built = buildScene();
  app = createAuraApp(canvas, {
    scene: built,
    autoStart: true,
    resize: true,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }
  });
  app.onDeviceLost(() => {
    if (!app) return;
    stopPresentLoop();
    app.pause();
    lostCount += 1;
    pausedOnLoss = app.runtime.paused;
    lifecycleStatus = "lost";
    setRecoveryOverlay(true);
    setControlState();
    publish();
  });
  app.onDeviceRestored(() => {
    if (!app) return;
    restoredCount += 1;
    lifecycleStatus = "recovering";
    setOverlayMessage("CONTEXT RESTORED", "Rebuilding renderer-owned programs, buffers, and scene resources…");
    publish();
    void recover(built);
  });
  await app.ready();
  await nextAnimationFrames(2);
  app.step(1 / 60);
  await nextAnimationFrames(2);
  lifecycleStatus = "ready";
  bindControls();
  window.__AURA3D_CONTEXT_RECOVERY_LOSE__ = loseContext;
  window.__AURA3D_CONTEXT_RECOVERY_RESTORE__ = restoreContext;
  setControlState();
  startPresentLoop();
  publish();
  window.addEventListener("beforeunload", () => {
    stopPresentLoop();
    app?.dispose();
  }, { once: true });
}

async function recover(built: AuraSceneBuilder): Promise<void> {
  if (!app) return;
  app.setScene(built);
  await app.ready();
  app.resume();
  await nextAnimationFrames(2);
  app.step(1 / 60);
  await nextAnimationFrames(2);
  const canvas = requiredElement<HTMLCanvasElement>("[data-testid='context-recovery-canvas']");
  afterRestore = readFrame(canvas, app);
  recoveryCount += 1;
  cycle += 1;
  resourcesRecreated = afterRestore.runtimeMounted && app.diagnostics().renderer?.runtime.backend === "production-runtime";
  sceneRestored = afterRestore.litPixels > 10_000
    && beforeLoss.pixelHash !== "00000000"
    && afterRestore.pixelHash === beforeLoss.pixelHash;
  lifecycleStatus = "restored";
  setRecoveryOverlay(false);
  setControlState();
  startPresentLoop();
  publish();
}

function buildScene(): AuraSceneBuilder {
  const steel = material.pbr({ color: "#294152", metallic: 0.58, roughness: 0.25 });
  const cyan = material.neon({ color: "#5ce7ea", emissive: "#5ce7ea", emissiveIntensity: 1.8 });
  const amber = material.neon({ color: "#f5bc65", emissive: "#f5bc65", emissiveIntensity: 1.55 });
  return scene()
    .background("#050910")
    .camera(camera.perspective({ position: [0, 1.35, 10.8], target: [0, 0.35, 0], fov: 40 }))
    .add(lights.ambient({ name: "resilience ambient", color: "#a5c9e3", intensity: 0.42 }))
    .add(lights.directional({ name: "recovery key", position: [-4, 8, 6], color: "#ffe1ad", intensity: 3.8 }))
    .add(lights.directional({ name: "recovery rim", position: [7, 4, 1], color: "#8ddfff", intensity: 2.4 }))
    .add(primitives.box({ name: "resilience floor", material: material.pbr({ color: "#0c1822", metallic: 0.42, roughness: 0.3 }) }).position(0, -1.25, 0).scale([9.5, 0.18, 7.2]))
    .add(primitives.box({ name: "resilience rear wall", material: material.pbr({ color: "#101923", metallic: 0.12, roughness: 0.82 }) }).position(0, 1.8, -2.25).scale([9.5, 6.2, 0.18]))
    .add(primitives.cylinder({ name: "core plinth", material: steel }).position(0, -0.72, 0).scale([2.25, 0.58, 2.25]))
    .add(primitives.cylinder({ name: "core light deck", material: cyan }).position(0, -0.38, 0).scale([1.82, 0.06, 1.82]))
    .add(primitives.sphere({ name: "resilience core", material: material.pbr({ color: "#76eef0", metallic: 0.34, roughness: 0.17 }) }).position(0, 0.72, 0).scale(1.02))
    .add(primitives.torus({ name: "horizontal lifecycle ring", material: amber }).position(0, 0.72, 0).rotate(Math.PI / 2, 0, 0).scale([1.58, 1.58, 0.12]))
    .add(primitives.torus({ name: "vertical lifecycle ring", material: cyan }).position(0, 0.72, 0).rotate(0, Math.PI / 2, 0).scale([1.82, 1.82, 0.09]))
    .add(primitives.box({ name: "observe pillar", material: steel }).position(-3.15, -0.2, -0.25).scale([0.48, 2.15, 0.48]))
    .add(primitives.box({ name: "pause pillar", material: steel }).position(3.15, -0.2, -0.25).scale([0.48, 2.15, 0.48]))
    .add(primitives.sphere({ name: "observe event beacon", material: cyan }).position(-3.15, 1.1, -0.25).scale(0.34))
    .add(primitives.sphere({ name: "restore event beacon", material: amber }).position(3.15, 1.1, -0.25).scale(0.34))
    .add(primitives.box({ name: "left signal bridge", material: cyan }).position(-1.95, 0.15, -0.25).scale([1.85, 0.07, 0.08]))
    .add(primitives.box({ name: "right signal bridge", material: amber }).position(1.95, 0.15, -0.25).scale([1.85, 0.07, 0.08]));
}

function bindControls(): void {
  requiredElement<HTMLButtonElement>("[data-testid='lose-context']").addEventListener("click", loseContext);
  requiredElement<HTMLButtonElement>("[data-testid='restore-context']").addEventListener("click", restoreContext);
}

function loseContext(): void {
  if (lifecycleStatus === "lost" || lifecycleStatus === "recovering") return;
  const canvas = requiredElement<HTMLCanvasElement>("[data-testid='context-recovery-canvas']");
  extension ??= canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context") as LoseContextExtension | null;
  if (!extension) return fail(new Error("WEBGL_lose_context is unavailable; this browser cannot prove a real context-loss cycle."));
  if (app) beforeLoss = readFrame(requiredElement<HTMLCanvasElement>("[data-testid='context-recovery-canvas']"), app);
  stopPresentLoop();
  extension.loseContext();
}

function startPresentLoop(): void {
  stopPresentLoop();
  presentHandle = window.setInterval(() => {
    if (app && (lifecycleStatus === "ready" || lifecycleStatus === "restored")) app.step(0);
  }, 100);
}

function stopPresentLoop(): void {
  if (!presentHandle) return;
  window.clearInterval(presentHandle);
  presentHandle = 0;
}

function restoreContext(): void {
  if (!extension || lifecycleStatus !== "lost") return;
  extension.restoreContext();
}

function readFrame(canvas: HTMLCanvasElement, owner: AuraApp): FrameReading {
  const context = canvas.getContext("webgl2");
  if (!context) return emptyFrame;
  const data = new Uint8Array(canvas.width * canvas.height * 4);
  context.readPixels(0, 0, canvas.width, canvas.height, context.RGBA, context.UNSIGNED_BYTE, data);
  let litPixels = 0;
  let hash = 0x811c9dc5;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index]! > 18 || data[index + 1]! > 18 || data[index + 2]! > 18) litPixels += 1;
  }
  for (const value of data) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return {
    litPixels,
    pixelHash: (hash >>> 0).toString(16).padStart(8, "0"),
    runtimeMounted: owner.diagnostics().renderer?.runtime.mounted === true
  };
}

function setControlState(): void {
  const lose = document.querySelector<HTMLButtonElement>("[data-testid='lose-context']");
  const restore = document.querySelector<HTMLButtonElement>("[data-testid='restore-context']");
  if (lose) lose.disabled = lifecycleStatus === "lost" || lifecycleStatus === "recovering" || lifecycleStatus === "error";
  if (restore) restore.disabled = !extension || lifecycleStatus !== "lost";
}

function setRecoveryOverlay(visible: boolean): void {
  const overlay = document.querySelector<HTMLElement>("[data-testid='recovery-overlay']");
  if (!overlay) return;
  overlay.hidden = !visible;
  if (visible) setOverlayMessage("GPU CONTEXT LOST", "Render work paused safely. Restore to remount the same scene and recreate renderer-owned resources.");
}

function setOverlayMessage(title: string, body: string): void {
  const overlay = document.querySelector<HTMLElement>("[data-testid='recovery-overlay']");
  if (!overlay) return;
  overlay.hidden = false;
  const heading = overlay.querySelector<HTMLElement>("strong");
  const copy = overlay.querySelector<HTMLElement>("p");
  if (heading) heading.textContent = title;
  if (copy) copy.textContent = body;
}

function publish(): void {
  const diagnostics = app?.diagnostics();
  const errors = diagnostics?.errors ?? [];
  const evidence: ContextRecoveryEvidence = {
    id: "context-recovery-lab",
    status: lifecycleStatus,
    claim: "root-app-driven-webgl2-context-recovery-example",
    extensionAvailable: Boolean(extension),
    cycle,
    lostCount,
    restoredCount,
    recoveryCount,
    deviceLost: app?.deviceLost() ?? false,
    pausedOnLoss,
    resourcesRecreated,
    sceneRestored,
    beforeLoss,
    afterRestore,
    runtimeBackend: diagnostics?.renderer?.runtime.backend,
    rendererMode: diagnostics?.renderer?.rendererMode,
    errors,
    knownLimits
  };
  window.__AURA3D_CONTEXT_RECOVERY_LAB__ = evidence;
  document.documentElement.dataset.auraRouteStatus = lifecycleStatus;
  document.body.dataset.aura3dReady = String(["ready", "restored"].includes(lifecycleStatus));
  const badge = document.querySelector<HTMLElement>("[data-testid='recovery-state']");
  if (badge) badge.textContent = lifecycleStatus;
  const cycleValue = document.querySelector<HTMLElement>("[data-testid='recovery-cycle']");
  if (cycleValue) cycleValue.textContent = String(cycle);
  const metrics = document.querySelector<HTMLElement>("[data-testid='recovery-metrics']");
  if (metrics) {
    metrics.innerHTML = `<span><strong>${lostCount}</strong> loss events</span><span><strong>${restoredCount}</strong> restore events</span><span><strong>${recoveryCount}</strong> remounts</span><span><strong>${sceneRestored ? "MATCH" : "ARMED"}</strong> frame identity</span>`;
  }
  const steps = document.querySelectorAll<HTMLElement>("[data-step]");
  const active = lifecycleStatus === "lost" ? 1 : lifecycleStatus === "recovering" ? 2 : lifecycleStatus === "restored" ? 3 : 0;
  steps.forEach((step, index) => {
    step.classList.toggle("active", index === active);
    step.classList.toggle("complete", index < active || (lifecycleStatus === "restored" && index <= active));
  });
}

function fail(error: unknown): void {
  stopPresentLoop();
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  lifecycleStatus = "error";
  window.__AURA3D_CONTEXT_RECOVERY_LAB__ = {
    id: "context-recovery-lab",
    status: "error",
    claim: "root-app-driven-webgl2-context-recovery-example",
    extensionAvailable: false,
    cycle,
    lostCount,
    restoredCount,
    recoveryCount,
    deviceLost: false,
    pausedOnLoss,
    resourcesRecreated,
    sceneRestored,
    beforeLoss,
    afterRestore,
    errors: [message],
    knownLimits,
    error: message
  };
  document.documentElement.dataset.auraRouteStatus = "error";
}

function installShell(): void {
  document.body.innerHTML = `
    <main>
      <section class="stage" aria-label="Aura3D WebGL2 context recovery visualization">
        <canvas data-testid="context-recovery-canvas" aria-label="Resilience Core renderer lifecycle scene"></canvas>
        <div class="eyebrow"><span></span> ROOT API · REAL WEBGL2 LOSS</div>
        <div class="state-badge">STATE · <strong data-testid="recovery-state">loading</strong></div>
        <div class="stage-title"><p>RENDERER LIFECYCLE</p><h1>Resilience Core</h1><span>Observe. Pause. Restore. Remount.</span></div>
        <div class="recovery-overlay" data-testid="recovery-overlay" role="status" aria-live="assertive" hidden>
          <i></i><strong>GPU CONTEXT LOST</strong><p>Render work paused safely. Restore to remount the same scene and recreate renderer-owned resources.</p>
        </div>
      </section>
      <aside>
        <div><p class="kicker">RECOVERY LAB 03</p><h2>A failure path<br>you can inspect.</h2><p class="lede">This is a real browser context-loss cycle—not a simulated counter. Aura observes the device event, pauses unsafe work, then explicitly remounts the same scene after restoration.</p></div>
        <div class="pipeline" aria-label="Recovery lifecycle">
          <article data-step><b>01</b><span>Healthy</span><small>Production runtime mounted</small></article>
          <article data-step><b>02</b><span>Paused</span><small>Loss event observed</small></article>
          <article data-step><b>03</b><span>Rebuild</span><small>Public setScene remount</small></article>
          <article data-step><b>04</b><span>Remounted</span><small>Browser receipt checks frame identity</small></article>
        </div>
        <div class="controls" role="group" aria-label="Context recovery controls">
          <button data-testid="lose-context">Lose WebGL context</button>
          <button data-testid="restore-context" disabled>Restore + remount</button>
        </div>
        <div class="cycle">RECOVERY CYCLE <strong data-testid="recovery-cycle">0</strong></div>
        <div class="metrics" data-testid="recovery-metrics" aria-live="polite"><span>mounting</span></div>
        <p class="limit">Bounded proof: root WebGL2 event observation + app-driven scene remount. No transparent recreation of caller-owned GPU resources or WebGPU device-loss claim.</p>
      </aside>
    </main>`;
  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #050910; color: #f0f6fa; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #050910; }
    body { overflow: hidden; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 26rem; }
    .stage { min-width: 0; position: relative; overflow: hidden; background: radial-gradient(circle at 48% 38%, #163044, #050910 72%); }
    canvas { display: block; width: 100%; height: 100vh; }
    .eyebrow, .state-badge, .stage-title { position: absolute; z-index: 3; pointer-events: none; }
    .eyebrow { top: 1.45rem; left: 1.55rem; display: flex; align-items: center; gap: .55rem; color: #a0bdca; font: 700 .67rem/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .14em; }
    .eyebrow span { width: .5rem; height: .5rem; border-radius: 50%; background: #5ce7ea; box-shadow: 0 0 18px #5ce7ea; }
    .state-badge { top: 1.35rem; right: 1.4rem; padding: .62rem .75rem; border: 1px solid #416175; background: #071018c9; color: #89a7b6; font: 650 .66rem/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .1em; text-transform: uppercase; backdrop-filter: blur(12px); }
    .state-badge strong { color: #67e5d8; }
    .stage-title { left: 1.6rem; bottom: 1.55rem; text-shadow: 0 2px 20px #050910; }
    .stage-title p, .kicker { margin: 0 0 .45rem; color: #e8b45e; font: 700 .68rem/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .16em; }
    .stage-title h1 { margin: 0; font-size: clamp(2.5rem, 5.6vw, 5.4rem); line-height: .9; letter-spacing: -.06em; font-weight: 530; }
    .stage-title span { display: block; margin-top: .7rem; color: #b7cbd5; }
    .recovery-overlay { position: absolute; z-index: 8; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; text-align: center; background: radial-gradient(circle, #301416d9, #050910f2 70%); backdrop-filter: blur(8px); }
    .recovery-overlay[hidden] { display: none; }
    .recovery-overlay i { width: 3.4rem; height: 3.4rem; margin-bottom: 1.3rem; border: .32rem solid #ff7b6b; border-top-color: transparent; border-radius: 50%; box-shadow: 0 0 28px #ff6a5a55; }
    .recovery-overlay strong { color: #ff9d8f; font: 800 1.1rem/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .16em; }
    .recovery-overlay p { max-width: 31rem; color: #d4b7b4; line-height: 1.55; }
    aside { position: relative; z-index: 10; display: flex; flex-direction: column; gap: 1.35rem; padding: 2.05rem 1.85rem 1.4rem; border-left: 1px solid #263d4a; background: linear-gradient(155deg, #10232d 0%, #081218 80%); box-shadow: -20px 0 60px #02070a77; }
    h2 { margin: 0; font-size: 2.48rem; line-height: 1; letter-spacing: -.052em; font-weight: 540; }
    .lede { color: #96aeb9; font-size: .91rem; line-height: 1.56; }
    .pipeline { display: grid; grid-template-columns: 1fr 1fr; gap: .52rem; }
    article { min-height: 4.5rem; padding: .62rem .68rem; border: 1px solid #29434f; background: #08151cbb; opacity: .52; transition: .18s ease; }
    article b { color: #52717e; font: 700 .58rem/1 ui-monospace, SFMono-Regular, monospace; }
    article span, article small { display: block; }
    article span { margin: .24rem 0 .15rem; font-size: .78rem; font-weight: 680; }
    article small { color: #75919d; font-size: .62rem; line-height: 1.3; }
    article.active { opacity: 1; border-color: #5ce7ea; box-shadow: inset 0 0 18px #5ce7ea12; }
    article.complete { opacity: .82; border-color: #4d8a83; }
    .controls { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
    button { min-height: 2.85rem; border: 1px solid #416173; border-radius: .35rem; background: #102532; color: #d7e7ed; font: 650 .7rem/1.2 inherit; cursor: pointer; transition: .16s ease; }
    button:hover:not(:disabled) { border-color: #72e7e8; transform: translateY(-1px); }
    button:first-child:not(:disabled) { border-color: #d36d61; color: #ffb0a6; background: #32191b; }
    button:last-child:not(:disabled) { border-color: #62d4c8; color: #d8fffa; background: #12312f; }
    button:disabled { opacity: .34; cursor: not-allowed; }
    .cycle { display: flex; justify-content: space-between; align-items: baseline; color: #688692; font: 700 .63rem/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .12em; }
    .cycle strong { color: #f0c16d; font-size: 1.45rem; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
    .metrics span { min-height: 3.45rem; display: flex; flex-direction: column; justify-content: center; padding: .62rem; border: 1px solid #263e4a; background: #061117bd; color: #698591; font: 600 .61rem/1.3 ui-monospace, SFMono-Regular, monospace; text-transform: uppercase; letter-spacing: .045em; }
    .metrics strong { color: #eef8fa; font-size: .92rem; letter-spacing: 0; }
    .limit { margin-top: auto; padding-top: .9rem; border-top: 1px solid #263d47; color: #5e7883; font-size: .65rem; line-height: 1.48; }
    @media (max-width: 860px) { body { overflow: auto; } main { grid-template-columns: 1fr; } canvas { height: 68vh; min-height: 30rem; } aside { border-left: 0; border-top: 1px solid #263d4a; } }
  `;
  document.head.append(style);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

async function nextAnimationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
  }
}

export {};
