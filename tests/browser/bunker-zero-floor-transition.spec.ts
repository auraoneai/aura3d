import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type GameSnapshot = {
  mode: string;
  floor: number;
  time: number;
  simSteps: number;
  paused: boolean;
  finished: boolean;
  medal: string;
  alive: boolean;
  pending: string | null;
  frameErrors: number;
  lastFrameError: string;
  banner: string;
};

type BunkerQa = {
  snapshot(): GameSnapshot;
  freeze(): void;
  unfreeze(): void;
  dismissIntro(): boolean;
  autopilot(on: boolean): boolean;
  advance(seconds: number): GameSnapshot;
};

type TextureRow = {
  nodeName?: string;
  status?: string;
  stage?: string;
  pendingMs?: number;
  pixelBacked?: boolean;
  slots?: string[];
  warnings?: string[];
};

type NodeHandle = {
  visible: boolean;
  snapshot(): { material?: { texture?: unknown; normal?: unknown } };
};

type ProbeApp = {
  nodes: { has(id: string): boolean; get(id: string): NodeHandle | undefined };
  diagnostics(): { renderer?: { runtime?: { mounted?: boolean; backend?: string; texturedMaterials?: TextureRow[] } } };
};

type Surface = {
  mapped: { visible: boolean; hasTexture: boolean; hasNormal: boolean } | null;
  placeholder: { visible: boolean } | null;
};

type TextureSample = {
  state: string;
  rowCount: number | null;
  reason?: string;
  stage?: string;
  pendingMs?: number;
  pixelBacked?: boolean;
  warnings?: string[];
};

type Sample = {
  observedAtMs: number;
  diagnosticsSampledAtMs: number;
  game: GameSnapshot;
  evidence: { mode?: string; floor?: number; floorName?: string; run?: { startFloor?: number; floorsCleared?: number } } | null;
  surfaces: Record<string, Surface>;
  textures: Record<string, TextureSample>;
  rendererBackend: string | null;
};

function textureObservationIssue(transition: string, reveal: string): string | null {
  const states = [transition, reveal];
  if (states.includes("fallback")) return "texture fallback";
  if (states.includes("textured-not-pixel-backed")) return "textured material is not pixel-backed";
  if (!states.some((state) => state === "pending" || state === "ready")) return "no pending or ready texture observation";
  return null;
}

let server: ExampleDevServer;
test.setTimeout(1_200_000);
test.beforeAll(async () => {
  if (process.platform === "darwin" || !process.env.CI) throw new Error("Run this browser spec on a remote CI runner, never locally.");
  server = await startExampleDevServer();
});
test.afterAll(async () => { await server?.close(); });

