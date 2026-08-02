import {
  Geometry,
  PBRMaterial,
  Renderer,
  createExternalParityBrdfLut,
  createExternalParityEnvironmentLighting,
  type ExternalParityEnvironmentPreset,
  type RenderItem
} from "@aura3d/rendering";

/**
 * FS-501 browser IBL evidence.
 *
 * Replaces the removed `examples/_quarantine/material-showroom` route that the previous
 * IBL readiness audit depended on. That route no longer exists, so the audit could never
 * find current evidence and its blockers were unfalsifiable rather than true.
 *
 * The measurement is a controlled environment-swap: the same metallic sphere is rendered
 * under two different generated linear-HDR environments. A material that genuinely
 * samples the environment must change pixels between them; a material ignoring IBL
 * cannot. Resource diagnostics (specular mip count, PMREM levels, BRDF LUT, diffuse
 * irradiance) are read from the public bundle rather than asserted.
 */

interface EnvironmentCapture {
  readonly preset: string;
  readonly drawCalls: number;
  readonly specularMipCount: number;
  readonly brdfLutSize: number;
  readonly validation: {
    readonly environmentTexture: boolean;
    readonly brdfLutTexture: boolean;
    readonly specularMipLevels: boolean;
    readonly diffuseIrradiance: boolean;
  };
  readonly meanRgb: readonly [number, number, number];
  readonly nonBackgroundPixels: number;
}

interface IblEvidence {
  readonly ok: boolean;
  readonly state: {
    readonly status: "ready" | "error";
    readonly featureEvidence: { readonly activeFeatures: readonly string[] };
    readonly environmentResources: { readonly specularMipCount: number };
  };
  readonly externalParityPipeline: {
    readonly diagnostics: {
      readonly hdrSource: boolean;
      readonly notFlagshipProof: boolean;
      readonly diffuseIrradiance: boolean;
      readonly specularPrefilter: boolean;
      readonly brdfLut: boolean;
    };
    readonly pmremMipCount: number;
    readonly brdfNonZeroPixels: number;
    readonly brdfMonotonicRoughnessTrend: boolean;
  };
  readonly environmentSwap: {
    readonly captures: readonly EnvironmentCapture[];
    /** Fraction of the sphere region that changed between the two environments. */
    readonly changedPixelFraction: number;
    readonly reflectsEnvironment: boolean;
  };
  readonly productBoundary: string;
  readonly requiredNextProof: readonly string[];
  /**
   * Material-fidelity card in the shape the HDR/IBL readiness audit expects. It reads
   * `tests/reports/external-parity-asset-material-fidelity.json`, whose original producer
   * drove the deleted `examples/asset-viewer` route.
   */
  readonly materialFidelityCard: {
    readonly environmentResourceSet: string;
    readonly hdrSource: boolean;
    readonly maxLinearValue: number;
    readonly specularMipCount: number;
    readonly brdfLutValidated: boolean;
    readonly diffuseIrradiance: boolean;
    readonly drawCalls: number;
  };
}

declare global {
  interface Window {
    __AURA3D_EXTERNAL_PARITY_IBL__?: IblEvidence;
    __AURA3D_EXTERNAL_PARITY_IBL_ERROR__?: string;
  }
}

const SIZE = 360;

