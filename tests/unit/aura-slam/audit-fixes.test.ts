/**
 * Audit fixes for Aura Slam 3D (docs/audits/sections/game-01-top-tennis.md): one block per row, so a regression names the row.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import type { AuraPrimitiveNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { createFakeContext } from "../audio-synth/mockContext";
import { createTennisAudio, umpireCall } from "../../../examples/aura-slam/audio/audio";
import { CAMERA_EYE, CAMERA_FOV_DEG, CAMERA_MIN_TAN_HALF_HFOV, cameraFovForAspect, projectWorldPoint } from "../../../examples/aura-slam/view/camera";
import { COURT_X, COURT_Z, SPECTATOR_COUNT } from "../../../examples/aura-slam/view/constants";
import { PARTICLE_CAPACITY, buildParticleNodes, createParticleUpdater, hexToLinear } from "../../../examples/aura-slam/view/particles";
import { SPECTATOR_COLORS, buildSpectatorNodes, createSpectatorUpdater, spectatorSeat } from "../../../examples/aura-slam/view/spectators";
import { STATIC_RUNTIME_IDS, buildTennisScene } from "../../../examples/aura-slam/view/scene";
import { createPoseRig } from "../../../examples/aura-slam/view/poseRig";
import { resolveAppearance } from "../../../examples/aura-slam/view/appearance";
import { clampServePosition, createAdapterController, SERVE_Y_MIN } from "../../../examples/aura-slam/shell/controller";
import { createMatchLoop } from "../../../examples/aura-slam/shell/loop";
import { controlsHintText, SWING_ALIAS_KEYS, swingAliasesFree } from "../../../examples/aura-slam/ui/controlsHint";
import { coachSteps } from "../../../examples/aura-slam/ui/coach";
import { createInputMapper } from "../../../examples/aura-slam/input/mapper";

function createAudioFake() {
  const f = createFakeContext("running");
  (f.ctx as unknown as { sampleRate: number }).sampleRate = 48000;
  return {
    ctx: f.ctx, ofKind: (kind: string) => f.ofKind(kind as never),
    bytes: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(32) }),
    flush: async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }
  };
}

function instancedScene(nodes: unknown[]): { snapshot: AuraSceneSnapshot; registry: ReturnType<typeof createAuraRuntimeNodeRegistry> } {
  let s = scene().background("#000000").camera(camera.perspective({ fov: 15, near: 0.1, far: 180, position: [...CAMERA_EYE], target: [0, 0, 0.7] }));
  for (const n of nodes) s = s.add(n as never);
  const snapshot = s.toJSON() as AuraSceneSnapshot;
  return { snapshot, registry: createAuraRuntimeNodeRegistry(snapshot) };
}

function renderItems(snapshot: AuraSceneSnapshot, registry: ReturnType<typeof createAuraRuntimeNodeRegistry>) {
  const primitives = snapshot.nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive");
  const entries = createProductionRuntimePrimitiveEntries(primitives as never);
  const input = createProductionRuntimeRendererInput(snapshot, { width: 640, height: 360 } as HTMLCanvasElement, [], entries, 0, registry, new Set<string>(), { color: [0, 0, 0], intensity: 0 }, []);
  return [...(input.source.collectRenderItems?.() ?? [])] as Array<{ label?: string; instanceColors?: Float32Array; instanceTransforms?: Float32Array; instanceCount?: number }>;
}

describe("top-tennis-C1: spectators keep their per-instance colours every frame", () => {
  it("the node keeps 24 colours after many updates, and the render item draws them", () => {
    const { snapshot, registry } = instancedScene(buildSpectatorNodes());
    const handle = registry.require("spectators");
    const updater = createSpectatorUpdater();
    for (let f = 0; f < 120; f++) updater.update(handle, f / 60, f > 60);
    const snap = handle.snapshot() as { instanceColors?: readonly string[]; instanceMatrices?: Float32Array };
    expect(snap.instanceColors).toHaveLength(SPECTATOR_COUNT);
    expect(snap.instanceColors).toEqual(Array.from({ length: SPECTATOR_COUNT }, (_, i) => SPECTATOR_COLORS[i % SPECTATOR_COLORS.length]));
    expect(snap.instanceMatrices).toHaveLength(SPECTATOR_COUNT * 16);
    const item = renderItems(snapshot, registry).find((i) => i.label?.includes("spectators"));
    expect(item).toBeDefined();
    const colors = (item as unknown as { instanceColors?: Float32Array }).instanceColors;
    expect(colors?.length).toBe(SPECTATOR_COUNT * 4);
    // Not white: the first spectator is #e06348, so red clearly beats blue.
    expect(colors![0]!).toBeGreaterThan(colors![2]! * 3);
  });
  it("C12: the per-frame write reuses one buffer and only moves heights", () => {
    const { registry } = instancedScene(buildSpectatorNodes());
    const handle = registry.require("spectators");
    const updater = createSpectatorUpdater();
    const buffer = updater.matrices;
    updater.update(handle, 1.3, true);
    expect(updater.matrices).toBe(buffer);
    for (let i = 0; i < SPECTATOR_COUNT; i++) {
      const [sx, sy, sz] = spectatorSeat(i);
      expect(buffer[i * 16 + 12]).toBeCloseTo(sx, 5);
      expect(buffer[i * 16 + 14]).toBeCloseTo(sz, 5);
      expect(buffer[i * 16 + 13]! - sy).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});

describe("top-tennis-C2: portrait framing keeps both athletes in the canvas", () => {
  it("keeps the live 15 degree FOV on desktop aspects", () => {
    for (const aspect of [1280 / 720, 1440 / 900, 1920 / 1080, 1.6, 1.45]) expect(cameraFovForAspect(aspect)).toBe(CAMERA_FOV_DEG);
  });
  it("widens the vertical FOV below aspect 1.44 so horizontal coverage never drops below the court", () => {
    for (const aspect of [1.2, 1, 0.75, 0.6, 0.46]) {
      const fov = cameraFovForAspect(aspect);
      expect(fov).toBeGreaterThan(CAMERA_FOV_DEG);
      expect(Math.tan((fov * Math.PI) / 360) * aspect).toBeGreaterThanOrEqual(CAMERA_MIN_TAN_HALF_HFOV - 1e-9);
    }
  });
  it("at 390 x 844 (canvas 390 x 732 under the control band) both athletes project inside, at their widest serve and rally spots", () => {
    for (const [w, h] of [[390, 844], [390, 732], [360, 640]] as const) {
      for (const [x, y] of [[0.95, 1.12], [-0.95, 1.12], [1.02, 1.18], [-1.02, 0.18], [0.95, -1.12], [-0.95, -1.12]] as const) {
        for (const height of [0.05, 1.75]) {
          const p = projectWorldPoint(w, h, x * COURT_X, height, y * COURT_Z);
          expect(p.visible, `${w}x${h} athlete at (${x}, ${y}) height ${height}`).toBe(true);
          expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(w);
          expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(h);
        }
      }
    }
  });
  it("the old fixed FOV put the near athlete outside a portrait canvas (the defect)", () => {
    const p = projectWorldPoint(390, 732, 0.95 * COURT_X, 1, 1.12 * COURT_Z, CAMERA_FOV_DEG);
    expect(p.visible).toBe(false);
  });
});

describe("top-tennis-C3: the controls hint names the bound keys", () => {
  it("default bindings: Q short, E deep, R lob (Pro/Legend), Shift power", () => {
    const mapper = createInputMapper();
    const text = controlsHintText(mapper.bindings as never);
    expect(text).toContain("SHORT: Q");
    expect(text).toContain("DEEP: E");
    expect(text).toContain("LOB: R (PRO/LEGEND)");
    expect(text).toMatch(/POWER: [^·]*SHIFT/);
    expect(text).toContain("SPACE / J / K / L");
    expect(text).not.toContain("DROP SHOT");
  });
  it("follows a rebind, and drops the J/K/L aliases once one of them is bound", () => {
    const mapper = createInputMapper();
    const b = mapper.bindings as unknown as { getBindings(d: string): Record<string, readonly [string, string | null]>; applyBindings(d: string, p: unknown): { ok: boolean } };
    expect(b.applyBindings("keyboard", { ...b.getBindings("keyboard"), lob: ["KeyL", null] }).ok).toBe(true);
    const text = controlsHintText(mapper.bindings as never);
    expect(text).toContain("LOB: L");
    expect(text).not.toContain("J / K / L");
    expect(swingAliasesFree(mapper.bindings as never)).toBe(false);
  });
});

describe("top-tennis-C4: the adapter controller runs once per 1/60 s sim step, not per rendered frame", () => {
  const runFor = (hz: number, seconds: number): number => {
    const state = { mode: "playing", paused: false, phase: "serve", server: "player", serveCourt: "deuce", time: 0, serveAttempt: null,
      player: { x: 0.38, y: 1.035, vx: 0, vy: 0, swing: 0, swingCooldown: 0 }, ball: { x: 0, y: 0, z: 0, vz: 0, vy: 0, active: false, lastHit: null, bounceCount: 0 } };
    const ap = createAdapterController({ engine: () => ({}), state: () => state as never, autoplay: false });
    ap.keyDown({ code: "KeyD" });
    let now = 0;
    const frames: Array<(t: number) => void> = [];
    // The same composition as shell/boot.ts: step = sim step then one controller step; render does not touch the controller.
    const loop = createMatchLoop({ step: (dt) => { state.time += dt; ap.step(state as never, dt); }, render: () => undefined, now: () => now, schedule: (cb) => { frames.push(cb); return frames.length; }, cancel: () => undefined });
    loop.start();
    for (let i = 0; i < Math.round(seconds * hz); i++) { now += 1000 / hz; frames.shift()?.(now); }
    return state.player.x;
  };
  it("serve-setup movement covers the same distance at 30, 60, 120 and 144 Hz", () => {
    // 0.4 s of held D from x = 0.38: 1.35 court units/s, so about 0.54 at any refresh rate. The old per-render controller moved
    // 2x as far at 120 Hz. Tolerance: three 1/60 s steps (the first frame and the frame phase can shift the step count).
    const at60 = runFor(60, 0.4);
    expect(at60 - 0.38).toBeGreaterThan(0.4 * 1.35 * 0.8);
    for (const hz of [30, 120, 144]) expect(Math.abs(runFor(hz, 0.4) - at60), `${hz} Hz`).toBeLessThanOrEqual((3 * 1.35) / 60 + 1e-9);
  });
  it("boot.ts steps the controller inside the fixed-step callback and never from render()", () => {
    const src = readFileSync("examples/aura-slam/shell/boot.ts", "utf8");
    const renderBody = src.slice(src.indexOf("function render(frameSeconds"), src.indexOf("/* ---- match flow ---- */"));
    expect(renderBody).not.toContain("autopilot.step");
    expect(src).toMatch(/step: \(dt\) => \{ update\(dt\); autopilot\.step\(getState\(\) as never, dt\);/);
  });
});

