import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const screenshotDir = "tests/reports/external-parity-example-screenshots";
const editorScreenshotPath = `${screenshotDir}/editor-authoring-external-parity.png`;
const exportedScreenshotPath = `${screenshotDir}/editor-authoring-external-parity-export.png`;
const checkedInScreenshotPath = `${screenshotDir}/editor-authored-external-parity-checked-in.png`;
const reportPath = "tests/reports/external-parity-editor-authoring.json";

test.describe("ExternalParity editor authoring workflow", () => {
  test.setTimeout(150_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("authors, saves, reloads, plays, exports, and smoke-tests a ExternalParity app", async ({ page }) => {
    mkdirSync(screenshotDir, { recursive: true });
    let timelineEvidence: EditorState["timeline"]["model"] | undefined;
    let visualScriptingEvidence: EditorState["visualScripting"] | undefined;
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.locator('select[data-setting="colorSpace"]').selectOption("linear");
    await page.locator('select[data-setting="compression"]').selectOption("ktx2");
    await page.locator('input[data-setting="scale"]').fill("1.35");
    await page.locator('input[data-setting="scale"]').blur();
    await page.locator('select[data-setting="orientation"]').selectOption("z-up");
    await page.locator('select[data-setting="textureMode"]').selectOption("external");
    await page.locator('input[data-setting="importAnimations"]').setChecked(true);
    await page.locator('input[data-setting="generateCollider"]').setChecked(true);
    await page.getByRole("button", { name: "Import Fox GLB" }).click();
    await expect.poll(() => editorState(page).then((state) => state.assetCount), { timeout: 15_000 }).toBe(1);

    const assetCard = page.locator(".asset-browser-panel .asset-card").filter({ hasText: "Fox.glb" });
    await expect(assetCard).toContainText("Loaded real glTF");
    await expect(assetCard).toContainText("Scale: 1.35");
    await expect(assetCard).toContainText("Orientation: z-up");
    await expect(assetCard).toContainText("Textures: external");
    await expect(assetCard).toContainText("Compression: ktx2");
    await expect(assetCard).toContainText("Collider generation: on");
    const assetId = await assetCard.getAttribute("data-asset-id");
    expect(assetId).toBeTruthy();
    await expect(page.locator(".timeline-panel")).toContainText("3 animation clips");
    await page.locator('.timeline-panel button[data-action="timeline-preview-clip"]').filter({ hasText: "Run" }).click();
    await page.locator('.timeline-panel input[data-action="timeline-scrub"]').fill("0.42");
    const timeline = await editorState(page).then((state) => state.timeline);
    expect(timeline.selectedClipName).toBe("Run");
    expect(timeline.model.evidence.oldCodebasePort).toBe(true);
    expect(timeline.model.evidence.boundedTimelineAuthoring).toBe(true);
    expect(timeline.model.evidence.clipEasing).toBe(true);
    expect(timeline.model.evidence.clipBlending).toBe(true);
    expect(timeline.model.evidence.muteLockState).toBe(true);
    expect(timeline.model.evidence.loopPlayback).toBe(true);
    expect(timeline.model.evidence.signalMarkers).toBe(true);
    expect(timeline.model.trackCount).toBeGreaterThanOrEqual(4);
    expect(timeline.model.clipCount).toBeGreaterThanOrEqual(5);
    timelineEvidence = timeline.model;
    await expect(page.locator(".visual-script-panel")).toContainText("Visual Script");
    await expect(page.locator(".visual-script-panel")).toContainText("flow");
    await page.locator('.visual-script-panel button[data-action="run-visual-graph"]').click();
    const visualScripting = await editorState(page).then((state) => state.visualScripting);
    expect(visualScripting.nodeCount).toBeGreaterThanOrEqual(10);
    expect(visualScripting.edgeCount).toBeGreaterThanOrEqual(7);
    expect(visualScripting.catalogSize).toBeGreaterThanOrEqual(30);
    expect(visualScripting.nodeKinds).toEqual(expect.arrayContaining(["branch", "forRange", "gate", "greater", "multiply", "select"]));
    expect(visualScripting.selectedOutput).toBe("fast");
    expect(visualScripting.loopIndices).toEqual([0, 1, 2]);
    expect(visualScripting.evidence).toMatchObject({
      oldCodebasePort: true,
      editorVisibleGraph: true,
      mathLogicFlowCatalog: true,
      deterministicExecution: true,
      blockedUnityUnrealVisualScriptingParity: true
    });
    expect(visualScripting.blockedClaims).toEqual(expect.arrayContaining(["Unity Visual Scripting parity", "Unreal Blueprint parity"]));
    visualScriptingEvidence = visualScripting;
    await dropAssetIntoViewport(page, assetId!);
    await expect.poll(() => editorState(page).then((state) => state.nodeCount)).toBe(3);
    const importedNode = await selectedProjectNode(page);
    expect(importedNode.transform.scale).toEqual([1.35, 1.35, 1.35]);
    expect(importedNode.transform.rotation[0]).toBeCloseTo(-0.707107, 5);
    expect(importedNode.material.textureSlots.baseColor).toContain("Fox_external_baseColor.ktx2");
    expect(importedNode.material.textureSlots.normal).toContain("Fox_external_normal.ktx2");
    expect(importedNode.physics).toMatchObject({ body: "static", collider: "box" });
    expect(importedNode.animation.enabled).toBe(true);
    expect(importedNode.animation.clip.length).toBeGreaterThan(0);
    const materialPreviewBefore = await averageCanvasColor(page, ".editor-viewport");

    await page.getByRole("button", { name: "Move X" }).click();
    await page.getByRole("button", { name: "Rotate Z" }).click();
    await page.getByRole("button", { name: "Scale", exact: true }).click();
    const gizmoEvidence = await editorState(page).then((state) => state.viewportCamera.gizmo);
    const editorStateEvidence = await editorState(page).then((state) => state.editorState);
    const localizationAccessibility = await editorState(page).then((state) => state.localizationAccessibility);
    const editorPicking = await editorState(page).then((state) => state.editorPicking);
    const editorFeatureEvidence = await editorState(page).then((state) => state.featureEvidence);
    expect(gizmoEvidence).toMatchObject({
      snapEnabled: true,
      positionSnap: 0.5,
      rotationSnapDegrees: 15,
      scaleSnap: 0.25,
      spaceMode: "world",
      pivotMode: "center"
    });
    expect(editorStateEvidence.evidence).toMatchObject({
      oldCodebasePort: true,
      persistentEditorState: true,
      viewportSettings: true,
      gridSnapSettings: true,
      transformSpacePivotMode: true
    });
    expect(localizationAccessibility.source).toBe("origin-master-localization-ui-accessibility-adapted");
    expect(localizationAccessibility.hotSwapLocale).toMatchObject({ from: "en-US", to: "ar-SA", directionChanged: true });
    expect(localizationAccessibility.samples.some((sample) => sample.direction === "rtl")).toBe(true);
    expect(localizationAccessibility.accessibility.focusOrder).toEqual(["command-menu", "viewport", "inspector-name", "timeline-scrub", "export-project"]);
    expect(localizationAccessibility.accessibility.aaContrastPasses).toBe(true);
    expect(localizationAccessibility.blockedClaims).toEqual(expect.arrayContaining(["WCAG conformance certification", "Unity UI Toolkit parity", "Unreal UMG parity"]));
    expect(editorPicking.source).toBe("origin-master-gpu-picking-adapted");
    expect(editorPicking.registeredTargetCount).toBeGreaterThanOrEqual(2);
    expect(editorPicking.width).toBeGreaterThan(0);
    expect(editorPicking.height).toBeGreaterThan(0);
    expect(editorPicking.sampleColorId?.encodedId).toBe(1);
    expect(editorPicking.sampleColorId?.color).toEqual([1, 0, 0, 255]);
    expect(editorPicking.decodedSampleTargetId).toBe(editorPicking.sampleColorId?.targetId);
    expect(editorPicking.evidence).toMatchObject({
      colorIdEncoding: true,
      colorIdDecoding: true,
      framebufferResizeBoundary: true,
      raycastFallback: true
    });
    expect(editorPicking.blockedClaims).toEqual(expect.arrayContaining(["production GPU framebuffer picking pass", "GPU picking performance parity with Unity Scene View", "GPU picking performance parity with Unreal Editor viewport"]));
    expect(editorFeatureEvidence).toMatchObject({
      localizationHotSwap: true,
      rtlLocaleDirection: true,
      accessibilityFocusOrder: true,
      accessibilityContrast: true,
      oldBranchGpuPickingPort: true,
      gpuPickingColorIdEncoding: true,
      gpuPickingRaycastFallback: true,
      oldBranchVisualScriptingPort: true,
      editorVisibleVisualGraph: true,
      visualScriptingCatalogExecution: true
    });
    await page.locator('.material-panel input[data-material-path="baseColor"]').fill("#ff8844");
    await expect.poll(() => averageCanvasColor(page, ".editor-viewport")).toMatchObject({
      red: expect.any(Number),
      green: expect.any(Number),
      blue: expect.any(Number)
    });
    const materialPreviewAfter = await averageCanvasColor(page, ".editor-viewport");
    expect(materialPreviewAfter.red).toBeGreaterThan(materialPreviewBefore.red + 4);
    expect(materialPreviewAfter.blue).toBeLessThan(materialPreviewBefore.blue - 4);
    await page.locator('.material-panel input[data-material-path="metallic"]').fill("0.22");
    await page.locator('.material-panel input[data-material-path="roughness"]').fill("0.34");
    await page.locator('.material-panel input[data-material-path="textureSlots.baseColor"]').fill("Fox_baseColor");
    await page.locator('.material-panel input[data-material-path="textureSlots.normal"]').fill("Fox_normal");
    await page.locator('select[data-path="physics.body"]').selectOption("dynamic");
    await page.locator('select[data-path="physics.collider"]').selectOption("box");
    await page.locator('input[data-path="script.enabled"]').setChecked(true);
    await page.locator('input[data-path="script.behavior"]').fill("BounceBehavior");
    await page.locator('input[data-path="script.behavior"]').blur();
    await page.locator('input[data-path="animation.enabled"]').setChecked(true);
    await page.locator('input[data-path="animation.clip"]').fill("Run");
    await page.locator('input[data-path="animation.clip"]').blur();
    await page.locator('input[data-path="particleEmitter.enabled"]').setChecked(true);
    await page.locator('select[data-path="particleEmitter.preset"]').selectOption("fountain");

    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByLabel("Rename New Node").fill("ExternalParity Key Light");
    await page.getByLabel("Rename New Node").blur();
    await page.locator('select[data-path="light.kind"]').selectOption("point");
    await page.locator('input[data-path="light.intensity"]').fill("2.4");
    await page.locator('input[data-path="light.intensity"]').blur();

    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByLabel("Rename New Node").fill("ExternalParity Export Camera");
    await page.getByLabel("Rename New Node").blur();
    await page.locator('input[data-path="camera.enabled"]').setChecked(true);
    await page.locator('input[data-path="camera.fov"]').fill("52");
    await page.locator('input[data-path="camera.fov"]').blur();
    await page.locator('input[data-path="audio.listener"]').setChecked(true);
    await page.locator('input[data-path="script.enabled"]').setChecked(true);
    await page.locator('input[data-path="script.behavior"]').fill("OrbitCameraBehavior");
    await page.locator('input[data-path="script.behavior"]').blur();

    await page.locator('select[data-action="view-mode"]').selectOption("lighting");
    await page.getByRole("button", { name: "Focus" }).click();
    await expect(page.locator('[data-role="viewport-hud"]')).toContainText("lighting");
    await page.screenshot({ path: editorScreenshotPath, fullPage: true });

    await page.getByRole("button", { name: "Save", exact: true }).click();
    const savedProjectJson = await editorState(page).then((state) => state.savedProjectJson);
    expect(savedProjectJson).toContain("Fox.glb");
    expect(savedProjectJson).toContain("\"orientation\": \"z-up\"");
    expect(savedProjectJson).toContain("Fox_external_metallicRoughness.ktx2");
    expect(savedProjectJson).toContain("ExternalParity Key Light");
    expect(savedProjectJson).toContain("ExternalParity Export Camera");
    expect(savedProjectJson).toContain("BounceBehavior");
    expect(savedProjectJson).toContain("fountain");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await expect.poll(() => editorState(page).then((state) => state.editorState.persisted)).toBe(true);
    await expect.poll(() => editorState(page).then((state) => state.editorState.gridSnap.snapToGrid)).toBe(true);
    await page.locator('[data-role="project-buffer"]').evaluate((element: HTMLTextAreaElement, value) => {
      element.value = value;
    }, savedProjectJson);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(page.getByRole("button", { name: "Fox.glb" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ExternalParity Key Light" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ExternalParity Export Camera" })).toBeVisible();
    await page.getByRole("button", { name: "Fox.glb" }).click();
    await expect(page.locator('.material-panel input[data-material-path="baseColor"]')).toHaveValue("#ff8844");
    await expect(page.locator('.material-panel input[data-material-path="metallic"]')).toHaveValue("0.22");
    await expect(page.locator('.material-panel input[data-material-path="roughness"]')).toHaveValue("0.34");
    await expect(page.locator('.material-panel input[data-material-path="textureSlots.baseColor"]')).toHaveValue("Fox_baseColor");
    await expect(page.locator('select[data-path="physics.body"]')).toHaveValue("dynamic");
    await expect(page.locator('select[data-path="physics.collider"]')).toHaveValue("box");
    await expect(page.locator('input[data-path="script.enabled"]')).toBeChecked();
    await expect(page.locator('input[data-path="script.behavior"]')).toHaveValue("BounceBehavior");
    await expect(page.locator('input[data-path="animation.enabled"]')).toBeChecked();
    await expect(page.locator('input[data-path="animation.clip"]')).toHaveValue("Run");
    await expect(page.locator('input[data-path="particleEmitter.enabled"]')).toBeChecked();
    await expect(page.locator('select[data-path="particleEmitter.preset"]')).toHaveValue("fountain");
    await expect(page.locator(".profiler-panel")).toContainText("Draw calls");
    await expect(page.locator(".profiler-panel")).toContainText("Physics");
    await expect(page.locator(".profiler-panel")).toContainText("Resource diagnostics");

    await page.getByRole("banner").getByRole("button", { name: "Play" }).click();
    await expect.poll(() => editorState(page).then((state) => state.mode)).toBe("play");
    await page.getByRole("banner").getByRole("button", { name: "Play" }).click();
    await expect.poll(() => editorState(page).then((state) => state.mode)).toBe("edit");

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect.poll(() => editorState(page).then((state) => state.exportedFileCount)).toBe(3);
    const exportedFiles = await page.evaluate(() => (window as any).__AURA3D_EDITOR_APP__!.shell.exportedFiles());
    const runtime = exportedFiles.find((file) => file.path === "runtime.js")?.content ?? "";
    expect(runtime).not.toContain("EditorShell");
    expect(runtime).not.toContain("__AURA3D_EDITOR_APP__");
    const exportedByPath = new Map(exportedFiles.map((file) => [file.path, file.content]));
    await page.route(`${server.origin}/__editor_export/**`, async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").pop() ?? "index.html";
      const content = exportedByPath.get(name);
      await route.fulfill({
        status: content ? 200 : 404,
        contentType: name.endsWith(".html") ? "text/html" : name.endsWith(".js") ? "text/javascript" : "application/json",
        body: content ?? "missing ExternalParity export fixture"
      });
    });

    await page.goto(`${server.origin}/__editor_export/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as any).__AURA3D_EXPORTED_PROJECT__?.status === "ready");
    await page.waitForFunction(() => ((window as any).__AURA3D_EXPORTED_PROJECT__?.diagnostics.scriptTickCount ?? 0) > 2);
    const exportedState = await exportedProjectState(page);
    expect(exportedState.assetCount).toBe(1);
    expect(exportedState.importedAssetNames).toContain("Fox.glb");
    expect(exportedState.featureEvidence.editedMaterials.some((material) => material.baseColor === "#ff8844")).toBe(true);
    expect(exportedState.featureEvidence.lights.length).toBeGreaterThanOrEqual(1);
    expect(exportedState.featureEvidence.cameras.length).toBeGreaterThanOrEqual(1);
    expect(exportedState.physicsOrScripting).toBe(true);
    expect(exportedState.playBehaviorActive).toBe(true);
    expect(exportedState.featureEvidence.usesEditorCode).toBe(false);
    expect(exportedState.claimBoundary.blocked).toContain("Unity replacement");
    expect(await nonBlankCanvasPixels(page, "#aura3d-export")).toBeGreaterThan(5000);
    await page.locator("#aura3d-export").click({ position: { x: 520, y: 260 } });
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => (window as any).__AURA3D_EXPORTED_PROJECT__?.interactions ?? 0)).toBeGreaterThan(0);
    await page.screenshot({ path: exportedScreenshotPath, fullPage: true });

    writeFileSync(reportPath, JSON.stringify({
      schemaVersion: "a3d-external-parity-editor-authoring-report",
      ok: true,
      generatedAt: new Date().toISOString(),
      command: "pnpm exec playwright test tests/browser/editor-authoring-external-parity.spec.ts",
      editorScreenshotPath,
      exportedScreenshotPath,
      authoredWorkflow: {
        openedEditor: true,
        createdProject: true,
        importedAsset: "Fox.glb",
        placedObject: true,
        editedMaterial: "#ff8844",
        addedLight: "ExternalParity Key Light",
        addedCamera: "ExternalParity Export Camera",
        savedAndReloaded: true,
        hierarchyPersisted: true,
        inspectorEditsPersisted: true,
        profilerDiagnosticsVisible: true,
        timelineTrackClipEvidence: Boolean(timelineEvidence),
        visualScriptingAuthoringEvidence: Boolean(visualScriptingEvidence),
        gizmoSnapSpacePivotEvidence: Boolean(gizmoEvidence),
        editorStatePersistenceEvidence: Boolean(editorStateEvidence),
        gpuPickingWorkflowEvidence: editorPicking.source === "origin-master-gpu-picking-adapted",
        localizationAccessibilityEvidence: localizationAccessibility.source === "origin-master-localization-ui-accessibility-adapted",
        enteredPlayMode: true,
        exportedStaticApp: true,
        openedExportedApp: true
      },
      timelineEvidence,
      visualScriptingEvidence,
      gizmoEvidence,
      editorStateEvidence,
      editorPicking,
      localizationAccessibility,
      exportedEvidence: exportedState,
      blockedClaims: exportedState.claimBoundary.blocked
    }, null, 2));
  });

  test("runs the checked-in ExternalParity editor-authored app without editor code", async ({ page }) => {
    mkdirSync(screenshotDir, { recursive: true });
    await page.goto(`${server.origin}/examples/external-editor-authored-app/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as any).__AURA3D_EXPORTED_PROJECT__?.status === "ready");
    await page.waitForFunction(() => ((window as any).__AURA3D_EXPORTED_PROJECT__?.diagnostics.scriptTickCount ?? 0) > 2);
    const state = await exportedProjectState(page);

    expect(state.projectName).toBe("ExternalParity Editor Authored Sample");
    expect(state.nodeCount).toBe(4);
    expect(state.assetCount).toBe(1);
    expect(state.importedAssetNames).toContain("Fox.glb");
    expect(state.featureEvidence.usesEditorCode).toBe(false);
    expect(state.featureEvidence.exportProvenance).toBe(true);
    expect(state.featureEvidence.lights.length).toBeGreaterThanOrEqual(1);
    expect(state.featureEvidence.cameras.length).toBeGreaterThanOrEqual(1);
    expect(state.featureEvidence.physicsBodies.length).toBeGreaterThanOrEqual(1);
    expect(state.featureEvidence.configuredBehaviors.length).toBeGreaterThanOrEqual(2);
    expect(state.playBehaviorActive).toBe(true);
    expect(state.claimBoundary.blocked).toEqual(expect.arrayContaining(["Unity replacement", "Unreal replacement"]));
    expect(await nonBlankCanvasPixels(page, "#aura3d-export")).toBeGreaterThan(5000);
    await page.locator("#aura3d-export").click({ position: { x: 520, y: 260 } });
    await expect.poll(() => page.evaluate(() => (window as any).__AURA3D_EXPORTED_PROJECT__?.interactions ?? 0)).toBeGreaterThan(0);
    await page.screenshot({ path: checkedInScreenshotPath, fullPage: true });
  });
});

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__AURA3D_EDITOR_APP__?.getState().status === "ready", undefined, { timeout: 20_000 });
}

