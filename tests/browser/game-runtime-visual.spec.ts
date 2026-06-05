import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type GameDemoMetricValue = number | string | boolean;
type GameDemoWindow = Window & {
  __AURA3D_GAME_DEMO__?: {
    readonly status?: string;
    readonly metrics?: Record<string, GameDemoMetricValue>;
  };
};

interface BrowserRuntimeEventEvidence {
  readonly controls: {
    readonly moveAxis: number;
    readonly lightPressed: boolean;
    readonly lightReleased: boolean;
  };
  readonly physics: {
    readonly grounded: boolean;
    readonly landedY: number;
    readonly clampedX: number;
  };
  readonly collision: {
    readonly events: readonly string[];
    readonly contactPoints: number;
    readonly activeAttacks: number;
  };
  readonly animationStateChanges: readonly string[];
  readonly hitboxOverlay: {
    readonly attackHitbox: boolean;
    readonly activeFrame: boolean;
    readonly contactPoint: boolean;
    readonly sceneNodeRuntimeTags: boolean;
  };
  readonly hitSpark: {
    readonly spawned: number;
    readonly bridgeEffectIds: number;
  };
  readonly cameraShake: {
    readonly shake: number;
    readonly impacts: number;
  };
  readonly hudUpdate: {
    readonly changedIds: readonly string[];
    readonly rivalHealth: number;
  };
}

const browserRuntimeEvidenceProofIds = [
  "controls",
  "physics",
  "collision",
  "animationStateChanges",
  "nonblankVisualOutput",
  "hitboxOverlay",
  "hitSpark",
  "cameraShake",
  "hudUpdate"
] as const;

test.describe("game runtime visual evidence", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders generated player and arena assets with contact-shadow runtime evidence", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as GameDemoWindow).__AURA3D_GAME_DEMO__?.status === "ready",
      undefined,
      { timeout: 45_000 }
    );
    await page.waitForFunction(
      () => (window as GameDemoWindow).__AURA3D_GAME_DEMO__?.metrics?.visualAssetsLoaded === true,
      undefined,
      { timeout: 15_000 }
    );
    await page.waitForFunction(
      () => Number((window as GameDemoWindow).__AURA3D_GAME_DEMO__?.metrics?.visualAssetRenderItems ?? 0) >= 16,
      undefined,
      { timeout: 10_000 }
    );

    const state = await metrics(page);
    const pixelStats = await canvasPixelStats(page);
    const runtimeEvidence = await collectBrowserRuntimeEventEvidence(page);

    expect(errors).toEqual([]);
    expect(state.visualAssetsLoaded).toBe(true);
    expect(state.productionLikePlayerModel).toBe(true);
    expect(state.productionLikeArenaAsset).toBe(true);
    expect(state.primitivePlayerFallback).toBe(false);
    expect(String(state.visualAssetPlayerUrl)).toContain(".gltf");
    expect(String(state.visualAssetArenaUrl)).toContain(".gltf");
    expect(Number(state.visualAssetPlayerMeshes)).toBeGreaterThanOrEqual(5);
    expect(Number(state.visualAssetArenaMeshes)).toBeGreaterThanOrEqual(6);
    expect(Number(state.visualAssetRenderItems)).toBeGreaterThanOrEqual(16);
    expect(state.contactShadowProxy).toBe(true);
    expect(state.shadowMode).toBe("contact-shadow-proxy");
    expect(pixelStats.nonBlankPixels).toBeGreaterThan(300);
    expect(pixelStats.colorBuckets).toBeGreaterThanOrEqual(1);
    expect(browserRuntimeEvidenceProofIds).toEqual([
      "controls",
      "physics",
      "collision",
      "animationStateChanges",
      "nonblankVisualOutput",
      "hitboxOverlay",
      "hitSpark",
      "cameraShake",
      "hudUpdate"
    ]);
    expect(runtimeEvidence.controls).toMatchObject({
      moveAxis: 1,
      lightPressed: true,
      lightReleased: true
    });
    expect(runtimeEvidence.physics).toMatchObject({
      grounded: true,
      landedY: 0,
      clampedX: 1
    });
    expect(runtimeEvidence.collision.events).toEqual(expect.arrayContaining(["hit"]));
    expect(runtimeEvidence.collision.contactPoints).toBeGreaterThan(0);
    expect(runtimeEvidence.collision.activeAttacks).toBeGreaterThan(0);
    expect(runtimeEvidence.animationStateChanges).toEqual(expect.arrayContaining(["light", "guard", "dash"]));
    expect(runtimeEvidence.hitboxOverlay).toMatchObject({
      attackHitbox: true,
      activeFrame: true,
      contactPoint: true,
      sceneNodeRuntimeTags: true
    });
    expect(runtimeEvidence.hitSpark.spawned).toBeGreaterThan(0);
    expect(runtimeEvidence.hitSpark.bridgeEffectIds).toBeGreaterThan(0);
    expect(runtimeEvidence.cameraShake.impacts).toBe(1);
    expect(runtimeEvidence.cameraShake.shake).toBeGreaterThan(0);
    expect(runtimeEvidence.hudUpdate.changedIds).toEqual(expect.arrayContaining(["hud:rival:health"]));
    expect(runtimeEvidence.hudUpdate.rivalHealth).toBe(88);
    await expect(page.locator("[data-testid='game-slice-canvas']")).toBeVisible();
    await writeGameRuntimeBrowserProof(page, "tests/reports/game-runtime/combat-visual-evidence.json", {
      proofIds: [...browserRuntimeEvidenceProofIds],
      route: "/examples/game-slice/index.html",
      metrics: {
        visualState: state,
        pixelStats,
        runtimeEvidence
      },
      runtime: {
        systems: ["input", "physics", "collision", "animation", "effectsPlan", "cameraPlan", "stage"]
      }
    });
  });
});