describe("top-tennis-C5: the server stays behind the baseline and on the half for the court being served", () => {
  it("clamps y to the baseline and x to the serve half", () => {
    expect(clampServePosition(0.3, 0.72, "deuce")).toEqual({ x: 0.3, y: SERVE_Y_MIN });
    expect(clampServePosition(-0.5, 1.05, "deuce").x).toBeGreaterThan(0);
    expect(clampServePosition(0.5, 1.05, "ad").x).toBeLessThan(0);
    expect(clampServePosition(0.2, 2, "ad")).toEqual({ x: -0.02, y: 1.12 });
  });
  it("holding up and left for 3 s from the deuce court never crosses the baseline or the centre mark", () => {
    const state = { mode: "playing", paused: false, phase: "serve", server: "player", serveCourt: "deuce", time: 0, serveAttempt: null,
      player: { x: 0.38, y: 1.035, vx: 0, vy: 0, swing: 0, swingCooldown: 0 }, ball: { x: 0, y: 0, z: 0, vz: 0, vy: 0, active: false, lastHit: null, bounceCount: 0 } };
    const ap = createAdapterController({ engine: () => ({}), state: () => state as never });
    ap.keyDown({ code: "KeyW" }); ap.keyDown({ code: "KeyA" });
    for (let i = 0; i < 180; i++) ap.step(state as never, 1 / 60);
    expect(state.player.y).toBeGreaterThanOrEqual(1);
    expect(state.player.x).toBeGreaterThan(0);
  });
});