async function editorState(page: Page): Promise<EditorState> {
  return page.evaluate(() => (window as any).__AURA3D_EDITOR_APP__!.getState());
}

async function selectedProjectNode(page: Page): Promise<EditorProjectNodeSnapshot> {
  return page.evaluate(() => (window as any).__AURA3D_EDITOR_APP__!.shell.selectedProjectNode());
}

async function exportedProjectState(page: Page): Promise<ExportedProjectState> {
  return page.evaluate(() => (window as any).__AURA3D_EXPORTED_PROJECT__!);
}

async function dropAssetIntoViewport(page: Page, assetId: string): Promise<void> {
  await page.evaluate((draggedAssetId) => {
    const transfer = new DataTransfer();
    transfer.setData("application/x-aura3d-asset", draggedAssetId);
    const viewport = document.querySelector<HTMLElement>(".editor-viewport-panel");
    if (!viewport) throw new Error("editor viewport missing");
    viewport.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, assetId);
}

async function nonBlankCanvasPixels(page: Page, selector: string): Promise<number> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!data) return 0;
    let pixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
    }
    return pixels;
  }, selector);
}

async function averageCanvasColor(page: Page, selector: string): Promise<{ readonly red: number; readonly green: number; readonly blue: number }> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const context = canvas?.getContext("webgl2", { preserveDrawingBuffer: true }) ?? canvas?.getContext("webgl", { preserveDrawingBuffer: true });
    if (!canvas || !context) return { red: 0, green: 0, blue: 0 };
    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 20 || pixels[index + 1] > 20 || pixels[index + 2] > 20) {
        red += pixels[index];
        green += pixels[index + 1];
        blue += pixels[index + 2];
        count += 1;
      }
    }
    return count > 0 ? { red: red / count, green: green / count, blue: blue / count } : { red: 0, green: 0, blue: 0 };
  }, selector);
}

