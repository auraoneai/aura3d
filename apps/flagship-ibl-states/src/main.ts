import {
  Geometry,
  PBRMaterial,
  Renderer,
  createExternalParityBrdfLut,
  createExternalParityEnvironmentLighting,
  type EnvironmentLightingOptions,
  type ExternalParityEnvironmentPreset,
  type RenderItem
} from "/packages/rendering/src/index.ts";

/**
 * Flagship linear-HDR IBL states.
 *
 * The three flagship IDs the HDR/IBL readiness audit requires —
 * `product-configurator`, `architecture-viewer`, and `game-slice` — previously lived as
 * large `examples/*` routes that a docs/examples consolidation deleted (commit
 * f44dd136 removed ~70k lines, including a 1,616-line architecture viewer and a
 * 4,335-line game slice). Their evidence producers were left behind, so the audit's
 * `flagship-linear-hdr-ibl-state` blocker became unreachable regardless of renderer work.
 *
 * This route republishes exactly the evidence that contract needs — generated linear-HDR
 * environment resources, validated specular mips, diffuse irradiance, BRDF LUT, and a
 * measured environment-reflection response — for each flagship id, using only public
 * renderer APIs. It deliberately does NOT attempt to recreate the deleted routes'
 * product/architecture/game feature surfaces; those remain removed by that product
 * decision, and this route claims only IBL state.
 */

interface FlagshipDefinition {
  readonly id: "product-configurator" | "architecture-viewer" | "game-slice";
  readonly label: string;
  /** Environment appropriate to the flagship's subject matter. */
  readonly preset: ExternalParityEnvironmentPreset;
  readonly metallic: number;
  readonly roughness: number;
  readonly baseColor: readonly [number, number, number, number];
}

const FLAGSHIPS: readonly FlagshipDefinition[] = [
  { id: "product-configurator", label: "Product studio", preset: "studio", metallic: 1, roughness: 0.12, baseColor: [0.93, 0.94, 0.96, 1] },
  { id: "architecture-viewer", label: "Architectural daylight", preset: "daylight", metallic: 0.15, roughness: 0.55, baseColor: [0.82, 0.8, 0.76, 1] },
  { id: "game-slice", label: "Gameplay stage", preset: "gameplay", metallic: 0.75, roughness: 0.3, baseColor: [0.6, 0.72, 0.9, 1] }
];

interface FlagshipEntry {
  readonly id: string;
  readonly label: string;
  readonly preset: string;
  readonly featureEvidence: {
    readonly generatedEnvironmentMap: boolean;
    readonly environmentResourceSet: string;
    readonly environmentReflectionEvidence: boolean;
    readonly brdfLutValidated: boolean;
  };
  readonly metrics: {
    readonly environmentTextureMipCount: number;
    readonly environmentBrdfLutValidated: boolean;
    readonly environmentDiffuseIrradiance: boolean;
    readonly environmentSpecularIntensity: number;
    readonly drawCalls: number;
    readonly maxLinearValue: number;
    readonly nonBackgroundPixels: number;
    readonly brdfNonZeroPixels: number;
  };
}

interface FlagshipState {
  readonly status: "ready" | "error";
  readonly entries: readonly FlagshipEntry[];
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_FLAGSHIP_IBL__?: FlagshipState;
  }
}

const SIZE = 300;

void run().catch((error: unknown) => {
  window.__AURA3D_FLAGSHIP_IBL__ = {
    status: "error",
    entries: [],
    claimBoundary: "",
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  };
});

async function run(): Promise<void> {
  const brdfLut = createExternalParityBrdfLut(32);
  const entries: FlagshipEntry[] = [];
  for (const flagship of FLAGSHIPS) {
    entries.push(await renderFlagship(flagship, brdfLut.diagnostics.nonZeroPixels));
  }
  window.__AURA3D_FLAGSHIP_IBL__ = {
    status: "ready",
    entries,
    claimBoundary: "Generated local linear-HDR environments prove the IBL resource pipeline and that flagship materials sample the environment. They are bootstrap-only: they are not licensed-HDRI flagship captures and do not establish parity with another renderer."
  };
}

