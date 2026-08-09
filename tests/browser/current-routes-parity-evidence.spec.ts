import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface RuntimeEvidence {
  readonly appId?: string;
  readonly status?: string;
  readonly frameCount?: number;
  readonly drawCalls?: number;
  readonly renderer?: string;
  readonly error?: string;
  readonly [key: string]: unknown;
}

interface RouteEvidenceCase {
  readonly name: string;
  readonly route: string;
  readonly runtimeKey: string;
  readonly appId: string;
  readonly screenshot: string;
  readonly renderer: "a3d-webgl2" | "injected-webxr-session";
  verify(runtime: RuntimeEvidence): void;
}

const cases: readonly RouteEvidenceCase[] = [
  {
    name: "glTF material variants",
    route: "/apps/loader-gltf-variants/",
    runtimeKey: "__a3dCurrentRoutesLoaderGLTFVariants",
    appId: "loader-gltf-variants",
    screenshot: "tests/reports/current-routes/loaders/gltf-variants.png",
    renderer: "a3d-webgl2",
    verify(runtime) {
      expect(runtime.variantCount).toBeGreaterThanOrEqual(2);
      expect(runtime.materialVariantNames).toEqual(expect.arrayContaining(["copper", "arctic"]));
      expect(runtime.unsupportedRequired).toEqual([]);
    }
  },
  {
    name: "OBJ import",
    route: "/apps/loader-obj/",
    runtimeKey: "__a3dCurrentRoutesLoaderOBJ",
    appId: "loader-obj",
    screenshot: "tests/reports/current-routes/loaders/loader-obj.png",
    renderer: "a3d-webgl2",
    verify(runtime) {
      expect(runtime.objNativeImport).toBe(true);
      expect(runtime.objTriangulatedFaces).toBe(true);
      expect(runtime.objGeneratedNormals).toBe(true);
      expect(runtime.vertexCount).toBeGreaterThan(0);
    }
  },
  {
    name: "texture anisotropy",
    route: "/apps/texture-anisotropy/",
    runtimeKey: "__a3dCurrentRoutesTextureAnisotropy",
    appId: "texture-anisotropy",
    screenshot: "tests/reports/current-routes/textures/texture-anisotropy.png",
    renderer: "a3d-webgl2",
    verify(runtime) {
      expect(runtime.requestedAnisotropy).toBeGreaterThan(1);
      expect(runtime.samplerAnisotropyUploads).toBeGreaterThan(0);
      expect(runtime.samplerMaxAnisotropy).toBeGreaterThan(1);
    }
  },
  {
    name: "depth and outline postprocessing",
    route: "/apps/postprocessing-depth-outline/",
    runtimeKey: "__a3dCurrentRoutesPostprocessingDepthOutline",
    appId: "postprocessing-depth-outline",
    screenshot: "tests/reports/current-routes/postprocessing/depth-outline.png",
    renderer: "a3d-webgl2",
    verify(runtime) {
      expect(runtime.postprocessChain).toEqual(expect.arrayContaining(["depth-of-field", "ssao", "outline"]));
      expect(runtime.outlineEnabled).toBe(true);
      expect(runtime.depthOfFieldEnabled).toBe(true);
      expect(runtime.ssaoEnabled).toBe(true);
      expect(runtime.edgeContrastPixels).toBeGreaterThan(0);
    }
  },
  {
    name: "trackball controls",
    route: "/apps/controls-trackball/",
    runtimeKey: "__a3dCurrentRoutesControlsTrackball",
    appId: "controls-trackball",
    screenshot: "tests/reports/current-routes/controls/trackball.png",
    renderer: "a3d-webgl2",
    verify(runtime) {
      expect(runtime.rotateEnabled).toBe(true);
      expect(runtime.panEnabled).toBe(true);
      expect(runtime.zoomEnabled).toBe(true);
      expect(runtime.trackballRollApplied).toBe(true);
    }
  },
  {
    name: "indexed and array draw ranges",
    route: "/apps/geometry-drawrange/",
    runtimeKey: "__a3dCurrentRoutesGeometryDrawRange",
    appId: "geometry-drawrange",
    screenshot: "tests/reports/current-routes/geometry/drawrange.png",
    renderer: "a3d-webgl2",
    verify(runtime) {
      expect(runtime.usesIndexedRange).toBe(true);
      expect(runtime.usesArrayRange).toBe(true);
      expect(runtime.indexedRangeCount).toBeLessThan(runtime.indexedTotalCount as number);
      expect(runtime.arrayRangeCount).toBeLessThan(runtime.arrayTotalCount as number);
    }
  },
  {
    name: "interactive point and cube picking",
    route: "/apps/interactive-picking/",
    runtimeKey: "__a3dCurrentRoutesInteractivePicking",
    appId: "interactive-picking",
    screenshot: "tests/reports/current-routes/interactive/picking.png",
    renderer: "a3d-webgl2",
    verify(runtime) {
      expect(runtime.cubeCount).toBeGreaterThan(0);
      expect(runtime.pointCount).toBeGreaterThan(0);
      expect(runtime.cubePickHits).toBeGreaterThan(0);
      expect(runtime.pointPickHits).toBeGreaterThan(0);
    }
  },
  {
    name: "multiple camera views",
    route: "/apps/camera-multiple-views/",
    runtimeKey: "__a3dCurrentRoutesCameraMultipleViews",
    appId: "camera-multiple-views",
    screenshot: "tests/reports/current-routes/camera/multiple-views.png",
    renderer: "a3d-webgl2",
    verify(runtime) {
      expect(runtime.elementCount).toBe(3);
      expect(runtime.viewCount).toBe(3);
      expect(runtime.cameraCount).toBe(3);
      expect(runtime.sharedSceneGeometry).toBe(true);
      expect(runtime.distinctCameraViews).toBe(true);
    }
  },
  {
    name: "injected WebXR interactions",
    route: "/apps/webxr-interactions/",
    runtimeKey: "__a3dCurrentRoutesWebXRInteractions",
    appId: "webxr-interactions",
    screenshot: "tests/reports/current-routes/webxr/interactions.png",
    renderer: "injected-webxr-session",
    verify(runtime) {
      expect(runtime.evidenceMode).toBe("injected-webxr-session");
      expect(runtime.realDeviceClaimed).toBe(false);
      expect(runtime.xrSessionStarted).toBe(true);
      expect(runtime.xrModeCount).toBe(3);
      expect(runtime.controllerCount).toBeGreaterThanOrEqual(2);
      expect(runtime.ballShots).toBeGreaterThan(0);
      expect(runtime.draggedObjects).toBeGreaterThan(0);
      expect(runtime.arCones).toBeGreaterThan(0);
      expect(runtime.hitTestCount).toBeGreaterThan(0);
    }
  }
];

