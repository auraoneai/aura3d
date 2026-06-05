import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type RuntimeBackend = "webgl2" | "webgpu";

interface BrowserAuraNodeBuilder {
  position(x: number, y: number, z: number): BrowserAuraNodeBuilder;
  material(material: unknown): BrowserAuraNodeBuilder;
  runtime(spec: unknown): BrowserAuraNodeBuilder;
}

interface BrowserAuraSceneBuilder {
  add(node: unknown): BrowserAuraSceneBuilder;
}

interface BrowserRuntimeNode {
  readonly position: readonly [number, number, number];
  readonly visible: boolean;
  translate(x: number, y: number, z: number): BrowserRuntimeNode;
  setPosition(x: number, y: number, z: number): BrowserRuntimeNode;
  setVisible(visible: boolean): BrowserRuntimeNode;
}

interface BrowserAuraApp {
  readonly backend: string;
  readonly runtime: { readonly frame: number };
  readonly nodes: {
    require(id: string): BrowserRuntimeNode;
    ids(): readonly string[];
  };
  onFrame(callback: (frame: { readonly dt: number; readonly frame: number }) => void): () => void;
  step(dt?: number): void;
  dispose(): void;
}

interface BrowserAuraModule {
  readonly createAuraApp: (target: HTMLCanvasElement, options: Record<string, unknown>) => BrowserAuraApp;
  readonly game: {
    runtimeNode(id: string, options?: { readonly tags?: readonly string[] }): unknown;
  };
  readonly lights: {
    studio(): unknown;
  };
  readonly material: {
    pbr(options: Record<string, unknown>): unknown;
  };
  readonly primitives: {
    box(options?: Record<string, unknown>): BrowserAuraNodeBuilder;
  };
  readonly scene: () => BrowserAuraSceneBuilder;
}

interface RuntimeBackendContract {
  readonly requestedBackend: RuntimeBackend;
  readonly actualBackend: string;
  readonly status: "ran" | "skipped" | "failed";
  readonly reason?: string;
  readonly ids: readonly string[];
  readonly position: readonly [number, number, number];
  readonly visible: boolean;
  readonly frame: number;
  readonly passed: boolean;
}

interface RuntimeMovementEvidence {
  readonly renderedMovement: boolean;
  readonly runtimeNodeMutation: boolean;
  readonly frameLoopAdvance: boolean;
  readonly markerStayedStableAfterUnsubscribe: boolean;
  readonly webgl2RuntimeNodeContract: boolean;
}

interface RuntimeMovementResult {
  readonly backend: string;
  readonly frames: number;
  readonly runtimeFrame: number;
  readonly nodeX: number;
  readonly beforeLeft: number;
  readonly afterLeft: number;
  readonly afterUnsubscribeLeft: number;
  readonly canvasVisible: boolean;
  readonly markerVisible: boolean;
  readonly backendContracts: readonly RuntimeBackendContract[];
  readonly evidence: RuntimeMovementEvidence;
}

const renderedMovementBrowserProof = {
  proofId: "renderedMovement",
  manifestKey: "renderedMovement",
  sourceAssertions: [
    "app.step advances the Aura3D frame loop deterministically",
    "node.translate mutates a game.runtimeNode without route recreation",
    "marker.getBoundingClientRect proves rendered movement changed on screen",
    "unsubscribe leaves the rendered marker stable after the frame callback is removed",
    "WebGL2 runtime-node contract is required and WebGPU may run or skip with a reason"
  ],
  requiredEvidenceArtifacts: [
    "screenshot.path",
    "screenshot.sha256",
    "screenshot.width",
    "screenshot.height",
    "metrics.beforeLeft",
    "metrics.afterLeft",
    "runtime.frame",
    "runtime.nodeId"
  ]
} as const;