interface EditorState {
  readonly status: "booting" | "ready" | "error";
  readonly mode: string;
  readonly nodeCount: number;
  readonly assetCount: number;
  readonly savedProjectJson: string;
  readonly exportedFileCount: number;
  readonly viewportCamera: {
    readonly gizmo: {
      readonly snapEnabled: boolean;
      readonly positionSnap: number;
      readonly rotationSnapDegrees: number;
      readonly scaleSnap: number;
      readonly spaceMode: string;
      readonly pivotMode: string;
    };
  };
  readonly editorState: {
    readonly persisted: boolean;
    readonly gridSnap: {
      readonly snapToGrid: boolean;
      readonly positionSnap: number;
      readonly rotationSnapEnabled: boolean;
      readonly rotationSnapDegrees: number;
      readonly scaleSnapEnabled: boolean;
      readonly scaleSnap: number;
    };
    readonly evidence: {
      readonly oldCodebasePort: boolean;
      readonly persistentEditorState: boolean;
      readonly viewportSettings: boolean;
      readonly gridSnapSettings: boolean;
      readonly transformSpacePivotMode: boolean;
    };
  };
  readonly timeline: {
    readonly selectedClipName: string | null;
    readonly model: {
      readonly trackCount: number;
      readonly clipCount: number;
      readonly evidence: {
        readonly oldCodebasePort: boolean;
        readonly boundedTimelineAuthoring: boolean;
        readonly clipEasing: boolean;
        readonly clipBlending: boolean;
        readonly muteLockState: boolean;
        readonly loopPlayback: boolean;
        readonly signalMarkers: boolean;
      };
    };
  };
  readonly visualScripting: {
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly catalogSize: number;
    readonly selectedOutput: string;
    readonly loopIndices: readonly number[];
    readonly nodeKinds: readonly string[];
    readonly blockedClaims: readonly string[];
    readonly evidence: {
      readonly oldCodebasePort: boolean;
      readonly editorVisibleGraph: boolean;
      readonly mathLogicFlowCatalog: boolean;
      readonly deterministicExecution: boolean;
      readonly blockedUnityUnrealVisualScriptingParity: boolean;
    };
  };
  readonly localizationAccessibility: {
    readonly source: string;
    readonly hotSwapLocale: {
      readonly from: string;
      readonly to: string;
      readonly directionChanged: boolean;
    };
    readonly samples: readonly { readonly direction: string }[];
    readonly accessibility: {
      readonly focusOrder: readonly string[];
      readonly aaContrastPasses: boolean;
    };
    readonly blockedClaims: readonly string[];
  };
  readonly editorPicking: {
    readonly source: string;
    readonly registeredTargetCount: number;
    readonly width: number;
    readonly height: number;
    readonly sampleColorId: {
      readonly targetId: string;
      readonly encodedId: number;
      readonly color: readonly number[];
    } | null;
    readonly decodedSampleTargetId: string | null;
    readonly evidence: {
      readonly colorIdEncoding: boolean;
      readonly colorIdDecoding: boolean;
      readonly framebufferResizeBoundary: boolean;
      readonly raycastFallback: boolean;
    };
    readonly blockedClaims: readonly string[];
  };
  readonly featureEvidence: {
    readonly localizationHotSwap: boolean;
    readonly rtlLocaleDirection: boolean;
    readonly accessibilityFocusOrder: boolean;
    readonly accessibilityContrast: boolean;
    readonly oldBranchGpuPickingPort: boolean;
    readonly gpuPickingColorIdEncoding: boolean;
    readonly gpuPickingRaycastFallback: boolean;
    readonly oldBranchVisualScriptingPort: boolean;
    readonly editorVisibleVisualGraph: boolean;
    readonly visualScriptingCatalogExecution: boolean;
  };
}

