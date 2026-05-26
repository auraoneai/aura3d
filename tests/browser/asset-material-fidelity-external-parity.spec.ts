import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface AssetViewerMaterialSnapshot {
  readonly status?: "ready" | "error";
  readonly error?: string;
  readonly loaderDiagnostics?: {
    readonly features?: readonly string[];
    readonly textureSlots?: readonly string[];
    readonly materialFeatures?: readonly string[];
    readonly textureCount?: number;
    readonly materialCount?: number;
  };
  readonly inspection?: {
    readonly materials?: ReadonlyArray<{
      readonly name: string;
      readonly alphaMode: string;
      readonly doubleSided: boolean;
      readonly emissiveStrength: number;
      readonly textures: ReadonlyArray<{
        readonly slot: string;
        readonly texture: number;
        readonly image: number;
        readonly texCoord: number;
        readonly transform?: {
          readonly offset: readonly [number, number];
          readonly scale: readonly [number, number];
          readonly rotation: number;
        };
      }>;
      readonly features?: {
        readonly normalScale?: number;
        readonly occlusionStrength?: number;
      };
      readonly extensions: readonly string[];
    }>;
    readonly textures?: ReadonlyArray<{
      readonly name: string;
      readonly runtime?: {
        readonly width: number;
        readonly height: number;
        readonly format: string;
        readonly colorSpace: "linear" | "srgb";
        readonly mipLevels: number;
        readonly fallbackByteLength: number;
      };
    }>;
  };
  readonly decodedTextures?: ReadonlyArray<{
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly format: string;
    readonly colorSpace: "linear" | "srgb";
    readonly mipLevels: number;
  }>;
  readonly diagnostics?: {
    readonly drawCalls?: number;
    readonly lastError?: string | null;
  };
  readonly materialVariants?: readonly string[];
  readonly selectedMaterialVariant?: string;
  readonly variantSwitching?: {
    readonly available: boolean;
    readonly applied: boolean;
  };
  readonly activeRenderMaterials?: readonly string[];
  readonly environmentResources?: {
    readonly resourceSet?: string;
    readonly hdrSource?: boolean;
    readonly maxLinearValue?: number;
    readonly specularMipCount?: number;
    readonly validation?: {
      readonly brdfLutTexture?: boolean;
      readonly diffuseIrradiance?: boolean;
    };
  };
  readonly featureEvidence?: Record<string, unknown>;
}

interface ExternalParityMaterialFidelityReport {
  ok: boolean;
  generatedAt: string;
  readonly command: string;
  readonly asset: string;
  readonly validations: ExternalParityMaterialFidelityValidation[];
  completedTaskEvidence: readonly {
    readonly task: string;
    readonly evidence: readonly string[];
  }[];
  blockedTasks: readonly string[];
}

interface ExternalParityMaterialFidelityValidation {
  readonly name: string;
  readonly ok: boolean;
  readonly evidence: Record<string, unknown>;
}

const report: ExternalParityMaterialFidelityReport = {
  ok: false,
  generatedAt: new Date().toISOString(),
  command: "pnpm exec playwright test tests/browser/asset-material-fidelity-external-parity.spec.ts",
  asset: "fixtures/external-parity-assets/materials/external-parity-material-fidelity-card/external-parity-material-fidelity-card.gltf",
  validations: [],
  completedTaskEvidence: [],
  blockedTasks: [],
};