test("bunker zero prepares and reveals floor two after a floor-one clear", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 800, height: 450 });
  await page.goto(`${server.origin}/apps/showcase-bunker-zero/`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForFunction(() => {
    const w = window as unknown as { __AURA_BUNKER_ZERO_QA__?: unknown; __AURA3D_ROUTE_READY__?: { ready?: boolean } };
    return w.__AURA3D_ROUTE_READY__?.ready === true && Boolean(w.__AURA_BUNKER_ZERO_QA__);
  }, undefined, { timeout: 420_000 });

  const trace = await page.evaluate(async () => {
    const w = window as unknown as {
      __AURA_BUNKER_ZERO_QA__?: BunkerQa;
      __AURA3D_LIVE_APPS__?: { all(): ProbeApp[] };
      __gameEvidence?: Sample["evidence"];
    };
    const qa = w.__AURA_BUNKER_ZERO_QA__;
    const app = w.__AURA3D_LIVE_APPS__?.all().find((candidate) => candidate.nodes.has("f0-s-floor"));
    if (!qa || !app) throw new Error("Bunker QA hook or live app is unavailable");

    const keys = ["walls", "accent", "floor", "ceil", "floor-alt"];
    const texturedKeys = keys.slice(0, 4);
    const sample = (game: GameSnapshot, observedAtMs: number): Sample => {
      const surfaces: Record<string, Surface> = {};
      for (const key of keys) {
        const mapped = app.nodes.get(`f1-s-${key}`);
        const placeholder = app.nodes.get(`f1-s-${key}-ph`);
        const material = mapped?.snapshot().material;
        surfaces[key] = {
          mapped: mapped ? { visible: mapped.visible, hasTexture: Boolean(material?.texture), hasNormal: Boolean(material?.normal) } : null,
          placeholder: placeholder ? { visible: placeholder.visible } : null
        };
      }

      let rows: TextureRow[] | null = null;
      let backend: string | null = null;
      let unavailableReason = "renderer diagnostics unavailable";
      try {
        const runtime = app.diagnostics().renderer?.runtime;
        backend = runtime?.backend ?? null;
        if (runtime?.mounted === true && Array.isArray(runtime.texturedMaterials)) rows = runtime.texturedMaterials;
        else unavailableReason = "renderer is not mounted or textured-material diagnostics are missing";
      } catch (error) {
        unavailableReason = `diagnostics threw: ${String(error)}`;
      }
      const diagnosticsSampledAtMs = performance.now();
      const textures: Record<string, TextureSample> = {};
      for (const key of texturedKeys) {
        const matches = rows?.filter((row) => row.nodeName === `f1 ${key}`) ?? null;
        if (!surfaces[key]!.mapped) {
          textures[key] = { state: "not-mounted", rowCount: matches?.length ?? null };
          continue;
        }
        if (!matches) {
          textures[key] = { state: "unavailable", rowCount: null, reason: unavailableReason };
          continue;
        }
        const placeholderIndex = matches.findIndex((row) => row.status === "none");
        if (matches.length !== 2 || placeholderIndex < 0) {
          textures[key] = { state: "unavailable", rowCount: matches.length, reason: "mapped and map-free placeholder rows cannot be distinguished" };
          continue;
        }
        const row = matches[1 - placeholderIndex]!;
        const state = row.status === "textured" ? row.pixelBacked === true ? "ready" : "textured-not-pixel-backed"
          : row.status === "pending" || row.status === "none" || row.status === "fallback" ? row.status : "unavailable";
        textures[key] = {
          state,
          rowCount: matches.length,
          ...(state === "unavailable" ? { reason: `unrecognized status ${String(row.status)}` } : {}),
          ...(row.stage === undefined ? {} : { stage: row.stage }),
          ...(row.pendingMs === undefined ? {} : { pendingMs: row.pendingMs }),
          ...(row.pixelBacked === undefined ? {} : { pixelBacked: row.pixelBacked }),
          ...(row.warnings?.length ? { warnings: row.warnings.map((warning) => warning.slice(0, 180)) } : {})
        };
      }
      const evidence = w.__gameEvidence;
      return {
        observedAtMs, diagnosticsSampledAtMs, game,
        evidence: evidence ? {
          ...(evidence.mode === undefined ? {} : { mode: evidence.mode }),
          ...(evidence.floor === undefined ? {} : { floor: evidence.floor }),
          ...(evidence.floorName === undefined ? {} : { floorName: evidence.floorName }),
          ...(evidence.run === undefined ? {} : { run: { ...evidence.run } })
        } : null,
        surfaces, textures, rendererBackend: backend
      };
    };

    const trace: {
      clock: string;
      method: string;
      diagnosticLimit: string;
      timeOrigin: number;
      boot: Sample | null;
      transition: Sample | null;
      reveal: Sample | null;
      transitionLowerBoundMs: number | null;
      revealLowerBoundMs: number | null;
      failure: string | null;
    } = {
      clock: "performance.now(), relative to this document's timeOrigin",
      method: "QA autopilot with individual 1/60-second simulation steps through the first pending tick; frame-driven transition thereafter",
      diagnosticLimit: "app.diagnostics may return cached rows while the renderer is busy; synchronous sampling can delay the transition; node activation is not a presented-frame receipt",
      timeOrigin: performance.timeOrigin,
      boot: null, transition: null, reveal: null,
      transitionLowerBoundMs: null, revealLowerBoundMs: null, failure: null
    };

    try {
      qa.freeze();
      qa.dismissIntro();
      qa.autopilot(true);
      trace.boot = sample(qa.snapshot(), performance.now());
      for (let step = 0; step < 10_800; step++) {
        const beforeAdvance = performance.now();
        const state = qa.advance(1 / 60);
        const observedAtMs = performance.now();
        if (state.floor !== 1 || !state.alive || (state.pending !== null && state.pending !== "next")) {
          throw new Error(`unexpected floor-one state: ${JSON.stringify(state)}`);
        }
        if (state.pending === "next") {
          trace.transitionLowerBoundMs = beforeAdvance;
          trace.transition = sample(state, observedAtMs);
          break;
        }
        if (state.finished) throw new Error("floor finished without a next-floor transition");
        if (step % 60 === 59) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (!trace.transition) throw new Error("autopilot did not clear floor one within the simulation budget");

      qa.autopilot(false);
      qa.unfreeze();
      const waitStartedAtMs = performance.now();
      let lastFloorOneAtMs = trace.transition.observedAtMs;
      while (performance.now() - waitStartedAtMs < 240_000) {
        const state = qa.snapshot();
        const observedAtMs = performance.now();
        if (state.floor === 2) {
          trace.revealLowerBoundMs = lastFloorOneAtMs;
          trace.reveal = sample(state, observedAtMs);
          break;
        }
        if (state.floor !== 1 || state.pending !== "next") throw new Error(`unexpected transition state: ${JSON.stringify(state)}`);
        lastFloorOneAtMs = observedAtMs;
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
      if (!trace.reveal) throw new Error("floor two was not observed within the browser test timeout");
    } catch (error) {
      trace.failure = error instanceof Error ? error.message : String(error);
    }
    return trace;
  });

  await testInfo.attach("bunker-zero-floor-transition", {
    body: Buffer.from(JSON.stringify({ ...trace, pageErrors }, null, 2)),
    contentType: "application/json"
  });
  const brief = (sample: Sample | null) => sample && ({
    observedAtMs: sample.observedAtMs,
    diagnosticsSampledAtMs: sample.diagnosticsSampledAtMs,
    floor: sample.game.floor,
    pending: sample.game.pending,
    textures: sample.textures
  });
  console.log(`BZ_TRANSITION ${JSON.stringify({
    clock: "performance.now", timeOrigin: trace.timeOrigin, simulatedLeadIn: true, simulationStepSeconds: 1 / 60,
    diagnosticsMayBeCached: true, samplingMayDelayTransition: true, revealKind: "node activation, not a presented frame",
    boot: brief(trace.boot), transition: brief(trace.transition), reveal: brief(trace.reveal),
    transitionLowerBoundMs: trace.transitionLowerBoundMs, revealLowerBoundMs: trace.revealLowerBoundMs, failure: trace.failure
  })}`);

  expect(trace.failure).toBeNull();
  expect(pageErrors).toEqual([]);
  expect(trace.boot).not.toBeNull();
  expect(trace.transition).not.toBeNull();
  expect(trace.reveal).not.toBeNull();
  const boot = trace.boot!;
  const transition = trace.transition!;
  const reveal = trace.reveal!;
  expect(boot.game).toMatchObject({ mode: "descent", floor: 1, paused: false, finished: false, alive: true, pending: null, frameErrors: 0 });
  expect(transition.game).toMatchObject({ mode: "descent", floor: 1, finished: true, alive: true, pending: "next", frameErrors: 0 });
  expect(transition.game.medal).not.toBe("none");
  expect(transition.game.banner).toContain("CLEARED");
  expect(reveal.game).toMatchObject({ mode: "descent", floor: 2, finished: false, pending: null, frameErrors: 0 });
  expect(reveal.evidence).toMatchObject({ mode: "descent", floor: 2, floorName: "Flooded Cellars", run: { startFloor: 1, floorsCleared: 1 } });
  expect(trace.transitionLowerBoundMs).not.toBeNull();
  expect(trace.revealLowerBoundMs).not.toBeNull();
  expect(trace.transitionLowerBoundMs!).toBeGreaterThanOrEqual(boot.observedAtMs);
  expect(transition.observedAtMs).toBeGreaterThanOrEqual(trace.transitionLowerBoundMs!);
  expect(trace.revealLowerBoundMs!).toBeGreaterThanOrEqual(transition.observedAtMs);
  expect(reveal.observedAtMs).toBeGreaterThanOrEqual(trace.revealLowerBoundMs!);
  for (const key of ["walls", "accent", "floor", "ceil", "floor-alt"]) {
    expect(boot.surfaces[key]!.mapped, `${key} deferred at boot`).toBeNull();
    expect(boot.surfaces[key]!.placeholder, `${key} placeholder at boot`).toEqual({ visible: false });
    expect(transition.surfaces[key]!.mapped, `${key} prepared during floor clear`).toMatchObject({ visible: false });
    expect(transition.surfaces[key]!.placeholder, `${key} placeholder during floor clear`).toEqual({ visible: false });
    expect(reveal.surfaces[key]!.mapped, `${key} mounted on floor two`).toMatchObject({ visible: true });
    expect(reveal.surfaces[key]!.placeholder, `${key} placeholder on floor two`).toEqual({ visible: false });
    if (key !== "floor-alt") {
      expect(transition.surfaces[key]!.mapped, `${key} map references`).toMatchObject({ hasTexture: true, hasNormal: true });
      expect(textureObservationIssue(transition.textures[key]!.state, reveal.textures[key]!.state), `${key} texture diagnostics`).toBeNull();
    } else {
      expect(reveal.surfaces[key]!.mapped, "floor-two water is intentionally map-free").toMatchObject({ hasTexture: false, hasNormal: false });
    }
  }
});