async function renderFlagship(flagship: FlagshipDefinition, brdfNonZeroPixels: number): Promise<FlagshipEntry> {
  const bundle = createExternalParityEnvironmentLighting(flagship.preset);
  const resources = bundle.resources;

  // Two renders: one with the environment bound, one with the environment map removed.
  //
  // The material's own `environmentIntensity` is NOT the off-switch: the environment
  // contribution is driven by EnvironmentLightingOptions, so zeroing the material
  // uniform produced byte-identical frames and a zero measurement. Dropping the map
  // bindings from the lighting options is what actually removes the environment.
  const withoutEnvironmentMap: EnvironmentLightingOptions = {
    color: bundle.lighting.color,
    intensity: bundle.lighting.intensity,
    environmentMapIntensity: 0,
    environmentMapSpecularIntensity: 0
  };
  const lit = await renderOnce(flagship, bundle.lighting, `${flagship.id} · ${flagship.preset}`);
  const unlit = await renderOnce(flagship, withoutEnvironmentMap, undefined);

  let specularEnergy = 0;
  let visible = 0;
  for (let index = 0; index < lit.pixels.length; index += 4) {
    const litLuma = (lit.pixels[index] ?? 0) + (lit.pixels[index + 1] ?? 0) + (lit.pixels[index + 2] ?? 0);
    const unlitLuma = (unlit.pixels[index] ?? 0) + (unlit.pixels[index + 1] ?? 0) + (unlit.pixels[index + 2] ?? 0);
    if (litLuma <= 40 && unlitLuma <= 40) continue;
    visible += 1;
    specularEnergy += Math.max(0, litLuma - unlitLuma);
  }
  const environmentSpecularIntensity = Number((specularEnergy / Math.max(1, visible)).toFixed(4));

  return {
    id: flagship.id,
    label: flagship.label,
    preset: flagship.preset,
    featureEvidence: {
      generatedEnvironmentMap: true,
      environmentResourceSet: resources.resourceSet,
      // Only true when the environment measurably brightened the subject, so an
      // environment-ignoring material cannot report reflection evidence.
      environmentReflectionEvidence: environmentSpecularIntensity > 0,
      brdfLutValidated: resources.validation.brdfLutTexture
    },
    metrics: {
      environmentTextureMipCount: Number(resources.specularMipCount ?? 0),
      environmentBrdfLutValidated: resources.validation.brdfLutTexture,
      environmentDiffuseIrradiance: resources.validation.diffuseIrradiance,
      environmentSpecularIntensity,
      drawCalls: lit.drawCalls,
      maxLinearValue: Number(resources.maxLinearValue ?? 0),
      nonBackgroundPixels: visible,
      brdfNonZeroPixels
    }
  };
}

async function renderOnce(
  flagship: FlagshipDefinition,
  lighting: EnvironmentLightingOptions,
  visibleLabel: string | undefined
): Promise<{ readonly pixels: Uint8Array; readonly drawCalls: number }> {
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

  const item: RenderItem = {
    label: `flagship-${flagship.id}`,
    geometry: Geometry.uvSphere(0.9, 96, 48, { textured: true }),
    material: new PBRMaterial({
      name: `flagship-${flagship.id}-material`,
      baseColor: [...flagship.baseColor] as [number, number, number, number],
      metallic: flagship.metallic,
      roughness: flagship.roughness
    }),
    modelViewProjectionMatrix: perspectiveAt(2.7)
  };
  renderer.render({ renderItems: [item], environmentLighting: lighting, cameraPolicy: "identity" });
  const pixels = renderer.device.readPixels(0, 0, SIZE, SIZE);
  const drawCalls = renderer.getDiagnostics().drawCalls;
  if (visibleLabel) showCanvas(visibleLabel, pixels);
  renderer.dispose();
  canvas.remove();
  return { pixels, drawCalls };
}

function showCanvas(label: string, pixels: Uint8Array): void {
  let row = document.querySelector<HTMLElement>(".row");
  if (!row) {
    row = document.createElement("div");
    row.className = "row";
    document.getElementById("flagship-root")?.append(row);
  }
  const card = document.createElement("div");
  card.className = "card";
  const view = document.createElement("canvas");
  view.className = "view";
  view.width = SIZE;
  view.height = SIZE;
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
  text.className = "label";
  text.textContent = label;
  card.append(view, text);
  row.append(card);
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