interface EditorProjectNodeSnapshot {
  readonly transform: {
    readonly scale: readonly number[];
    readonly rotation: readonly number[];
  };
  readonly material: {
    readonly textureSlots: {
      readonly baseColor: string;
      readonly normal: string;
    };
  };
  readonly physics: {
    readonly body: string;
    readonly collider: string;
  };
  readonly animation: {
    readonly enabled: boolean;
    readonly clip: string;
  };
}

interface ExportedProjectState {
  readonly status: "ready";
  readonly renderer: string;
  readonly projectName: string;
  readonly nodeCount: number;
  readonly assetCount: number;
  readonly importedAssetNames: readonly string[];
  readonly physicsOrScripting: boolean;
  readonly playBehaviorActive: boolean;
  readonly claimBoundary: { readonly allowed: string; readonly blocked: readonly string[] };
  readonly diagnostics: { readonly scriptTickCount: number };
  readonly featureEvidence: {
    readonly importedAssetNames: readonly string[];
    readonly importedAssetUris: readonly string[];
    readonly editedMaterials: readonly { readonly node: string; readonly name: string; readonly baseColor: string }[];
    readonly lights: readonly { readonly node: string; readonly kind: string; readonly intensity: number }[];
    readonly cameras: readonly { readonly node: string; readonly fov: number }[];
    readonly physicsBodies: readonly { readonly node: string; readonly body: string; readonly collider: string }[];
    readonly configuredBehaviors: readonly { readonly node: string; readonly behavior: string }[];
    readonly usesEditorCode: boolean;
    readonly exportProvenance: boolean;
  };
}