test.describe("CurrentRoutes parity evidence", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const routeCase of cases) {
    test(`${routeCase.name} publishes scoped runtime and visual evidence`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${server.origin}${routeCase.route}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((runtimeKey) => {
        const runtime = (window as unknown as Record<string, RuntimeEvidence | undefined>)[runtimeKey];
        return (runtime?.status === "ready" || runtime?.status === "running") && (runtime.frameCount ?? 0) >= 2;
      }, routeCase.runtimeKey);

      const runtime = await page.evaluate((runtimeKey) =>
        (window as unknown as Record<string, RuntimeEvidence | undefined>)[runtimeKey], routeCase.runtimeKey);
      expect(pageErrors).toEqual([]);
      expect(runtime).toBeDefined();
      expect(runtime?.appId).toBe(routeCase.appId);
      expect(runtime?.error).toBeUndefined();
      expect(runtime?.drawCalls).toBeGreaterThan(0);
      if (routeCase.renderer === "a3d-webgl2") {
        expect(runtime?.renderer).toBe("a3d-webgl2");
      }
      routeCase.verify(runtime!);

      const screenshotPath = resolve(routeCase.screenshot);
      mkdirSync(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
      writeFileSync(screenshotPath.replace(/\.png$/, ".json"), `${JSON.stringify({
        schema: "aura3d.current-route-runtime-evidence/1.0",
        generatedAt: new Date().toISOString(),
        pass: true,
        name: routeCase.name,
        route: routeCase.route,
        renderer: routeCase.renderer,
        runtime
      }, null, 2)}\n`);
    });
  }
});
