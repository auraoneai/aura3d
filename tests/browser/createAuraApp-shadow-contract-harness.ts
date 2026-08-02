import {
  createAuraApp,
  camera,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

/**
 * FS-302 root-only shadow contract harness.
 *
 * The scene is deliberately minimal and fully authored through public
 * `@aura3d/engine` helpers: a large floor plane, a single elevated occluder, and
 * one directional key light. The only difference between the `caster` and
 * `no-caster` configurations is whether the occluder is present, so any change
 * measured in the floor region is attributable to the occluder's shadow rather
 * than to a material, camera, or lighting change.
 *
 * The occluder is the typed GLB rather than a primitive because the production
 * bridge — the only root path that submits renderer-owned shadow options — is
 * gated on at least one typed manifest GLB. A primitive-only scene falls back to
 * `webgl2-agent-runtime`, which does not render shadow maps at all, so a
 * primitive occluder could never produce honest root shadow evidence.
 *
 * Resize/DPR stability is measured by rendering the same scene at several canvas
 * sizes and pixel ratios and comparing *normalized* shadow metrics. Absolute
 * pixel counts necessarily change with resolution; the shadow's share of the
 * floor region must not.
 */

interface FloorRegionMetrics {
  /** Fraction of sampled floor pixels darker than the unshadowed floor level. */
  readonly darkFraction: number;
  /** Mean luma across the sampled floor region. */
  readonly meanLuma: number;
  readonly sampledPixels: number;
}

interface ShadowConfigurationCapture {
  readonly id: string;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly pixelRatio: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly diagnostics: {
    readonly backend: string;
    readonly runtimeBackend: string | undefined;
    readonly drawCalls: number;
    readonly renderSize: readonly number[];
    readonly shadows: {
      readonly enabled: boolean;
      readonly requested: boolean;
      readonly mapRendered: boolean;
      readonly mapSampled: boolean;
      readonly mapSize?: number;
      readonly label?: string;
      readonly nativeShadowMapBindings: number;
      readonly shadowRenderTargetsAllocated: number;
      readonly mapType: string;
    };
  };
  /** Floor metrics with the typed occluder casting a shadow. */
  readonly caster: FloorRegionMetrics;
  /** Floor metrics with the same typed occluder not casting a shadow. */
  readonly noCaster: FloorRegionMetrics;
  /** Increase in dark floor fraction attributable to the occluder. */
  readonly shadowDarkFractionDelta: number;
  /** Drop in mean floor luma attributable to the occluder. */
  readonly shadowLumaDelta: number;
}

interface RootShadowContractRunner {
  readonly imports: readonly string[];
  readonly configurationIds: readonly string[];
  renderConfiguration(id: string): Promise<ShadowConfigurationCapture>;
}

declare global {
  interface Window {
    __AURA3D_ROOT_SHADOW_CONTRACT_RUNNER__?: RootShadowContractRunner;
    __AURA3D_ROOT_SHADOW_CONTRACT_ERROR__?: string;
  }
}

interface ConfigurationDefinition {
  readonly id: string;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly pixelRatio: number;
}

/**
 * Every configuration keeps the same 3:2 aspect ratio on purpose. Changing the
 * aspect ratio changes what the fixed camera frames, which changes how much of the
 * sampled band the floor occupies — a composition difference, not a shadow
 * regression. Holding aspect constant while varying backing-store size and device
 * pixel ratio isolates the property under test: the shadow's share of the floor
 * must not depend on resolution.
 */
const configurations: readonly ConfigurationDefinition[] = [
  { id: "baseline-720x480-dpr1", cssWidth: 720, cssHeight: 480, pixelRatio: 1 },
  { id: "resized-480x320-dpr1", cssWidth: 480, cssHeight: 320, pixelRatio: 1 },
  { id: "resized-960x640-dpr1", cssWidth: 960, cssHeight: 640, pixelRatio: 1 },
  { id: "dpr1_5-720x480", cssWidth: 720, cssHeight: 480, pixelRatio: 1.5 },
  { id: "dpr2-720x480", cssWidth: 720, cssHeight: 480, pixelRatio: 2 }
];

const FLOOR_COLOR = "#c8ccd2";

void run().catch((error: unknown) => {
  window.__AURA3D_ROOT_SHADOW_CONTRACT_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  window.__AURA3D_ROOT_SHADOW_CONTRACT_RUNNER__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    configurationIds: configurations.map((configuration) => configuration.id),
    renderConfiguration: async (id: string) => renderConfiguration(requireConfiguration(id))
  };
}

async function renderConfiguration(configuration: ConfigurationDefinition): Promise<ShadowConfigurationCapture> {
  const stage = requiredElement("shadow-contract-stage");
  stage.style.width = `${configuration.cssWidth}px`;
  stage.style.height = `${configuration.cssHeight}px`;
  // Set inline min-height explicitly. The engine's default canvas mount layout
  // assigns `min-height: 100vh` whenever the inline value is empty, which silently
  // overrides an author height supplied through a stylesheet and would make every
  // configuration render at viewport height instead of the requested size.
  stage.style.minHeight = "0px";

  // The no-caster control is rendered first and the caster second on purpose, so
  // the frame left mounted in the DOM — and therefore the screenshot the spec
  // retains — is the shadowed one being claimed, not the control.
  const noCaster = await captureFloor(stage, configuration, false);
  const caster = await captureFloor(stage, configuration, true);
  // Direct paired comparison. An earlier within-frame percentile threshold reported
  // zero darkening even for a large, clearly visible shadow, because a soft shadow on
  // a light floor still sits above 82% of the frame's own peak luma. Comparing the
  // two frames pixel-for-pixel measures the shadow the occluder actually added.
  const darkening = compareFloorDarkening(noCaster.pixels, caster.pixels, caster.backingWidth, caster.backingHeight);

  return {
    id: configuration.id,
    cssWidth: configuration.cssWidth,
    cssHeight: configuration.cssHeight,
    pixelRatio: configuration.pixelRatio,
    backingWidth: caster.backingWidth,
    backingHeight: caster.backingHeight,
    diagnostics: caster.diagnostics,
    caster: caster.metrics,
    noCaster: noCaster.metrics,
    shadowDarkFractionDelta: darkening.darkenedFraction,
    shadowLumaDelta: darkening.meanDarkening
  };
}

async function captureFloor(
  stage: HTMLElement,
  configuration: ConfigurationDefinition,
  withOccluder: boolean
): Promise<{
  readonly metrics: FloorRegionMetrics;
  readonly pixels: Uint8Array;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly diagnostics: ShadowConfigurationCapture["diagnostics"];
}> {
  stage.replaceChildren();
  const app = createAuraApp(stage, {
    pixelRatio: configuration.pixelRatio,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: shadowScene(withOccluder)
  });
  await waitForAppDraw(app);
  const canvas = app.canvas;
  if (!canvas) throw new Error("Aura app did not expose a canvas for the shadow contract.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for the root shadow contract.");
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const metrics = readFloorRegionMetrics(pixels, canvas.width, canvas.height);
  const diagnostics = app.diagnostics();
  const result = {
    metrics,
    pixels,
    backingWidth: canvas.width,
    backingHeight: canvas.height,
    diagnostics: {
      backend: diagnostics.backend,
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      shadows: {
        enabled: diagnostics.renderer?.shadows.enabled ?? false,
        requested: diagnostics.renderer?.shadows.requested ?? false,
        mapRendered: diagnostics.renderer?.shadows.mapRendered ?? false,
        mapSampled: diagnostics.renderer?.shadows.mapSampled ?? false,
        mapSize: diagnostics.renderer?.shadows.mapSize,
        label: diagnostics.renderer?.shadows.label,
        nativeShadowMapBindings: diagnostics.renderer?.shadows.nativeShadowMapBindings ?? 0,
        shadowRenderTargetsAllocated: diagnostics.renderer?.shadows.shadowRenderTargetsAllocated ?? 0,
        mapType: diagnostics.renderer?.shadows.mapType ?? "unknown"
      }
    }
  };
  app.dispose();
  return result;
}

function shadowScene(withOccluder: boolean) {
  const builder = scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 2.9, 4.6], target: [0, 0.55, 0], fov: 40 }))
    .add(primitives.plane({
      name: "shadow contract receiver floor",
      material: material.pbr({ color: FLOOR_COLOR, roughness: 0.85, metallic: 0 })
    }).position(0, 0, 0).scale([10, 1, 10]));

  // The typed GLB is always present so the production bridge stays eligible in
  // both configurations, and it is always lit identically. The only difference is
  // whether the occluder sits above the floor (casting onto it) or is moved far
  // outside the sampled floor band, so the measured delta is the shadow it casts
  // rather than a lighting, material, or exposure change.
  // `targetMaxDimension` rather than `targetHeight`: this asset is not grounded
  // (its loaded bounds run from y = -4.9 to y = 19.2), so fitting by height alone
  // leaves the mesh floating well above the floor and casting only a small, distant
  // shadow. Fitting the largest dimension and lifting by roughly half of it puts the
  // occluder above the sampled floor band where it actually shadows the receiver.
  builder.add(model(assets.robotcand, {
    name: "shadow contract typed occluder",
    targetMaxDimension: 2.4
  }).position(withOccluder ? 0 : 42, 1.2, withOccluder ? 0 : 42).runtime({ id: "occluder" }));

  return builder.add(lights.directional({
    name: "shadow contract key light",
    position: [2.6, 4.4, 2.2],
    intensity: 2.1
  }));
}