test.describe("external-parity asset material fidelity report", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.validations.length > 0 && report.validations.every((validation) => validation.ok);
    report.generatedAt = new Date().toISOString();
    report.completedTaskEvidence = [{
      task: "`tests/reports/external-parity-asset-material-fidelity.json` passes.",
      evidence: [
        "fixtures/external-parity-assets/materials/external-parity-material-fidelity-card/external-parity-material-fidelity-card.gltf",
        "examples/asset-viewer/main.ts",
        "tests/browser/asset-material-fidelity-external-parity.spec.ts",
        "tests/reports/external-parity-asset-material-fidelity.json",
      ],
    }];
    report.blockedTasks = [
      "This report proves loader, inspector, texture decode, render-resource, variant, and asset-viewer reporting for the generated material fidelity card.",
      "It is not a pixel-perfect BRDF, reference-grade physical IBL, shadow, tone-mapping, or real-world textured model parity claim.",
    ];
    const reportPath = resolve("tests/reports/external-parity-asset-material-fidelity.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("loads the material fidelity corpus asset and reports supported material features", async ({ page }) => {
    const url = `${server.origin}/fixtures/external-parity-assets/materials/external-parity-material-fidelity-card/external-parity-material-fidelity-card.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const snapshot = (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerMaterialSnapshot }).__AURA3D_ASSET_VIEWER__;
        return snapshot?.status === "ready" || snapshot?.status === "error";
      },
      undefined,
      { timeout: 20_000 },
    );

    let result = await snapshot(page);
    expect(result?.status, result?.error).toBe("ready");
    expect(await nonBlankWebGLPixels(page, "[data-testid='asset-viewer-canvas']")).toBeGreaterThan(1000);

    const material = result?.inspection?.materials?.find((entry) => entry.name === "external-parity-textured-alpha-emissive");
    expect(material).toBeTruthy();
    const slots = material?.textures.map((texture) => texture.slot).sort() ?? [];
    expect(slots).toEqual(["baseColor", "emissive", "metallicRoughness", "normal", "occlusion"]);
    expect(material?.alphaMode).toBe("BLEND");
    expect(material?.doubleSided).toBe(true);
    expect(material?.emissiveStrength).toBeCloseTo(1.8);
    expect(material?.features?.normalScale).toBeCloseTo(0.6);
    expect(material?.features?.occlusionStrength).toBeCloseTo(0.7);
    expect(material?.extensions).toEqual(expect.arrayContaining(["KHR_materials_emissive_strength"]));
    expect(material?.textures.find((texture) => texture.slot === "baseColor")?.transform).toEqual({
      offset: [0.1, 0.2],
      scale: [0.75, 0.75],
      rotation: 0.15,
    });

    expect(result?.loaderDiagnostics?.textureSlots).toEqual(expect.arrayContaining([
      "base-color",
      "metallic-roughness",
      "normal",
      "occlusion",
      "emissive",
    ]));
    expect(result?.loaderDiagnostics?.features).toEqual(expect.arrayContaining([
      "extension:KHR_texture_transform",
      "extension:KHR_materials_emissive_strength",
      "extension:KHR_materials_variants",
      "material:alpha-blend",
      "material:double-sided",
      "material:normal-texture",
      "material:occlusion-texture",
      "textures",
    ]));
    expect(result?.inspection?.textures?.length).toBe(4);
    for (const texture of result?.inspection?.textures ?? []) {
      expect(texture.runtime).toMatchObject({
        width: 2,
        height: 1,
        format: "rgba8",
        mipLevels: 1,
      });
    }
    expect(result?.decodedTextures?.length).toBe(4);
    expect(result?.featureEvidence?.generatedEnvironmentMap).toBe(true);
    expect(result?.featureEvidence?.environmentReflectionEvidence).toBe(true);
    expect(result?.featureEvidence?.brdfLutValidated).toBe(true);
    expect(result?.environmentResources?.resourceSet).toBe("generated-local-linear-hdr-environment");
    expect(result?.environmentResources?.hdrSource).toBe(true);
    expect(Number(result?.environmentResources?.maxLinearValue ?? 0)).toBeGreaterThan(1);
    expect(Number(result?.environmentResources?.specularMipCount ?? 0)).toBeGreaterThanOrEqual(4);
    expect(result?.environmentResources?.validation?.brdfLutTexture).toBe(true);
    expect(result?.environmentResources?.validation?.diffuseIrradiance).toBe(true);

    await page.getByTestId("asset-viewer-material-variant").selectOption("warm-alt-finish");
    await expect.poll(() => snapshot(page).then((next) => next?.selectedMaterialVariant)).toBe("warm-alt-finish");
    result = await snapshot(page);
    expect(result?.variantSwitching).toEqual({ available: true, applied: true });
    expect(result?.activeRenderMaterials).toContain("external-parity-warm-alt-finish");

    report.validations.push({
      name: "external-parity-material-fidelity-card",
      ok: true,
      evidence: {
        textureSlots: result?.loaderDiagnostics?.textureSlots ?? [],
        materialFeatures: result?.loaderDiagnostics?.materialFeatures ?? [],
        decodedTextures: result?.decodedTextures ?? [],
        materialVariants: result?.materialVariants ?? [],
        selectedMaterialVariant: result?.selectedMaterialVariant,
        drawCalls: result?.diagnostics?.drawCalls ?? 0,
        environmentResourceSet: result?.environmentResources?.resourceSet,
        hdrSource: result?.environmentResources?.hdrSource,
        maxLinearValue: result?.environmentResources?.maxLinearValue,
        specularMipCount: result?.environmentResources?.specularMipCount,
        brdfLutValidated: result?.environmentResources?.validation?.brdfLutTexture,
        diffuseIrradiance: result?.environmentResources?.validation?.diffuseIrradiance,
      },
    });
  });
});

async function snapshot(page: Page): Promise<AssetViewerMaterialSnapshot | undefined> {
  return page.evaluate(() => {
    return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerMaterialSnapshot }).__AURA3D_ASSET_VIEWER__;
  });
}

async function nonBlankWebGLPixels(page: Page, selector: string): Promise<number> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const gl = canvas?.getContext("webgl2", { preserveDrawingBuffer: true }) ?? canvas?.getContext("webgl", { preserveDrawingBuffer: true });
    if (!canvas || !gl) return 0;
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let pixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
    }
    return pixels;
  }, selector);
}