describe("top-tennis-C6: J/K/L and serve movement go through the binding store", () => {
  it("the adapter controller no longer swings on J/K/L (the shell handles them with the bound-key gates)", () => {
    const calls: unknown[][] = [];
    const engine = { requestSwing: (...a: unknown[]) => calls.push(["swing", ...a]), selectShot: (...a: unknown[]) => calls.push(["shot", ...a]) };
    const ap = createAdapterController({ engine: () => engine, state: () => ({ mode: "playing", paused: false, time: 4 }) as never });
    ap.keyDown({ code: "KeyJ" }); ap.keyDown({ code: "KeyK" }); ap.keyDown({ code: "KeyL" });
    expect(calls).toEqual([]);
    expect(SWING_ALIAS_KEYS).toEqual({ KeyJ: "short", KeyK: "deep", KeyL: "lob" });
  });
  it("boot.ts gates the aliases like the bound keys: lob through requestLobSwing, everything behind touchPlayEnabled/swipeActive", () => {
    const src = readFileSync("examples/aura-slam/shell/boot.ts", "utf8");
    const block = src.slice(src.indexOf("const alias = !action"), src.indexOf("if (!touchPlayEnabled() || swipeActive() || !action) return;"));
    expect(block).toContain("if (!touchPlayEnabled() || swipeActive()) return;");
    expect(block).toContain('if (alias === "lob") { requestLobSwing(event); return; }');
    expect(block).toContain("selectShot(alias)");
  });
  it("serve movement reads the injected axes (rebinds) instead of hard-coded WASD", () => {
    const state = { mode: "playing", paused: false, phase: "serve", server: "player", serveCourt: "ad", time: 0, serveAttempt: null,
      player: { x: -0.38, y: 1.035, vx: 0, vy: 0, swing: 0, swingCooldown: 0 }, ball: { x: 0, y: 0, z: 0, vz: 0, vy: 0, active: false, lastHit: null, bounceCount: 0 } };
    let axes = { mx: 0, my: 0 };
    const ap = createAdapterController({ engine: () => ({}), state: () => state as never, moveAxes: () => axes });
    ap.keyDown({ code: "KeyD" });
    ap.step(state as never, 1 / 60);
    expect(state.player.x).toBeCloseTo(-0.38, 12);
    axes = { mx: -1, my: 0 };
    ap.step(state as never, 1 / 60);
    expect(state.player.x).toBeCloseTo(-0.38 - 1.35 / 60, 12);
  });
});