async function metrics(page: Page): Promise<Record<string, GameDemoMetricValue>> {
  return page.evaluate(() => (window as GameDemoWindow).__AURA3D_GAME_DEMO__?.metrics ?? {});
}

async function canvasPixelStats(page: Page): Promise<{ readonly nonBlankPixels: number; readonly colorBuckets: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='game-slice-canvas']");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) return { nonBlankPixels: 0, colorBuckets: 0 };

    const width = Math.min(160, canvas.width);
    const height = Math.min(90, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    const buckets = new Set<string>();
    let nonBlankPixels = 0;

    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      if (alpha > 0 && red + green + blue > 12) {
        nonBlankPixels += 1;
        buckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
      }
    }

    return { nonBlankPixels, colorBuckets: buckets.size };
  });
}

async function collectBrowserRuntimeEventEvidence(page: Page): Promise<BrowserRuntimeEventEvidence> {
  return page.evaluate(async () => {
    const modulePath = "/packages/engine/src/index.ts";
    const engine = await import(modulePath);
    const fixedDt = 1 / 60;

    const input = engine.game.input({
      actions: {
        moveLeft: ["KeyA"],
        moveRight: ["KeyD"],
        light: ["KeyJ"]
      },
      axes: {
        moveX: { negative: "moveLeft", positive: "moveRight" }
      },
      autoListen: false
    });
    input.press("KeyD");
    input.press("KeyJ");
    const pressed = input.update(fixedDt);
    input.release("KeyJ");
    const released = input.update(fixedDt);
    input.release("KeyD");
    input.dispose();

    const falling = engine.game.kinematicBody({
      id: "browser-physics-body",
      position: [0, 1.8, 0],
      gravity: -20,
      groundY: 0,
      friction: 0,
      bounds: { minX: -1, maxX: 1, minZ: -0.5, maxZ: 0.5 }
    });
    let landed = falling.snapshot();
    for (let frame = 0; frame < 90; frame += 1) landed = falling.update(fixedDt);

    const clamped = engine.game.kinematicBody({
      id: "browser-clamped-body",
      position: [0, 0, 0],
      gravity: 0,
      friction: 10,
      bounds: { minX: -1, maxX: 1, minZ: -0.5, maxZ: 0.5 }
    });
    clamped.dash([1, 0, 0], 80);
    const clampedSnapshot = clamped.update(1);

    const stateFor = (binding: string): string => {
      const kit = engine.game.fighting({ autoListen: false, opponentAi: false });
      kit.input.press(binding);
      const state = kit.update(fixedDt).states.player;
      kit.input.release(binding);
      kit.input.dispose();
      return state;
    };
    const animationStateChanges = [stateFor("KeyJ"), stateFor("KeyK"), stateFor("ShiftLeft")];

    const combat = engine.game.combatWorld();
    combat.addActor({ id: "player", team: "p1", position: [0, 0, 0], facing: 1, meter: 0 });
    combat.addActor({ id: "rival", team: "p2", position: [0.86, 0, 0], facing: -1, health: 100 });
    combat.beginAttack("player", {
      id: "browser-proof-jab",
      damage: 12,
      meterGain: 6,
      activeFrames: [1, 1],
      durationFrames: 4,
      hitboxes: [{ id: "browser-proof-jab-hitbox", offset: [0.62, 0.86, 0], size: [0.52, 0.36, 0.46] }]
    });
    const resolved = combat.update(fixedDt);
    const overlay = engine.game.debug.overlay({ combat: resolved });
    const sceneNodes = engine.game.debug.sceneNodes(overlay, { includeLabels: true });
    const overlayTags = overlay.geometry.flatMap((node: { readonly tags?: readonly string[] }) => node.tags ?? []);

    const effects = engine.game.effects();
    const camera = engine.game.cameraDirector();
    const bridge = engine.game.combatEvents(resolved.events, {
      combat: resolved,
      effects,
      camera,
      hudBindings: [
        engine.game.hud.health({ actorId: "rival", label: "Rival health" }),
        engine.game.hud.meter({ actorId: "player", label: "Player meter" })
      ],
      rules: { maxHealth: 100, maxMeter: 100 }
    });
    const cameraSnapshot = camera.update(fixedDt, [
      { id: "player", position: [0, 0, 0] },
      { id: "rival", position: [0.86, 0, 0] }
    ]);
    const effectSnapshot = effects.snapshot();
    const rivalHealth = bridge.hud?.values.find((value: { readonly id: string }) => value.id === "hud:rival:health");

    return {
      controls: {
        moveAxis: pressed.axes?.moveX ?? 0,
        lightPressed: pressed.actions.light?.pressed === true,
        lightReleased: released.actions.light?.released === true
      },
      physics: {
        grounded: landed.grounded === true,
        landedY: landed.position[1],
        clampedX: clampedSnapshot.position[0]
      },
      collision: {
        events: resolved.events.map((event: { readonly type: string }) => event.type),
        contactPoints: overlayTags.filter((tag: string) => tag === "contact-point").length,
        activeAttacks: resolved.activeAttacks.length
      },
      animationStateChanges,
      hitboxOverlay: {
        attackHitbox: overlayTags.includes("attack-hitbox"),
        activeFrame: overlayTags.includes("active-frame"),
        contactPoint: overlayTags.includes("contact-point"),
        sceneNodeRuntimeTags: sceneNodes.some((node: { readonly runtime?: { readonly tags?: readonly string[] } }) =>
          node.runtime?.tags?.includes("attack-hitbox") === true ||
          node.runtime?.tags?.includes("active-frame") === true ||
          node.runtime?.tags?.includes("contact-point") === true
        )
      },
      hitSpark: {
        spawned: effectSnapshot.spawned,
        bridgeEffectIds: bridge.effectIds.length
      },
      cameraShake: {
        shake: cameraSnapshot.shake,
        impacts: bridge.cameraImpacts
      },
      hudUpdate: {
        changedIds: bridge.hud?.changedIds ?? [],
        rivalHealth: Number(rivalHealth?.value ?? -1)
      }
    };
  });
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function writeGameRuntimeBrowserProof(
  page: Page,
  reportPath: string,
  payload: Record<string, unknown>
): Promise<void> {
  const absoluteReportPath = resolve(reportPath);
  const screenshotPath = reportPath.replace(/\.json$/, ".png");
  const absoluteScreenshotPath = resolve(screenshotPath);
  mkdirSync(dirname(absoluteReportPath), { recursive: true });
  await page.screenshot({ path: absoluteScreenshotPath, fullPage: true });
  const screenshotBytes = readFileSync(absoluteScreenshotPath);
  const viewport = page.viewportSize();
  const report = {
    kind: "aura3d-game-runtime-browser-proof",
    ok: true,
    generatedAt: new Date().toISOString(),
    ...payload,
    screenshot: {
      path: screenshotPath,
      sha256: `sha256:${createHash("sha256").update(screenshotBytes).digest("hex")}`,
      width: viewport?.width ?? 0,
      height: viewport?.height ?? 0
    }
  };
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
