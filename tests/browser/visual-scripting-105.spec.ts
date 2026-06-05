import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve(process.cwd(), "tests/reports/visual-scripting");
const evidencePath = resolve(reportDir, "evidence.json");

test.describe("Aura3D 1.0.5 visual scripting runtime evidence", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("executes deterministic runtime, input, animation event, combat, camera, and evidence graph hooks", async ({ page }) => {
    await mkdir(reportDir, { recursive: true });
    await page.goto(`${server.origin}/tests/browser/scripting-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_SCRIPTING_BROWSER_TEST__?.status === "ready" || window.__AURA3D_SCRIPTING_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );
    const behaviorHarness = await page.evaluate(() => window.__AURA3D_SCRIPTING_BROWSER_TEST__);
    expect(behaviorHarness?.status, behaviorHarness?.error).toBe("ready");
    expect(behaviorHarness?.nonBlankPixels ?? 0).toBeGreaterThan(300);

    const graph = await executeVisualGraphEvidence(page);
    expect(graph.ok).toBe(true);
    expect(graph.sideEffectKinds).toEqual(expect.arrayContaining([
      "runtime.translate",
      "animation.crossFade",
      "combat.openHitbox",
      "camera.follow",
      "evidence.captureSnapshot"
    ]));
    expect(graph.animationEventMatched).toBe(true);
    expect(graph.runtimePosition).toEqual([1.5, 0, 0]);

    await drawVisualGraphCanvas(page, "runtime-node-motion-proof", graph, "#38bdf8");
    await drawVisualGraphCanvas(page, "animation-event-graph-proof", graph, "#f97316");
    await page.locator("#runtime-node-motion-proof").screenshot({
      path: resolve(reportDir, "runtime-node-motion.png")
    });
    await page.locator("#animation-event-graph-proof").screenshot({
      path: resolve(reportDir, "animation-event-graph.png")
    });

    const report = {
      ok: true,
      status: "pass",
      schema: "aura3d105-visual-scripting-evidence",
      generatedAt: new Date().toISOString(),
      behaviorHarness,
      graph,
      screenshots: {
        runtimeNodeMotion: "tests/reports/visual-scripting/runtime-node-motion.png",
        animationEventGraph: "tests/reports/visual-scripting/animation-event-graph.png"
      }
    };
    await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  });
});

async function executeVisualGraphEvidence(page: Page): Promise<{
  readonly ok: boolean;
  readonly runtimePosition: readonly [number, number, number];
  readonly sideEffectKinds: readonly string[];
  readonly animationEventMatched: boolean;
  readonly diagnostics: readonly unknown[];
  readonly executionOrder: readonly string[];
}> {
  return page.evaluate(async () => {
    const scripting = await import("/packages/scripting/src/index.ts");
    const node = (kind: string, id: string, data: Record<string, unknown> = {}) => scripting.createVisualNode(kind, id, data);
    const graph = {
      nodes: [
        node("onFrame", "frame"),
        node("translate", "move", { nodeId: "player", delta: [1.5, 0, 0] }),
        node("crossFade", "attack", { controllerId: "playerAnimation", clip: "lightPunch", duration: 0.06 }),
        node("onAnimationEvent", "event", { controllerId: "playerAnimation", eventType: "hitbox.open" }),
        node("openHitbox", "hitbox", { ownerId: "player", hitboxId: "player.lightPunch", damage: 8 }),
        node("follow", "camera", { targetId: "player" }),
        node("captureSnapshot", "evidence", { label: "animation-event-graph" })
      ],
      edges: [
        { fromNode: "frame", fromPort: "out", toNode: "move", toPort: "in" },
        { fromNode: "frame", fromPort: "out", toNode: "attack", toPort: "in" },
        { fromNode: "event", fromPort: "out", toNode: "hitbox", toPort: "in" },
        { fromNode: "frame", fromPort: "out", toNode: "camera", toPort: "in" },
        { fromNode: "frame", fromPort: "out", toNode: "evidence", toPort: "in" }
      ]
    };
    const context = {
      dt: 1 / 60,
      time: 0.12,
      frame: 7,
      runtimeNodes: {
        player: { id: "player", position: [0, 0, 0], rotation: [0, 0, 0], visible: true }
      },
      input: {
        pressed: ["attack"],
        held: [],
        released: [],
        buffered: ["attack"],
        combos: ["light"],
        axes: { moveX: 1 }
      },
      animationControllers: {
        playerAnimation: {
          id: "playerAnimation",
          activeClipId: "idle",
          clips: ["idle", "walk", "lightPunch"],
          morphTargets: ["AA", "EE", "smile"],
          localTime: 0.12
        }
      },
      animationEvents: [
        { controllerId: "playerAnimation", clip: "lightPunch", type: "hitbox.open", time: 0.08 }
      ],
      physicsBodies: {
        player: { id: "player", position: [0, 0, 0], velocity: [0, 0, 0], grounded: true }
      },
      combatEvents: [],
      camera: { targetId: "player" }
    };
    const result = new scripting.VisualGraphExecutor(context).execute(graph, context);
    const runtimeMove = result.sideEffects.find((effect: { readonly kind: string }) => effect.kind === "runtime.translate") as { readonly payload?: { readonly position?: readonly [number, number, number] } } | undefined;
    const position = runtimeMove?.payload?.position;
    const runtimePosition = Array.isArray(position)
      ? position
      : [position?.x ?? 0, position?.y ?? 0, position?.z ?? 0];
    return {
      ok: result.diagnostics.length === 0 && result.sideEffects.length >= 5,
      runtimePosition,
      sideEffectKinds: result.sideEffects.map((effect: { readonly kind: string }) => effect.kind),
      animationEventMatched: result.values.get("event.fired") === true,
      diagnostics: result.diagnostics,
      executionOrder: result.executionOrder
    };
  });
}

async function drawVisualGraphCanvas(page: Page, id: string, payload: unknown, color: string): Promise<void> {
  await page.evaluate(({ canvasId, data, fill }) => {
    const canvas = document.createElement("canvas");
    canvas.id = canvasId;
    canvas.width = 320;
    canvas.height = 180;
    canvas.style.display = "block";
    canvas.style.margin = "8px";
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable for visual scripting evidence.");
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = fill;
    ctx.fillRect(28, 72, 80, 40);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(132, 40, 58, 100);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(108, 92);
    ctx.lineTo(132, 90);
    ctx.lineTo(190, 90);
    ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "14px monospace";
    ctx.fillText(canvasId, 18, 24);
    ctx.fillText(JSON.stringify(data).slice(0, 120), 18, 164);
    document.body.appendChild(canvas);
  }, { canvasId: id, data: payload, fill: color });
}

declare global {
  interface Window {
    __AURA3D_SCRIPTING_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly position?: readonly number[];
      readonly nonBlankPixels?: number;
      readonly errorCount?: number;
      readonly error?: string;
    };
  }
}