describe("top-tennis-C7 / C9 / C10 / C13: scene structure", () => {
  const snapshot = buildTennisScene(createPoseRig({ resolveAppearance }) as never).toJSON() as AuraSceneSnapshot;
  const byRuntime = (id: string) => snapshot.nodes.find((n) => (n as { runtime?: { id?: string } }).runtime?.id === id) as Record<string, unknown> | undefined;
  it("C7: ?venue= reaches the quick-started match (quickStart reads per-mode settings, so the venue is passed through)", () => {
    const boot = readFileSync("examples/aura-slam/shell/boot.ts", "utf8");
    expect(boot).toContain('menu.quickStart("single", startSettings)');
  });
  it("C7: backdrop, seats and sponsor trim are runtime nodes the venue can recolour (the backdrop in ?look=original; GU47 TT-E1 shows the venue HDRI instead)", () => {
    for (const id of [STATIC_RUNTIME_IDS.bleachers, STATIC_RUNTIME_IDS.sponsorTrim, "stadium-grandstand-rear", "spectators"]) expect(byRuntime(id), id).toBeDefined();
    expect(byRuntime("stadium-backdrop")).toBeUndefined();
    const original = buildTennisScene(createPoseRig({ resolveAppearance }) as never, { look: "original" }).toJSON() as AuraSceneSnapshot;
    expect(original.nodes.find((n) => (n as { runtime?: { id?: string } }).runtime?.id === "stadium-backdrop"), "stadium-backdrop").toBeDefined();
  });
  it("C9: the net mesh is blended at opacity 0.42 without depth write or shadow; the tape stays opaque", () => {
    const net = snapshot.nodes.find((n) => (n as { name?: string }).name === "static-netMesh") as { material?: Record<string, unknown>; castShadow?: boolean };
    expect(net.material).toMatchObject({ opacity: 0.42, alphaMode: "blend", depthWrite: false });
    expect(net.castShadow).toBe(false);
    const tape = snapshot.nodes.find((n) => (n as { name?: string }).name === "static-netTape") as { material?: Record<string, unknown> };
    expect(tape.material?.opacity ?? 1).toBe(1);
  });
  it("C10: the grandstand is turned to run along the back and fitted by length; the floodlights stand on masts", () => {
    const stand = snapshot.nodes.find((n) => (n as { name?: string }).name === "stadium-grandstand-rear") as { rotation?: number[]; targetLength?: number; targetMaxDimension?: number };
    expect(stand.rotation?.[1]).toBeCloseTo(Math.PI / 2, 9);
    expect(stand.targetLength).toBe(24);
    expect(stand.targetMaxDimension).toBeUndefined();
    for (const side of ["left", "right"]) {
      const mast = snapshot.nodes.find((n) => (n as { name?: string }).name === `stadium-floodlight-mast-${side}`) as { size?: number[] };
      expect(mast.size?.[1]).toBe(9);
      const head = snapshot.nodes.find((n) => (n as { name?: string }).name === `stadium-floodlight-${side}`) as { position?: number[]; targetMaxDimension?: number };
      expect(head.position?.[1]).toBe(9);
      expect(head.targetMaxDimension).toBe(2.2);
    }
  });
  it("C13: one instanced particle node", () => {
    expect(byRuntime("hit-particles")).toBeDefined();
  });
});