/**
 * Samples the lower band of the frame, which is where the floor plane projects
 * under this fixed camera. Sampling a normalized band rather than absolute pixel
 * rows is what makes the metric comparable across resize and DPR changes.
 */
function readFloorRegionMetrics(pixels: Uint8Array, width: number, height: number): FloorRegionMetrics {
  // Normalized band covering the floor in front of and around the occluder under
  // this fixed camera. WebGL readPixels is bottom-up, so low Y is the near floor.
  const startY = Math.floor(height * 0.06);
  const endY = Math.floor(height * 0.55);
  const startX = Math.floor(width * 0.18);
  const endX = Math.floor(width * 0.82);
  let sampledPixels = 0;
  let lumaSum = 0;
  const lumas: number[] = [];

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * width + x) * 4;
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      // Skip background: the floor is a light grey material, the background is
      // near-black, so a low-luma pixel is sky rather than shadowed floor.
      const pixelLuma = luma(red, green, blue);
      if (pixelLuma < 24) continue;
      sampledPixels += 1;
      lumaSum += pixelLuma;
      lumas.push(pixelLuma);
    }
  }

  if (sampledPixels === 0) {
    return { darkFraction: 0, meanLuma: 0, sampledPixels: 0 };
  }

  // The unshadowed floor level is taken as the region's 90th-percentile luma, so
  // "dark" means dark relative to lit floor in the same frame rather than against
  // a hard-coded constant that would not survive an exposure change.
  const sorted = [...lumas].sort((first, second) => first - second);
  const litLevel = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1] ?? 0;
  const darkThreshold = litLevel * 0.82;
  const darkPixels = lumas.reduce((count, value) => (value < darkThreshold ? count + 1 : count), 0);

  return {
    darkFraction: round(darkPixels / sampledPixels),
    meanLuma: round(lumaSum / sampledPixels),
    sampledPixels
  };
}