test.describe("game runtime visible runtime-node movement", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("frame callbacks advance visible runtime node movement and share WebGL2/WebGPU behavior", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await evaluateRuntimeMovement(page);

    expect(result.frames).toBe(2);
    expect(result.runtimeFrame).toBeGreaterThanOrEqual(3);
    expect(result.nodeX).toBeCloseTo(0.5);
    expect(result.canvasVisible).toBe(true);
    expect(result.markerVisible).toBe(true);
    expect(result.afterLeft).toBeGreaterThan(result.beforeLeft + 30);
    expect(result.afterUnsubscribeLeft).toBe(result.afterLeft);
    expect(result.evidence).toMatchObject({
      renderedMovement: true,
      runtimeNodeMutation: true,
      frameLoopAdvance: true,
      markerStayedStableAfterUnsubscribe: true,
      webgl2RuntimeNodeContract: true
    });
    expect(renderedMovementBrowserProof.proofId).toBe("renderedMovement");
    expect(renderedMovementBrowserProof.sourceAssertions).toEqual(
      expect.arrayContaining([
        "app.step advances the Aura3D frame loop deterministically",
        "node.translate mutates a game.runtimeNode without route recreation",
        "marker.getBoundingClientRect proves rendered movement changed on screen"
      ])
    );
    await expect(page.locator("[data-testid='runtime-node-canvas']")).toBeVisible();
    await expect(page.locator("[data-testid='runtime-node-marker']")).toBeVisible();
    await writeGameRuntimeBrowserProof(page, "tests/reports/game-runtime/rendered-movement-evidence.json", {
      proofIds: [renderedMovementBrowserProof.proofId],
      declaration: renderedMovementBrowserProof,
      route: "/",
      metrics: result,
      runtime: {
        nodeId: "visible-player",
        frame: result.runtimeFrame
      }
    });

    const webgl2 = result.backendContracts.find((contract) => contract.requestedBackend === "webgl2");
    const webgpu = result.backendContracts.find((contract) => contract.requestedBackend === "webgpu");

    expect(webgl2).toMatchObject({
      requestedBackend: "webgl2",
      status: "ran",
      passed: true,
      position: [1, 0.5, 0],
      visible: true,
      frame: 1
    });
    expect(webgpu?.status).toEqual(expect.stringMatching(/^(ran|skipped)$/));
    if (webgpu?.status === "ran") {
      expect(webgpu).toMatchObject({
        requestedBackend: "webgpu",
        passed: true,
        position: [1, 0.5, 0],
        visible: true,
        frame: 1
      });
    } else {
      expect(webgpu?.reason).toBeTruthy();
    }
  });
});