describe("top-tennis-C13: hit particles", () => {
  it("writes live particles into one preallocated buffer, coloured from the sim colour, dead slots at zero scale", () => {
    const { registry } = instancedScene(buildParticleNodes());
    const handle = registry.require("hit-particles");
    const updater = createParticleUpdater();
    const parts = [{ x: 0.1, y: 0.5, z: 0.4, life: 0.5, maxLife: 0.54, color: "#6cc8ff" }, { x: -0.2, y: -0.5, z: 0.1, life: 0.1, maxLife: 0.54, color: "#e8ffff" }];
    expect(updater.update(handle, parts)).toBe(2);
    expect(handle.visible).toBe(true);
    expect(updater.matrices[12]).toBeCloseTo(0.1 * COURT_X, 5);
    expect(updater.matrices[14]).toBeCloseTo(0.5 * COURT_Z, 5);
    expect(updater.matrices[0]).toBeGreaterThan(updater.matrices[16]!);
    expect(updater.matrices[32]).toBe(0);
    const [r, g, b] = hexToLinear("#6cc8ff");
    expect([updater.rgba[0], updater.rgba[1], updater.rgba[2]].map((v) => +v!.toFixed(5))).toEqual([r, g, b].map((v) => +v.toFixed(5)));
    const snap = handle.snapshot() as { instanceRgba?: Float32Array; instanceMatrices?: Float32Array };
    expect(snap.instanceRgba?.length).toBe(PARTICLE_CAPACITY * 4);
    expect(updater.update(handle, [])).toBe(0);
    expect(handle.visible).toBe(false);
  });
});

describe("top-tennis-C14: crowd, applause and umpire calls", () => {
  it("umpire calls map the sim's point and serve outcomes", () => {
    expect(umpireCall({ type: "point", winner: "ai", call: "OUT" } as never)).toBe("Out");
    expect(umpireCall({ type: "point", winner: "ai", call: "DOUBLE FAULT" } as never)).toBe("Double fault");
    expect(umpireCall({ type: "point", winner: "player", call: "WINNER" } as never)).toBeNull();
    expect(umpireCall({ type: "serve", stage: "result", attempt: { result: "let" } } as never)).toBe("Let");
  });
  it("with ambience on, a point plays applause and the crowd bed and speaks the call; the Moon is silent; muted speaks nothing", async () => {
    const f = createAudioFake();
    const spoken: string[] = [];
    const audio = createTennisAudio({ context: f.ctx as never, random: () => 0.5, fetch: f.bytes, assets: { hit: "/h", bounce: "/b" }, ambience: true, speak: (t) => spoken.push(t) });
    audio.init();
    await f.flush();
    const before = f.ofKind("source").length;
    audio.handleEvent({ type: "point", winner: "player", call: "OUT" } as never);
    expect(f.ofKind("source").length).toBeGreaterThan(before);
    expect(spoken).toEqual(["Out"]);
    audio.setVenue("moon");
    const moon = f.ofKind("source").length;
    audio.handleEvent({ type: "point", winner: "ai", call: "NET" } as never);
    expect(f.ofKind("source").length).toBe(moon);
    audio.setEnabled(false);
    audio.handleEvent({ type: "point", winner: "ai", call: "OUT" } as never);
    expect(spoken).toEqual(["Out", "Net"]);
  });
  it("the shell saves the sound toggle", () => {
    const src = readFileSync("examples/aura-slam/shell/boot.ts", "utf8");
    expect(src).toContain('writeStorage(SOUND_STORAGE_KEY, soundEnabled ? "on" : "off")');
    expect(src).toContain("readStorage(SOUND_STORAGE_KEY)");
  });
});