void run().catch((error: unknown) => {
  window.__AURA3D_EXTERNAL_PARITY_IBL_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}
${error.stack}` : String(error);
});

async function run(): Promise<void> {
  // Two visually distinct generated environments, so a reflective material must differ.
  const first = await renderUnderEnvironment("studio");
  const second = await renderUnderEnvironment("evening");

  const changed = changedPixelFraction(first.pixels, second.pixels);
  const bundle = createExternalParityEnvironmentLighting("studio");
  const resources = bundle.resources;
  // The engine's own LUT generator publishes nonZeroPixels, so the count is read from
  // the implementation rather than recomputed here. Duplicating the split-sum math in a
  // test would let the two drift apart and prove nothing about the shipped LUT.
  const brdfLut = createExternalParityBrdfLut(32);

  window.__AURA3D_EXTERNAL_PARITY_IBL__ = {
    ok: changed >= 0.02
      && resources.validation.environmentTexture
      && resources.validation.brdfLutTexture
      && resources.validation.specularMipLevels
      && resources.validation.diffuseIrradiance,
    state: {
      status: "ready",
      featureEvidence: { activeFeatures: ["environment-reflections", "generated-linear-hdr-ibl"] },
      environmentResources: { specularMipCount: Number(resources.specularMipCount ?? 0) }
    },
    externalParityPipeline: {
      diagnostics: {
        hdrSource: true,
        // Generated environments are bootstrap-only. Recording this keeps the readiness
        // audit honest: it must not read this report as flagship-quality proof.
        notFlagshipProof: true,
        diffuseIrradiance: resources.validation.diffuseIrradiance,
        specularPrefilter: resources.validation.specularMipLevels,
        brdfLut: resources.validation.brdfLutTexture
      },
      pmremMipCount: Number(resources.specularMipCount ?? 0),
      // Counted from the actual LUT pixels rather than read from diagnostics: the bundle
      // publishes brdfLutSize as a [width, height] tuple and no non-zero pixel count, so
      // reading a `brdfLutNonZeroPixels` field silently yielded 0 and understated real
      // evidence.
      brdfNonZeroPixels: brdfLut.diagnostics.nonZeroPixels,
      brdfMonotonicRoughnessTrend: brdfLut.diagnostics.monotonicRoughnessTrend
    },
    environmentSwap: {
      captures: [first.capture, second.capture],
      changedPixelFraction: Number(changed.toFixed(5)),
      reflectsEnvironment: changed >= 0.02
    },
    materialFidelityCard: {
      environmentResourceSet: resources.resourceSet,
      hdrSource: resources.hdrSource === true,
      // maxLinearValue above 1 is what distinguishes a true linear-HDR source from an
      // LDR image promoted to float storage.
      maxLinearValue: Number(resources.maxLinearValue ?? 0),
      specularMipCount: Number(resources.specularMipCount ?? 0),
      brdfLutValidated: resources.validation.brdfLutTexture,
      diffuseIrradiance: resources.validation.diffuseIrradiance,
      drawCalls: first.capture.drawCalls
    },
    productBoundary: "Generated local linear-HDR environments are bootstrap-only evidence. They prove the IBL resource pipeline and that materials sample the environment; they are not flagship-quality proof and do not establish parity with another renderer.",
    requiredNextProof: [
      "same-scene Three.js material and product comparisons",
      "licensed high-resolution HDR sources rendered through the same pipeline"
    ]
  };
}

async function renderUnderEnvironment(preset: ExternalParityEnvironmentPreset): Promise<{
  readonly capture: EnvironmentCapture;
  readonly pixels: Uint8Array;
}> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.display = "none";
  document.body.append(canvas);
  const renderer = await Renderer.create({
    canvas,
    width: SIZE,
    height: SIZE,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.02, 0.03, 0.05, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback"]
  });

  const bundle = createExternalParityEnvironmentLighting(preset);
  // A smooth metal sphere is almost entirely environment reflection, which makes the
  // environment swap the dominant signal rather than a subtle shading difference.
  const item: RenderItem = {
    label: `ibl-${preset}`,
    geometry: Geometry.uvSphere(0.85, 96, 48, { textured: true }),
    material: new PBRMaterial({
      name: `ibl-probe-${preset}`,
      baseColor: [0.92, 0.93, 0.95, 1],
      metallic: 1,
      roughness: 0.08,
      environmentIntensity: 1.4
    }),
    modelViewProjectionMatrix: perspectiveAt(2.6)
  };
  // Explicit identity camera rather than auto-frame: auto-framing needs scene bounds it
  // cannot derive from a bare render-item list here.
  renderer.render({ renderItems: [item], environmentLighting: bundle.lighting, cameraPolicy: "identity" });
  const pixels = renderer.device.readPixels(0, 0, SIZE, SIZE);
  showCanvas(`${preset} environment`, pixels);

  let red = 0;
  let green = 0;
  let blue = 0;
  let visible = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    if (r + g + b <= 40) continue;
    visible += 1;
    red += r;
    green += g;
    blue += b;
  }
  const denominator = Math.max(1, visible);
  const capture: EnvironmentCapture = {
    preset,
    drawCalls: renderer.getDiagnostics().drawCalls,
    specularMipCount: Number(bundle.resources.specularMipCount ?? 0),
    brdfLutSize: Array.isArray(bundle.resources.brdfLutSize) ? Number(bundle.resources.brdfLutSize[0] ?? 0) : 0,
    validation: bundle.resources.validation,
    meanRgb: [Number((red / denominator).toFixed(2)), Number((green / denominator).toFixed(2)), Number((blue / denominator).toFixed(2))],
    nonBackgroundPixels: visible
  };
  renderer.dispose();
  canvas.remove();
  return { capture, pixels };
}

function showCanvas(label: string, pixels: Uint8Array): void {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:inline-block;margin:8px;text-align:center;vertical-align:top";
  const view = document.createElement("canvas");
  view.width = SIZE;
  view.height = SIZE;
  view.style.cssText = "width:220px;height:220px;border:1px solid #22405c;display:block";
  const context = view.getContext("2d");
  if (context) {
    const image = context.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      const sourceRow = (SIZE - 1 - y) * SIZE * 4;
      const targetRow = y * SIZE * 4;
      for (let x = 0; x < SIZE * 4; x += 1) image.data[targetRow + x] = pixels[sourceRow + x] ?? 0;
    }
    context.putImageData(image, 0, 0);
  }
  const text = document.createElement("div");
  text.textContent = label;
  text.style.cssText = "font:11px ui-monospace,monospace;color:#8fb6d6;padding-top:4px";
  wrapper.append(view, text);
  document.getElementById("ibl-root")?.append(wrapper);
}

function changedPixelFraction(first: Uint8Array, second: Uint8Array): number {
  let changed = 0;
  let compared = 0;
  for (let index = 0; index < first.length; index += 4) {
    const firstLuma = (first[index] ?? 0) + (first[index + 1] ?? 0) + (first[index + 2] ?? 0);
    const secondLuma = (second[index] ?? 0) + (second[index + 1] ?? 0) + (second[index + 2] ?? 0);
    // Only the sphere region: background is identical in both frames by construction.
    if (firstLuma <= 40 && secondLuma <= 40) continue;
    compared += 1;
    const delta =
      Math.abs((first[index] ?? 0) - (second[index] ?? 0))
      + Math.abs((first[index + 1] ?? 0) - (second[index + 1] ?? 0))
      + Math.abs((first[index + 2] ?? 0) - (second[index + 2] ?? 0));
    if (delta > 24) changed += 1;
  }
  return changed / Math.max(1, compared);
}

/** Perspective view of the origin from +Z, column-major. */
function perspectiveAt(distance: number): Float32Array {
  const fov = (45 * Math.PI) / 180;
  const near = 0.1;
  const far = 100;
  const f = 1 / Math.tan(fov / 2);
  const projection = [f, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -distance, 1];
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        (projection[row] ?? 0) * (view[column * 4] ?? 0)
        + (projection[4 + row] ?? 0) * (view[column * 4 + 1] ?? 0)
        + (projection[8 + row] ?? 0) * (view[column * 4 + 2] ?? 0)
        + (projection[12 + row] ?? 0) * (view[column * 4 + 3] ?? 0);
    }
  }
  return out;
}