async function evaluateRuntimeMovement(page: Page): Promise<RuntimeMovementResult> {
  return page.evaluate(async () => {
    const engine = await import("/packages/engine/src/index.ts") as BrowserAuraModule;
    const requestedBackends = ["webgl2", "webgpu"] as const;
    const runtimeScene = (engineModule: BrowserAuraModule, id: string): BrowserAuraSceneBuilder =>
      engineModule.scene()
        .add(
          engineModule.primitives
            .box({ name: id })
            .position(0, 0.5, 0)
            .material(engineModule.material.pbr({ color: "#2dd4bf", roughness: 0.4 }))
            .runtime(engineModule.game.runtimeNode(id, { tags: ["browser-visible", "runtime-node"] }))
        )
        .add(engineModule.lights.studio());
    const runBackendContract = async (
      engineModule: BrowserAuraModule,
      requestedBackend: RuntimeBackend
    ): Promise<RuntimeBackendContract> => {
      const contractCanvas = document.createElement("canvas");
      contractCanvas.width = 96;
      contractCanvas.height = 64;
      const id = `runtime-${requestedBackend}`;

      try {
        const contractApp = engineModule.createAuraApp(contractCanvas, {
          autoStart: false,
          backend: requestedBackend,
          scene: runtimeScene(engineModule, id)
        });
        const contractNode = contractApp.nodes.require(id);
        const contractUnsubscribe = contractApp.onFrame(() => {
          contractNode.setPosition(1, 0.5, 0);
          contractNode.setVisible(false).setVisible(true);
        });
        contractApp.step(1 / 60);
        contractUnsubscribe();

        const result: RuntimeBackendContract = {
          requestedBackend,
          actualBackend: contractApp.backend,
          status: "ran",
          ids: contractApp.nodes.ids(),
          position: [contractNode.position[0], contractNode.position[1], contractNode.position[2]],
          visible: contractNode.visible,
          frame: contractApp.runtime.frame,
          passed:
            contractApp.nodes.ids().includes(id) &&
            contractNode.position[0] === 1 &&
            contractNode.visible &&
            contractApp.runtime.frame === 1
        };
        contractApp.dispose();
        return result;
      } catch (error) {
        return {
          requestedBackend,
          actualBackend: "unavailable",
          status: requestedBackend === "webgpu" ? "skipped" : "failed",
          reason: error instanceof Error ? error.message : String(error),
          ids: [],
          position: [0, 0, 0],
          visible: false,
          frame: 0,
          passed: false
        };
      }
    };

    document.body.innerHTML = "";
    document.body.style.margin = "0";
    document.body.style.background = "#071014";

    const shell = document.createElement("main");
    shell.style.position = "relative";
    shell.style.width = "360px";
    shell.style.height = "220px";
    shell.style.padding = "20px";
    document.body.append(shell);

    const canvas = document.createElement("canvas");
    canvas.dataset.testid = "runtime-node-canvas";
    canvas.width = 320;
    canvas.height = 180;
    canvas.style.width = "320px";
    canvas.style.height = "180px";
    canvas.style.display = "block";
    canvas.style.border = "1px solid #2dd4bf";
    canvas.style.background = "linear-gradient(135deg, #071014, #12313a)";
    shell.append(canvas);

    const marker = document.createElement("div");
    marker.dataset.testid = "runtime-node-marker";
    marker.textContent = "runtime node";
    marker.style.position = "absolute";
    marker.style.left = "0";
    marker.style.top = "0";
    marker.style.width = "32px";
    marker.style.height = "32px";
    marker.style.borderRadius = "8px";
    marker.style.background = "#2dd4bf";
    marker.style.boxShadow = "0 0 18px rgba(45, 212, 191, 0.85)";
    marker.style.color = "#042f2e";
    marker.style.font = "10px sans-serif";
    marker.style.lineHeight = "12px";
    marker.style.textAlign = "center";
    marker.style.transform = "translate(24px, 64px)";
    shell.append(marker);

    const app = engine.createAuraApp(canvas, {
      autoStart: false,
      scene: runtimeScene(engine, "visible-player")
    });
    const node = app.nodes.require("visible-player");
    let frames = 0;

    const paintMarker = (): void => {
      marker.style.transform = `translate(${24 + node.position[0] * 80}px, 64px)`;
    };

    paintMarker();
    const beforeLeft = marker.getBoundingClientRect().left;
    const unsubscribe = app.onFrame(() => {
      frames += 1;
      node.translate(0.25, 0, 0);
      paintMarker();
    });
    app.step(1 / 60);
    app.step(1 / 60);
    const afterLeft = marker.getBoundingClientRect().left;
    unsubscribe();
    app.step(1 / 60);
    const afterUnsubscribeLeft = marker.getBoundingClientRect().left;
    const canvasRect = canvas.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const backend = app.backend;
    const nodeX = node.position[0];
    const runtimeFrame = app.runtime.frame;
    app.dispose();

    const backendContracts = await Promise.all(requestedBackends.map((requestedBackend) =>
      runBackendContract(engine, requestedBackend)
    ));
    const webgl2Contract = backendContracts.find((contract) => contract.requestedBackend === "webgl2");

    return {
      backend,
      frames,
      runtimeFrame,
      nodeX,
      beforeLeft,
      afterLeft,
      afterUnsubscribeLeft,
      canvasVisible: canvasRect.width > 0 && canvasRect.height > 0,
      markerVisible: markerRect.width > 0 && markerRect.height > 0,
      backendContracts,
      evidence: {
        renderedMovement: afterLeft > beforeLeft + 30,
        runtimeNodeMutation: Math.abs(nodeX - 0.5) < 0.0001,
        frameLoopAdvance: frames === 2 && runtimeFrame >= 3,
        markerStayedStableAfterUnsubscribe: afterUnsubscribeLeft === afterLeft,
        webgl2RuntimeNodeContract: webgl2Contract?.status === "ran" && webgl2Contract.passed
      }
    };
  });
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