describe("top-tennis-C17: first-visit coach and hidden unfinished modes", () => {
  it("coach steps use the court-call wording and the player's keys", () => {
    expect(coachSteps("SPACE", "arrows/WASD", ["Q", "E"], false)).toEqual([
      "YOUR SERVE · SPACE TO TOSS", "PRESS SPACE AS THE BALL RISES INTO THE CIRCLE", "RALLY · MOVE WITH ARROWS/WASD, SPACE TO HIT · Q SHORT, E DEEP"
    ]);
    expect(coachSteps("HIT", "", ["Q", "E"], true)[0]).toBe("YOUR SERVE · TAP HIT TO TOSS");
  });
  it("the coach card closes when the Auto player is switched on, and sits clear of the near court", () => {
    expect(readFileSync("examples/aura-slam/shell/boot.ts", "utf8")).toContain("setAutoplay: (on) => { autopilot.enabled = on; if (on) coach.dispose(); }");
    const css = readFileSync("examples/aura-slam/ui/styles.css", "utf8");
    expect(css).toMatch(/\.coach-card\{position:absolute;z-index:9;right:14px;top:250px/);
  });
  it("both pages hide the tournament and online cards and say nothing is coming soon outside them", () => {
    for (const page of ["apps/showcase-top-tennis/index.html", "examples/aura-slam/index.html"]) {
      const html = readFileSync(page, "utf8");
      expect(html).toMatch(/id="mode-tournament" class="mode-choice is-deferred" hidden=""/);
      expect(html).toMatch(/id="mode-online" class="mode-choice is-deferred" hidden=""/);
      const visible = html.replace(/<button id="mode-(tournament|online)"[\s\S]*?<\/button>/g, "");
      expect(visible.toLowerCase()).not.toContain("coming soon");
    }
  });
});

describe("top-tennis-C8 / C11 / C18: lifecycle", () => {
  const boot = readFileSync("examples/aura-slam/shell/boot.ts", "utf8");
  const renderer = readFileSync("examples/aura-slam/view/renderer.ts", "utf8");
  it("C8: context loss pauses and shows the graphics-reset notice; the WebGL 2 text stays for mount failure", () => {
    expect(boot).toContain('canvas.addEventListener("webglcontextlost", onContextLost)');
    expect(boot).toContain('canvas.addEventListener("webglcontextrestored", onContextRestored)');
    expect(boot).not.toMatch(/webglcontextlost", \(\) => \{ byId\("render-error"\)/);
    for (const page of ["apps/showcase-top-tennis/index.html", "examples/aura-slam/index.html"]) expect(readFileSync(page, "utf8")).toContain('id="graphics-reset"');
  });
  it("C2: the renderer owns the backing size (resize: false) and hands layout back to the stylesheet", () => {
    expect(renderer).toContain("resize: false");
    expect(renderer).toContain('target.style.width = ""; target.style.height = "";');
    expect(renderer).toContain("new ResizeObserver(() => syncBacking())");
  });
  it("C8: the safety net does not sample while the context is lost (it reloaded the page mid-match)", () => {
    expect(renderer).toContain("if (!app.deviceLost?.()) net?.sample(frames);");
  });
  it("C11: the renderer asks for a governed tier instead of the ignored string", () => {
    expect(renderer).toContain('renderer: { quality: { tier: "auto" } }');
    expect(renderer).not.toContain('quality: "high"');
  });
  it("C11: the rig-parity harness keeps its fixed tier in the object form (same tier, no string-form warning)", () => {
    const rigparity = readFileSync("examples/aura-slam/view/rigparity/main.ts", "utf8");
    expect(rigparity).toContain('renderer: { quality: { tier: "high" } }');
    expect(rigparity).not.toMatch(/quality:\s*"/);
  });
  it("C18: dispose removes the pointerdown and visibility listeners, both subscriptions, and disposes the app", () => {
    const dispose = boot.slice(boot.indexOf("    dispose() {"));
    for (const needle of ['document.removeEventListener("pointerdown", initAudio)', 'document.removeEventListener("visibilitychange", onVisibility)', "unsubscribeControls()", "unsubscribeSwipe()"]) expect(dispose).toContain(needle);
    expect(renderer).toContain("app?.dispose()");
  });
});
