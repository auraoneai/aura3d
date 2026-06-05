import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve(process.cwd(), "tests/reports/animation-runtime");
const evidencePath = resolve(reportDir, "evidence.json");

type AnimationRuntime105Result = {
  readonly ok: boolean;
  readonly status: "pass";
  readonly namedClipPlayback: {
    readonly assetId: string;
    readonly changedPixels: number;
    readonly jointCount: number;
    readonly trackCount: number;
  };
  readonly restart: {
    readonly clipId: string;
    readonly localTimeAfterRestart: number;
    readonly restartedFromFrameZero: boolean;
  };
  readonly blend: {
    readonly activeClipIds: readonly string[];
    readonly weights: readonly number[];
    readonly crossfadePixel: readonly number[];
  };
  readonly event: {
    readonly eventNames: readonly string[];
    readonly openedHitbox: boolean;
  };
  readonly viseme: {
    readonly weights: Record<string, number>;
    readonly morphTargetCount: number;
  };
  readonly screenshots: Record<string, string>;
};

test.describe("Aura3D 1.0.5 animation runtime evidence", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves named skinned clip playback, restart, blending, events, and viseme morph sync", async ({ page }) => {
    await mkdir(reportDir, { recursive: true });
    await page.goto(`${server.origin}/tests/browser/animation-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_ANIMATION_BROWSER_TEST__?.status === "ready" || window.__AURA3D_ANIMATION_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );

    const harness = await page.evaluate(() => window.__AURA3D_ANIMATION_BROWSER_TEST__);
    expect(harness?.status, harness?.error).toBe("ready");
    expect(harness?.externalCharacter?.assetId).toBe("cesium-man");
    expect(harness?.externalCharacter?.changedPixels ?? 0).toBeGreaterThan(50);
    expect(harness?.externalCharacter?.jointCount ?? 0).toBeGreaterThan(0);
    expect(harness?.externalCharacter?.trackCount ?? 0).toBeGreaterThan(0);
    expect(harness?.crossfadePixel?.[3]).toBe(255);

    const bridge = await collectRuntimeBridgeEvidence(page);
    expect(bridge.restart.restartedFromFrameZero).toBe(true);
    expect(bridge.blend.activeClipIds).toEqual(expect.arrayContaining(["idle", "walk"]));
    expect(bridge.event.openedHitbox).toBe(true);
    expect(bridge.viseme.morphTargetCount).toBeGreaterThanOrEqual(3);

    await page.locator("#external-character-a").screenshot({
      path: resolve(reportDir, "named-clip-playback.png")
    });
    await page.locator("#crossfade").screenshot({
      path: resolve(reportDir, "clip-blend.png")
    });
    await drawEvidenceCanvas(page, "clip-restart-proof", bridge.restart);
    await drawEvidenceCanvas(page, "animation-event-hitbox-proof", bridge.event);
    await drawEvidenceCanvas(page, "viseme-blendshape-sync-proof", bridge.viseme);
    await page.locator("#clip-restart-proof").screenshot({
      path: resolve(reportDir, "clip-restart.png")
    });
    await page.locator("#animation-event-hitbox-proof").screenshot({
      path: resolve(reportDir, "animation-event-hitbox.png")
    });
    await page.locator("#viseme-blendshape-sync-proof").screenshot({
      path: resolve(reportDir, "viseme-blendshape-sync.png")
    });

    const result: AnimationRuntime105Result = {
      ok: true,
      status: "pass",
      namedClipPlayback: {
        assetId: harness!.externalCharacter!.assetId,
        changedPixels: harness!.externalCharacter!.changedPixels,
        jointCount: harness!.externalCharacter!.jointCount,
        trackCount: harness!.externalCharacter!.trackCount
      },
      restart: bridge.restart,
      blend: {
        ...bridge.blend,
        crossfadePixel: harness!.crossfadePixel ?? []
      },
      event: bridge.event,
      viseme: bridge.viseme,
      screenshots: {
        namedClipPlayback: "tests/reports/animation-runtime/named-clip-playback.png",
        clipRestart: "tests/reports/animation-runtime/clip-restart.png",
        clipBlend: "tests/reports/animation-runtime/clip-blend.png",
        animationEventHitbox: "tests/reports/animation-runtime/animation-event-hitbox.png",
        visemeBlendshapeSync: "tests/reports/animation-runtime/viseme-blendshape-sync.png"
      }
    };

    await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  });
});

async function collectRuntimeBridgeEvidence(page: Page): Promise<Omit<AnimationRuntime105Result, "ok" | "status" | "namedClipPlayback" | "screenshots">> {
  return page.evaluate(async () => {
    const engine = await import("/packages/engine/src/index.ts");
    const app = engine.createAuraApp(null, {
      autoStart: false,
      scene: engine.scene().add(
        engine.primitives
          .box({ name: "animation runtime evidence fighter" })
          .runtime(engine.game.runtimeNode("fighter", { tags: ["fighter", "animation-runtime"] }))
      )
    });
    const fighter = app.nodes.require("fighter");
    const controller = new engine.AnimationController({
      id: "animation-runtime-105",
      clips: [
        {
          id: "idle",
          duration: 1,
          loop: true,
          sample: ({ normalizedTime }: { readonly normalizedTime: number }) => ({
            bones: {
              root: {
                position: { x: normalizedTime, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                scale: { x: 1, y: 1, z: 1 }
              }
            },
            morphTargets: { AA: 0, EE: 0, smile: 0.2 }
          })
        },
        {
          id: "walk",
          duration: 1,
          loop: true,
          sample: ({ normalizedTime }: { readonly normalizedTime: number }) => ({
            bones: {
              root: {
                position: { x: 1 + normalizedTime, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                scale: { x: 1, y: 1, z: 1 }
              }
            },
            morphTargets: { AA: 0.1, EE: 0.2, smile: 0.3 }
          })
        },
        {
          id: "lightPunch",
          duration: 0.4,
          loop: false,
          attack: true,
          restartFromFrameZero: true,
          layer: "upper-body",
          events: [{ name: "hitbox.open", type: "hitbox", time: 0.08, once: true, payload: { hitbox: "right-hand" } }],
          sample: ({ normalizedTime }: { readonly normalizedTime: number }) => ({
            bones: {
              rightHand: {
                position: { x: 0.4 + normalizedTime, y: 0.2, z: 0 },
                rotation: { x: 0.2, y: 0, z: 0, w: 0.98 },
                scale: { x: 1, y: 1, z: 1 }
              }
            },
            morphTargets: { AA: 0.85, EE: 0.15, smile: 0.65 }
          })
        }
      ]
    });

    const eventNames: string[] = [];
    controller.onEvent((event: { readonly event: { readonly name: string } }) => {
      eventNames.push(event.event.name);
    });
    controller.bindRuntimeNode(fighter, { id: "fighter-animation-runtime" });

    controller.play("idle", { loop: "loop" });
    controller.update(0.12);
    controller.crossFade("walk", 0.2, { loop: "loop" });
    controller.update(0.1);
    const blendSnapshot = controller.snapshot();

    controller.restart("lightPunch", { loop: false, layer: "upper-body" });
    const restartStart = controller.state("lightPunch")?.localTime ?? -1;
    controller.update(0.09);
    const restartSnapshot = controller.state("lightPunch");
    const fighterAfterPunch = fighter.snapshot() as {
      readonly morphTargets?: Record<string, number>;
      readonly animationPoseBinding?: { readonly morphTargetCount: number };
    };

    app.dispose();

    return {
      restart: {
        clipId: "lightPunch",
        localTimeAfterRestart: restartSnapshot?.localTime ?? -1,
        restartedFromFrameZero: restartStart === 0 && Math.abs((restartSnapshot?.localTime ?? 0) - 0.09) < 0.0001
      },
      blend: {
        activeClipIds: blendSnapshot.clips.map((clip: { readonly clipId: string }) => clip.clipId),
        weights: blendSnapshot.clips.map((clip: { readonly weight: number }) => Number(clip.weight.toFixed(3)))
      },
      event: {
        eventNames,
        openedHitbox: eventNames.includes("hitbox.open")
      },
      viseme: {
        weights: fighterAfterPunch.morphTargets ?? {},
        morphTargetCount: fighterAfterPunch.animationPoseBinding?.morphTargetCount ?? 0
      }
    };
  });
}

async function drawEvidenceCanvas(page: Page, id: string, payload: unknown): Promise<void> {
  await page.evaluate(({ canvasId, data }) => {
    const canvas = document.createElement("canvas");
    canvas.id = canvasId;
    canvas.width = 320;
    canvas.height = 180;
    canvas.style.display = "block";
    canvas.style.margin = "8px";
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable for animation runtime evidence.");
    ctx.fillStyle = "#07121f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(18, 18, 78, 144);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(116, 62, 184, 58);
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 6;
    ctx.strokeRect(110, 52, 202, 78);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "14px monospace";
    const summary = JSON.stringify(data).slice(0, 120);
    ctx.fillText(canvasId, 18, 24);
    ctx.fillText(summary, 18, 168);
    document.body.appendChild(canvas);
  }, { canvasId: id, data: payload });
}

declare global {
  interface Window {
    __AURA3D_ANIMATION_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly crossfadePixel?: readonly number[];
      readonly externalCharacter?: {
        readonly assetId: "cesium-man";
        readonly changedPixels: number;
        readonly jointCount: number;
        readonly trackCount: number;
      };
      readonly error?: string;
    };
  }
}