/**
 * Fraction of sampled floor-band pixels the occluder measurably darkened, and the
 * mean luma drop across those pixels.
 *
 * This is a paired comparison of the same band in two frames that differ only by the
 * occluder's presence. Only *darkening* counts, so a brighter difference (which a
 * shadow cannot cause) is not credited.
 */
function compareFloorDarkening(
  withoutOccluder: Uint8Array,
  withOccluder: Uint8Array,
  width: number,
  height: number
): { readonly darkenedFraction: number; readonly meanDarkening: number } {
  const startY = Math.floor(height * 0.06);
  const endY = Math.floor(height * 0.55);
  const startX = Math.floor(width * 0.18);
  const endX = Math.floor(width * 0.82);
  let sampled = 0;
  let darkened = 0;
  let darkeningSum = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * width + x) * 4;
      const lit = luma(withoutOccluder[index] ?? 0, withoutOccluder[index + 1] ?? 0, withoutOccluder[index + 2] ?? 0);
      const shadowed = luma(withOccluder[index] ?? 0, withOccluder[index + 1] ?? 0, withOccluder[index + 2] ?? 0);
      // Only floor pixels: skip background in either frame.
      if (lit < 24 || shadowed < 24) continue;
      sampled += 1;
      const drop = lit - shadowed;
      // 2/255 is above readback noise but well below a visible soft-shadow edge.
      if (drop > 2) {
        darkened += 1;
        darkeningSum += drop;
      }
    }
  }

  return {
    darkenedFraction: round(darkened / Math.max(1, sampled)),
    meanDarkening: round(darkeningSum / Math.max(1, darkened))
  };
}

function luma(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function requireConfiguration(id: string): ConfigurationDefinition {
  const configuration = configurations.find((candidate) => candidate.id === id);
  if (!configuration) throw new Error(`Unknown shadow contract configuration: ${id}`);
  return configuration;
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  await waitFor(() => app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0, 30_000);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the Aura3D root shadow contract harness.");
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
