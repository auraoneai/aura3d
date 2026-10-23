/**
 * Splat Rush on Aura3D: boot, fixed-step loop, pointer input, HUD and capture hooks. The game lives in `sim.ts`
 * (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `seed=N`, `manual=1` (the sim only advances through
 * `__AURA_SPLAT_RUSH__.stepFrames`), `autostart=1`, `autopilot=1`, `warmup=N` (idle splash frames before
 * `autostart`, default 30 like the capture harness).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, type AuraApp } from "@aura3d/engine";
import { Autopilot } from "./autopilot";
import { IDLE, PHASE_CODE, SplatRushSim, TRACE_COLUMNS, expandScript, parseScript, replay, type Input } from "./sim";
import { buildWorld, type WorldRuntime } from "./world";

const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number): number => {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? v : fallback;
};
const config = {
  seed: num("seed", 20261023),
  manual: params.get("manual") === "1",
  autostart: params.get("autostart") === "1",
  autopilot: params.get("autopilot") === "1",
  warmup: num("warmup", 30)
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`splat-rush-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

let sim = new SplatRushSim(config.seed);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let steps = 0;
let pilot: Autopilot | null = config.autopilot ? new Autopilot() : null;
let renderFailed = false;
const pending: Input = { start: false, down: false, up: false, dx: 0 };
let popupShown = 0;

/* ------------------------------------------------------------------ HUD */

function updateHud(): void {
  const o = sim.o;
  $("hud-score").textContent = `SCORE: ${Math.floor(o.score)}`;
  let lives = "";
  for (let i = 0; i < 3; i++) lives += `<div class="life-icon ${i >= o.lives ? "life-lost" : ""}"></div>`;
  $("hud-lives").innerHTML = lives;
  const combo = $("hud-combo");
  if (o.combo > 0) {
    combo.textContent = `${o.combo} COMBO${o.multiplier > 1 ? `  x${o.multiplier}` : ""}`;
    combo.style.display = "block";
    combo.style.color = o.multiplier >= 4 ? "#f0433a" : o.multiplier === 3 ? "#b868e8" : o.multiplier === 2 ? "#5ecaf0" : "#f9c647";
  } else combo.style.display = "none";
  let pills = "";
  if (o.rainbowTimer > 0) pills += `<span class="pu pu-rainbow">🌈 ${Math.ceil(o.rainbowTimer)}s</span>`;
  if (o.shieldActive) pills += '<span class="pu pu-shield">🛡 SHIELD</span>';
  if (o.scoreX2Timer > 0) pills += `<span class="pu pu-x2">✦ 2x ${Math.ceil(o.scoreX2Timer)}s</span>`;
  const bar = $("hud-powerups");
  bar.innerHTML = pills;
  bar.style.display = pills ? "flex" : "none";
  $("splash-screen").classList.toggle("hidden", o.phase !== "splash");
  const over = $("gameover-screen");
  over.classList.toggle("hidden", o.phase !== "gameOver");
  if (o.phase === "gameOver") $("final-score").textContent = `Score: ${Math.floor(o.score)}`;
  while (popupShown < sim.popups.length) {
    const p = sim.popups[popupShown++] as (typeof sim.popups)[number];
    const el = document.createElement("div");
    el.className = "popup-text";
    el.textContent = p.text;
    el.style.color = p.color;
    el.style.left = `${p.at * 100}%`;
    el.style.top = p.size >= 2.5 ? "9%" : "16%";
    $("popups").appendChild(el);
    setTimeout(() => el.remove(), 950);
  }
}

/* ------------------------------------------------------------------ frame */

function render(): void {
  if (!app || !runtime || renderFailed) return;
  try {
    runtime.update(sim, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    app.step(0);
  } catch (error) {
    renderFailed = true;
    reportError(error);
    throw error;
  }
}

function advance(input: Input): void {
  sim.advance(input);
  pilot?.observe(sim);
  steps++;
}

let lastTick = performance.now();
let accumulator = 0;
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;
  if (!ready || config.manual) return;
  accumulator += dt;
  let guard = 0;
  while (accumulator >= 1 / 60 && guard++ < 6) {
    accumulator -= 1 / 60;
    const input: Input = pilot ? pilot.next(sim, steps) : { ...pending };
    pending.start = pending.down = pending.up = false;
    pending.dx = 0;
    advance(input);
  }
  render();
  updateHud();
}

function sizeCanvas(): void {
  const dpr = 1;
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

async function boot(): Promise<void> {
  sizeCanvas();
  const world = buildWorld({ sim, aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight) });
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "none", dither: false },
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  ready = true;
  if (config.autostart) {
    for (let i = 0; i < config.warmup; i++) advance(IDLE);
    steps = 0;
    if (!pilot) pilot = new Autopilot();
  }
  render();
  updateHud();
}

/* ------------------------------------------------------------------ pointer input (original: window-level pointer events) */

let lastX = 0;
let dragging = false;
addEventListener("pointerdown", (e) => {
  if (config.manual || pilot) return;
  const target = e.target as HTMLElement | null;
  if (sim.o.phase === "gameOver" && target?.id !== "btn-restart") return;
  if (sim.o.phase === "splash") pending.start = true;
  else pending.down = true;
  dragging = true;
  lastX = e.clientX;
});
addEventListener("pointermove", (e) => {
  if (config.manual || pilot || !dragging) return;
  pending.dx += e.clientX - lastX;
  lastX = e.clientX;
});
const release = (): void => {
  if (config.manual || pilot) return;
  dragging = false;
  pending.up = true;
};
addEventListener("pointerup", release);
addEventListener("pointercancel", release);
$("btn-restart").addEventListener("click", () => {
  if (config.manual || pilot) return;
  sim.begin();
  popupShown = sim.popups.length;
});
addEventListener("resize", sizeCanvas);

/* ------------------------------------------------------------------ hooks */

const hooks = {
  ready: () => ready,
  seed: config.seed,
  state() {
    const o = sim.o;
    return { ...o, phaseCode: PHASE_CODE[o.phase], steps, n: sim.n, rngCount: sim.rng.count, gates: sim.gates.length, powerups: sim.powerups.length, splatters: sim.splatters.length, segments: sim.segments.length, player: { ...sim.player }, camera: { ...sim.camera }, ye: sim.ye };
  },
  traceRow: () => sim.traceRow(steps),
  traceColumns: TRACE_COLUMNS,
  begin() {
    advance({ start: true, down: false, up: false, dx: 0 });
    render();
    updateHud();
  },
  /** Manual stepping: apply `input` on the first step (idle afterwards) and render once at the end. */
  stepFrames(n: number, input?: Partial<Input>) {
    for (let i = 0; i < n; i++) advance(i === 0 ? { ...IDLE, ...input } : IDLE);
    render();
    updateHud();
    return hooks.state();
  },
  /** Headless replay of a capture script on a fresh sim (no rendering): returns the trace rows. */
  replay(text: string, warmup = config.warmup, seed = config.seed) {
    return replay(seed, warmup, expandScript(parseScript(text))).trace;
  },
  /** Drive `n` steps with the closed-loop autopilot (start, drag, then steer), rendering once at the end. */
  runAutopilot(n: number, mistakeRows: number[] = []) {
    const driver = new Autopilot({ maxDx: 14, mistakeRows, aimOffset: 0 });
    for (let i = 0; i < n; i++) {
      advance(driver.next(sim, i));
      driver.observe(sim);
    }
    render();
    updateHud();
    return hooks.state();
  },
  /** Start the autopilot on the live sim (like `?autopilot=1`), for tests. */
  autopilot(on: boolean) {
    pilot = on ? new Autopilot() : null;
    steps = 0;
  },
  reset(seed = config.seed) {
    sim = new SplatRushSim(seed);
    steps = 0;
    popupShown = 0;
    pilot = config.autopilot ? new Autopilot() : null;
    render();
    updateHud();
  },
  async frame(width = 480, height = 270, quality = 0.7): Promise<string> {
    const blob = (await app!.capture!({ type: "png-blob" })) as Blob;
    const bitmap = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    (c.getContext("2d") as CanvasRenderingContext2D).drawImage(bitmap, 0, 0, width, height);
    return c.toDataURL("image/jpeg", quality);
  },
  async pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
    const blob = (await app!.capture!({ type: "png-blob" })) as Blob;
    const bitmap = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.drawImage(bitmap, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    return { width: c.width, height: c.height, data: img.data };
  },
  info: () => (app as unknown as { info?: () => unknown } | undefined)?.info?.() ?? null,
  diagnostics: () => (app ? (app.diagnostics() as unknown) : null),
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SG-05", "SG-01", "ST-01", "ST-02", "R-23"] }) : null),
  nodeCount: () => runtime?.nodeCount ?? 0
};
(window as unknown as Record<string, unknown>).__AURA_SPLAT_RUSH__ = hooks;

function reportError(error: unknown): void {
  (window as unknown as { __AURA_SPLAT_RUSH_ERROR__?: string }).__AURA_SPLAT_RUSH_ERROR__ = String((error as Error)?.stack ?? error);
}

requestAnimationFrame(tick);
boot().catch((error) => {
  reportError(error);
  throw error;
});
