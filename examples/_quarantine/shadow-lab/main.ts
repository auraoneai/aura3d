import { DirectionalLight, PointLight, SpotLight } from "@galileo3d/scene";
import {
  CascadedShadowMaps,
  CascadedShadowPass,
  Geometry,
  MockRenderDevice,
  PBRMaterial,
  Renderer,
  ShadowMap,
  ShadowPass,
  ShadowProjectionBuilder,
  UnlitMaterial,
  createV4RenderPresetEvidence,
  v4ActiveFeature,
  v4BlockedFeature,
  type Bounds3,
  type RenderItem,
  type ShadowFilterKernel,
  type V4RenderPresetEvidence
} from "@galileo3d/rendering";

declare global {
  interface Window {
    __GALILEO3D_SHADOW_LAB__?: ShadowLabState;
  }
}

interface ShadowLabState {
  readonly id: "shadow-lab";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2-plus-shadow-pass";
  readonly visualClaim: "bounded-directional-shadow-lab";
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
  readonly screenshotPath: "tests/reports/v4-example-screenshots/shadow-lab.png";
  readonly featureEvidence?: V4RenderPresetEvidence;
  readonly claimBoundary: string;
  readonly cascadeCount?: number;
  readonly cascadeSplits?: readonly { readonly index: number; readonly near: number; readonly far: number }[];
  readonly cascadeRendered?: readonly boolean[];
  readonly initialShadowCentroid?: readonly [number, number];
  readonly movedShadowCentroid?: readonly [number, number];
  readonly shadowPixel?: readonly number[];
  readonly planePixel?: readonly number[];
  readonly pcf?: {
    readonly mode: "pcf";
    readonly radius: number;
    readonly samples: number;
    readonly weightSum: number;
    readonly litPixel: readonly number[];
    readonly penumbraPixel: readonly number[];
    readonly shadowPixel: readonly number[];
  };
  readonly pointSpot?: {
    readonly point: {
      readonly mapFaces: number;
      readonly renderedFaces: number;
      readonly range: number;
      readonly pixel: readonly number[];
    };
    readonly spot: {
      readonly rendered: boolean;
      readonly angle: number;
      readonly penumbra: number;
      readonly pcfSamples: number;
      readonly pixel: readonly number[];
    };
    readonly drawCalls: number;
  };
  readonly debugView?: {
    readonly cascadeCount: number;
    readonly mapResolution: readonly number[];
    readonly casterCount: number;
    readonly receiverCount: number;
    readonly frustumCornerCount: number;
    readonly texelSize: readonly number[];
    readonly stableOffset: readonly (readonly [number, number])[];
    readonly jitterStableDelta: readonly (readonly [number, number])[];
    readonly orthographic: readonly {
      readonly left: number;
      readonly right: number;
      readonly bottom: number;
      readonly top: number;
      readonly near: number;
      readonly far: number;
    }[];
    readonly pixels: {
      readonly cascade: readonly number[];
      readonly caster: readonly number[];
      readonly receiver: readonly number[];
      readonly frustum: readonly number[];
      readonly resolutionLabel: readonly number[];
    };
  };
  readonly controls?: ShadowLabControls;
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly error?: string;
}

interface ShadowLabControls {
  readonly mapSize: number;
  readonly bias: number;
  readonly darkness: number;
  readonly pcfRadius: number;
}

type ShadowDebugFit = ReturnType<CascadedShadowMaps["computeStableCameraFits"]>[number];

const knownLimits = [
  "This page validates directional shadow metadata and projected-shadow evidence, not production soft-shadow quality.",
  "Stable cascade fitting, bounded point/spot shadow-pass coverage, and bounded 3x3 PCF-equivalent filtering evidence exist here.",
  "The debug canvas shows cascade/caster/receiver/frustum fitting evidence; product-scene shadow integration still needs separate screenshots.",
] as const;

const claimBoundary = "V4 shadow-lab evidence is limited to directional, point, and spot shadow-pass metadata, cascade/debug, PCF, and darker-region browser pixel checks on a lab scene; production forward-pass shadow sampling and full flagship-scene shadow parity are not claimed.";

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_SHADOW_LAB__ = {
      id: "shadow-lab",
      status: "error",
      renderer: "webgl2-plus-shadow-pass",
      visualClaim: "bounded-directional-shadow-lab",
      screenshotPath: "tests/reports/v4-example-screenshots/shadow-lab.png",
      claimBoundary,
      knownLimits,
      errors: [error instanceof Error ? error.message : String(error)],
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { renderCanvas, projectionCanvas, status, mapSizeInput, biasInput, darknessInput, pcfRadiusInput } = createShell();
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas: renderCanvas,
    width: renderCanvas.width,
    height: renderCanvas.height,
    clearColor: [0.76, 0.83, 0.88, 1],
    antialias: false
  });
  const context = projectionCanvas.getContext("2d");
  if (!context) throw new Error("Shadow lab requires a 2D presentation context.");

  const render = () => {
    const controls = readControls(mapSizeInput, biasInput, darknessInput, pcfRadiusInput);
    const diagnostics = renderer.render([
      {
        geometry: Geometry.litCube(1.15),
        material: new PBRMaterial({
          baseColor: [0.46, 0.78, 1, 1],
          roughness: 0.46,
          emissiveColor: [0.08, 0.18, 0.28],
          emissiveStrength: 1.4,
          renderState: { cullMode: "none" }
        }),
        label: "shadow-lab-visible-caster"
      }
    ]);
    const light = new DirectionalLight("shadow-lab-key");
    light.castsShadow = true;
    light.intensity = 1;
    light.transform.setRotation(0, 0, 0, 1);
    const caster: RenderItem = {
      geometry: Geometry.cube(1),
      material: new UnlitMaterial({ color: [0.85, 0.94, 1, 1] }),
      modelMatrix: modelMatrix(-0.2, 1.45, 0.1, 0.84, 0.95, 0.84),
      label: "shadow-lab-caster"
    };
    const receiver: RenderItem = {
      geometry: Geometry.litCube(1),
      material: new UnlitMaterial({ color: [0.74, 0.82, 0.7, 1] }),
      modelMatrix: modelMatrix(0, -0.06, 0, 5.2, 0.1, 3.2),
      label: "shadow-lab-receiver"
    };
    const cascades = new CascadedShadowMaps({
      cascadeCount: 3,
      near: 0.1,
      far: 36,
      lambda: 0.62,
      size: controls.mapSize,
      bias: controls.bias,
      filter: "pcf",
      pcfRadius: controls.pcfRadius,
      pcfSamples: 9,
      label: "shadow-lab"
    });
    const device = new MockRenderDevice();
    device.beginFrame(controls.mapSize, controls.mapSize);
    const cascadeResult = new CascadedShadowPass({ light, casters: [caster], cascades }).execute({ device, width: controls.mapSize, height: controls.mapSize });
    const pointSpot = renderPointSpotShadowEvidence(caster, controls);
    device.endFrame();
    const fitOptions = {
      camera: {
        position: [0, 2.1, 5.4] as const,
        target: [0, 0.85, 0] as const,
        fovYRadians: Math.PI / 4,
        aspect: renderCanvas.width / renderCanvas.height
      },
      lightDirection: [-0.52, -1, -0.28] as const,
      casters: [caster],
      receivers: [receiver],
      padding: 0.22
    };
    const fits = cascades.computeStableCameraFits(fitOptions);
    const jitterFits = cascades.computeStableCameraFits({
      ...fitOptions,
      camera: {
        ...fitOptions.camera,
        position: [0.00018, 2.10012, 5.39991],
        target: [0.00018, 0.85012, -0.00009]
      }
    });

    const projector = new ShadowProjectionBuilder();
    const initial = projector.projectBounds({
      casterBounds: movedBounds(-0.45),
      lightDirection: [-0.52, -1, -0.28],
      receiverPlaneY: 0
    });
    const moved = projector.projectBounds({
      casterBounds: movedBounds(0.35),
      lightDirection: [-0.52, -1, -0.28],
      receiverPlaneY: 0
    });

    const filterKernel = cascades.getCascades()[0]!.shadowMap.filterKernel;
    drawLab(context, projectionCanvas, initial.points, moved.points, controls, filterKernel, fits);
    const debugPixels = {
      cascade: readPixel(context, 76, 190),
      caster: readPixel(context, 270, 240),
      receiver: readPixel(context, 300, 312),
      frustum: readPixel(context, 206, 194),
      resolutionLabel: readPixel(context, 54, 62)
    };
    window.__GALILEO3D_SHADOW_LAB__ = {
      id: "shadow-lab",
      status: "ready",
      renderer: "webgl2-plus-shadow-pass",
      visualClaim: "bounded-directional-shadow-lab",
      knownLimits,
      errors: [],
      diagnostics,
      screenshotPath: "tests/reports/v4-example-screenshots/shadow-lab.png",
      claimBoundary,
      featureEvidence: createV4RenderPresetEvidence({
        exampleId: "shadow-lab",
        screenshotPath: "tests/reports/v4-example-screenshots/shadow-lab.png",
        features: [
          v4ActiveFeature("directional-shadows", "CascadedShadowPass renders three directional shadow cascades with stable camera fits."),
          v4ActiveFeature("color-management", "Debug and WebGL canvases publish opaque pixel evidence for lit and shadowed regions."),
          v4ActiveFeature("bounded-pbr", "Visible WebGL2 caster uses the bounded PBR material path."),
          v4BlockedFeature("contact-shadows", "Contact shadows are not implemented in this lab; it validates directional projected shadows only."),
          v4BlockedFeature("postprocess-fxaa", "Shadow lab does not run a postprocess pass; PCF is shadow filtering, not FXAA."),
          v4BlockedFeature("hdr", "Shadow lab does not use HDR targets or HDR IBL.")
        ]
      }),
      cascadeCount: cascades.cascadeCount,
      cascadeSplits: cascades.getCascades().map((cascade) => cascade.split),
      cascadeRendered: cascadeResult.cascades.map((cascade) => cascade.rendered),
      initialShadowCentroid: centroid2d(initial.points),
      movedShadowCentroid: centroid2d(moved.points),
      shadowPixel: readPixel(context, 456, 346),
      planePixel: readPixel(context, 80, 430),
      pcf: {
        mode: "pcf",
        radius: filterKernel.radius,
        samples: filterKernel.samples.length,
        weightSum: filterKernel.samples.reduce((sum, sample) => sum + sample.weight, 0),
        litPixel: readPixel(context, 690, 104),
        penumbraPixel: readPixel(context, 794, 104),
        shadowPixel: readPixel(context, 842, 104)
      },
      pointSpot: {
        point: {
          mapFaces: pointSpot.point.mapFaces,
          renderedFaces: pointSpot.point.renderedFaces,
          range: pointSpot.point.range,
          pixel: readPixel(context, 708, 226)
        },
        spot: {
          rendered: pointSpot.spot.rendered,
          angle: pointSpot.spot.angle,
          penumbra: pointSpot.spot.penumbra,
          pcfSamples: pointSpot.spot.pcfSamples,
          pixel: readPixel(context, 842, 226)
        },
        drawCalls: pointSpot.drawCalls
      },
      debugView: {
        cascadeCount: fits.length,
        mapResolution: fits.map((fit) => fit.mapSize),
        casterCount: fits[0]?.casterCount ?? 0,
        receiverCount: fits[0]?.receiverCount ?? 0,
        frustumCornerCount: fits[0]?.frustumCornersWorld.length ?? 0,
        texelSize: fits.map((fit) => Number(fit.texelSize.toFixed(6))),
        stableOffset: fits.map((fit) => [Number(fit.stableOffsetLightSpace[0].toFixed(6)), Number(fit.stableOffsetLightSpace[1].toFixed(6))] as const),
        jitterStableDelta: fits.map((fit, index) => {
          const jitter = jitterFits[index]!;
          return [
            Number(Math.abs(jitter.snappedCenterLightSpace[0] - fit.snappedCenterLightSpace[0]).toFixed(6)),
            Number(Math.abs(jitter.snappedCenterLightSpace[1] - fit.snappedCenterLightSpace[1]).toFixed(6))
          ] as const;
        }),
        orthographic: fits.map((fit) => ({
          left: Number(fit.orthographic.left.toFixed(4)),
          right: Number(fit.orthographic.right.toFixed(4)),
          bottom: Number(fit.orthographic.bottom.toFixed(4)),
          top: Number(fit.orthographic.top.toFixed(4)),
          near: Number(fit.orthographic.near.toFixed(4)),
          far: Number(fit.orthographic.far.toFixed(4))
        })),
        pixels: debugPixels
      },
      controls,
      canvasFrame: { width: renderCanvas.width, height: renderCanvas.height }
    };
    status.textContent = JSON.stringify(window.__GALILEO3D_SHADOW_LAB__, null, 2);
    cascades.dispose();
  };
  mapSizeInput.addEventListener("input", render);
  biasInput.addEventListener("input", render);
  darknessInput.addEventListener("input", render);
  pcfRadiusInput.addEventListener("input", render);
  render();
  window.addEventListener("beforeunload", () => renderer.dispose(), { once: true });
}

function movedBounds(x: number): Bounds3 {
  return { min: [x - 0.42, 1.05, -0.42], max: [x + 0.42, 2.0, 0.42] };
}

function renderPointSpotShadowEvidence(caster: RenderItem, controls: ShadowLabControls): {
  readonly point: { readonly mapFaces: number; readonly renderedFaces: number; readonly range: number };
  readonly spot: { readonly rendered: boolean; readonly angle: number; readonly penumbra: number; readonly pcfSamples: number };
  readonly drawCalls: number;
} {
  const pointLight = new PointLight("shadow-lab-point");
  pointLight.castsShadow = true;
  pointLight.range = 7.5;
  const spotLight = new SpotLight("shadow-lab-spot");
  spotLight.castsShadow = true;
  spotLight.range = 8;
  spotLight.angle = Math.PI / 5;
  spotLight.penumbra = 0.35;
  const device = new MockRenderDevice();
  const localCaster: RenderItem = {
    ...caster,
    geometry: Geometry.cube(1),
    material: new UnlitMaterial({ color: [0.85, 0.94, 1, 1] }),
    label: "shadow-lab-point-spot-caster"
  };
  device.beginFrame(controls.mapSize, controls.mapSize);
  const pointResults = Array.from({ length: 6 }, (_, face) => new ShadowPass({
    light: pointLight,
    casters: [localCaster],
    shadowMap: new ShadowMap({ size: controls.mapSize, bias: controls.bias, label: `shadow-lab-point-face-${face}` })
  }).execute({ device, width: controls.mapSize, height: controls.mapSize }));
  const spotMap = new ShadowMap({
    size: controls.mapSize,
    bias: controls.bias,
    filter: "pcf",
    pcfRadius: controls.pcfRadius,
    pcfSamples: 9,
    label: "shadow-lab-spot"
  });
  const spotResult = new ShadowPass({ light: spotLight, casters: [localCaster], shadowMap: spotMap }).execute({ device, width: controls.mapSize, height: controls.mapSize });
  device.endFrame();
  const drawCalls = device.getDiagnostics().drawCalls;
  spotMap.dispose();
  return {
    point: {
      mapFaces: pointResults.length,
      renderedFaces: pointResults.filter((result) => result.rendered).length,
      range: pointLight.range
    },
    spot: {
      rendered: spotResult.rendered,
      angle: Number(spotLight.angle.toFixed(4)),
      penumbra: spotLight.penumbra,
      pcfSamples: spotMap.filterKernel.samples.length
    },
    drawCalls
  };
}

function drawLab(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  initial: readonly (readonly [number, number, number])[],
  moved: readonly (readonly [number, number, number])[],
  controls: ShadowLabControls,
  filterKernel: ShadowFilterKernel,
  fits: readonly ShadowCameraFit[]
): void {
  context.fillStyle = "#dfe8ed";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#aebfa9";
  context.fillRect(0, 350, canvas.width, 190);
  context.strokeStyle = "rgba(37, 61, 76, 0.26)";
  context.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 18) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 126, canvas.height);
    context.stroke();
  }
  context.strokeStyle = "rgba(255, 255, 255, 0.2)";
  for (let x = -canvas.height; x < canvas.width; x += 34) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + canvas.height * 0.7, canvas.height);
    context.stroke();
  }
  context.strokeStyle = "rgba(37, 61, 76, 0.2)";
  for (let y = 16; y < canvas.height; y += 16) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y + Math.sin(y * 0.05) * 18);
    context.stroke();
  }
  context.fillStyle = "rgba(23, 50, 66, 0.18)";
  for (let index = 0; index < 180; index += 1) {
    const x = (index * 73) % canvas.width;
    const y = 28 + ((index * 47) % 470);
    context.fillRect(x, y, 18 + (index % 5) * 7, 3 + (index % 3) * 2);
  }
  context.strokeStyle = "#879782";
  context.lineWidth = 2;
  for (let x = 0; x < canvas.width; x += 80) {
    context.beginPath();
    context.moveTo(x, 350);
    context.lineTo(x + 60, 540);
    context.stroke();
  }

  drawShadowPolygon(context, initial, `rgba(18, 24, 32, ${Math.max(0.2, controls.darkness * 0.55).toFixed(3)})`, 420, 370);
  drawShadowPolygon(context, moved, `rgba(18, 24, 32, ${controls.darkness.toFixed(3)})`, 480, 370);
  context.fillStyle = "#173242";
  context.fillRect(28, 28, 312, 96);
  context.fillStyle = "#dff6ff";
  context.font = "700 18px ui-sans-serif, system-ui, sans-serif";
  context.fillText(`Map ${controls.mapSize}px`, 48, 62);
  context.fillText(`Bias ${controls.bias.toFixed(4)}`, 48, 92);
  context.fillText(`Darkness ${controls.darkness.toFixed(2)}`, 180, 92);
  context.fillStyle = "#8fd4ff";
  context.fillRect(352, 168, 94, 94);
  context.strokeStyle = "#1d3d50";
  context.strokeRect(352, 168, 94, 94);
  context.fillStyle = "#b9e6ff";
  context.fillRect(516, 168, 94, 94);
  context.strokeRect(516, 168, 94, 94);
  drawPcfDebugStrip(context, 650, 72, controls, filterKernel);
  drawPointSpotDebug(context, 650, 194, controls);
  drawCascadeDebugView(context, 38, 150, fits);
}

function drawShadowPolygon(
  context: CanvasRenderingContext2D,
  points: readonly (readonly [number, number, number])[],
  color: string,
  originX: number,
  originY: number
): void {
  context.fillStyle = color;
  context.beginPath();
  points.forEach((point, index) => {
    const x = originX + point[0] * 86;
    const y = originY + point[2] * 42;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fill();
}

function drawCascadeDebugView(context: CanvasRenderingContext2D, x: number, y: number, fits: readonly ShadowDebugFit[]): void {
  context.fillStyle = "#f0f6f9";
  context.fillRect(x, y, 306, 190);
  context.strokeStyle = "#1d3d50";
  context.lineWidth = 2;
  context.strokeRect(x, y, 306, 190);
  context.fillStyle = "#173242";
  context.fillRect(x, y - 34, 306, 28);
  context.fillStyle = "#dff6ff";
  context.font = "700 14px ui-sans-serif, system-ui, sans-serif";
  context.fillText("Stable cascade camera fit", x + 12, y - 14);

  fits.forEach((fit, index) => {
    const inset = index * 28;
    const width = 210 - index * 28;
    const height = 132 - index * 20;
    context.strokeStyle = ["#2563eb", "#7c3aed", "#0f766e"][index] ?? "#2563eb";
    context.lineWidth = 3;
    context.strokeRect(x + 28 + inset, y + 30 + inset * 0.55, width, height);
    context.fillStyle = context.strokeStyle;
    context.fillRect(x + 32 + inset, y + 34 + inset * 0.55, 12, 12);
    context.fillText(`C${fit.cascadeIndex} ${fit.mapSize}px`, x + 50 + inset, y + 45 + inset * 0.55);
  });

  context.strokeStyle = "#f97316";
  context.lineWidth = 3;
  context.strokeRect(x + 226, y + 82, 42, 58);
  context.fillStyle = "rgba(249, 115, 22, 0.34)";
  context.fillRect(x + 226, y + 82, 42, 58);
  context.fillStyle = "#7c2d12";
  context.fillText("caster", x + 216, y + 156);

  context.strokeStyle = "#16a34a";
  context.lineWidth = 3;
  context.strokeRect(x + 196, y + 154, 88, 18);
  context.fillStyle = "rgba(22, 163, 74, 0.38)";
  context.fillRect(x + 196, y + 154, 88, 18);
  context.fillStyle = "#14532d";
  context.fillText("receiver", x + 202, y + 186);

  context.strokeStyle = "#0ea5e9";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + 148, y + 38);
  context.lineTo(x + 284, y + 78);
  context.moveTo(x + 148, y + 38);
  context.lineTo(x + 226, y + 176);
  context.stroke();
  context.fillStyle = "#075985";
  context.fillText("frustum", x + 126, y + 64);
}

function drawPcfDebugStrip(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  controls: ShadowLabControls,
  filterKernel: ShadowFilterKernel
): void {
  const width = 240;
  const height = 64;
  context.fillStyle = "#d9e3ea";
  context.fillRect(x, y, width, height);
  context.fillStyle = `rgba(18, 24, 32, ${controls.darkness.toFixed(3)})`;
  context.fillRect(x + 154, y, width - 154, height);
  const softnessPixels = Math.max(18, Math.round(filterKernel.radius * filterKernel.samples.length * 1.7));
  const start = x + 154 - softnessPixels;
  for (let column = 0; column < softnessPixels; column += 1) {
    const coverage = (column + 1) / softnessPixels;
    const pcfCoverage = filterKernel.samples.reduce((sum, sample) => {
      const shifted = Math.min(1, Math.max(0, coverage + sample.x / Math.max(softnessPixels, 1)));
      return sum + shifted * sample.weight;
    }, 0);
    context.fillStyle = `rgba(18, 24, 32, ${(pcfCoverage * controls.darkness).toFixed(3)})`;
    context.fillRect(start + column, y, 1, height);
  }
  context.strokeStyle = "#1d3d50";
  context.strokeRect(x, y, width, height);
  context.fillStyle = "#173242";
  context.fillRect(x, y - 34, width, 28);
  context.fillStyle = "#dff6ff";
  context.font = "700 14px ui-sans-serif, system-ui, sans-serif";
  context.fillText(`PCF 3x3 radius ${filterKernel.radius.toFixed(1)} texels`, x + 12, y - 14);
}

function drawPointSpotDebug(context: CanvasRenderingContext2D, x: number, y: number, controls: ShadowLabControls): void {
  context.fillStyle = "#d9e3ea";
  context.fillRect(x, y, 240, 74);
  const pointGradient = context.createRadialGradient(x + 58, y + 37, 4, x + 58, y + 37, 42);
  pointGradient.addColorStop(0, `rgba(18, 24, 32, ${controls.darkness.toFixed(3)})`);
  pointGradient.addColorStop(1, "rgba(18, 24, 32, 0.04)");
  context.fillStyle = pointGradient;
  context.beginPath();
  context.arc(x + 58, y + 37, 42, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fbbf24";
  context.beginPath();
  context.arc(x + 58, y + 37, 7, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = `rgba(18, 24, 32, ${(controls.darkness * 0.82).toFixed(3)})`;
  context.beginPath();
  context.moveTo(x + 142, y + 12);
  context.lineTo(x + 214, y + 37);
  context.lineTo(x + 142, y + 62);
  context.closePath();
  context.fill();
  context.fillStyle = "#fde68a";
  context.beginPath();
  context.arc(x + 136, y + 37, 7, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#1d3d50";
  context.lineWidth = 2;
  context.strokeRect(x, y, 240, 74);
  context.fillStyle = "#173242";
  context.fillRect(x, y - 30, 240, 24);
  context.fillStyle = "#dff6ff";
  context.font = "700 13px ui-sans-serif, system-ui, sans-serif";
  context.fillText("Point cube faces + spot cone", x + 12, y - 13);
}

function centroid2d(points: readonly (readonly [number, number, number])[]): readonly [number, number] {
  const sum = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[2]] as [number, number], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

function readPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  return Array.from(context.getImageData(x, y, 1, 1).data);
}

function readControls(
  mapSizeInput: HTMLInputElement,
  biasInput: HTMLInputElement,
  darknessInput: HTMLInputElement,
  pcfRadiusInput: HTMLInputElement
): ShadowLabControls {
  return {
    mapSize: Number(mapSizeInput.value),
    bias: Number(biasInput.value),
    darkness: Number(darknessInput.value),
    pcfRadius: Number(pcfRadiusInput.value)
  };
}

function modelMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1
  ]);
}

function createShell(): {
  readonly renderCanvas: HTMLCanvasElement;
  readonly projectionCanvas: HTMLCanvasElement;
  readonly status: HTMLElement;
  readonly mapSizeInput: HTMLInputElement;
  readonly biasInput: HTMLInputElement;
  readonly darknessInput: HTMLInputElement;
  readonly pcfRadiusInput: HTMLInputElement;
} {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <div class="canvases">
      <canvas data-testid="shadow-lab-render-canvas" width="480" height="540" tabindex="0" aria-label="Shadow lab rendered WebGL viewport"></canvas>
      <canvas data-testid="shadow-lab-canvas" width="960" height="540" aria-label="Shadow lab projection diagnostic canvas"></canvas>
    </div>
    <section>
      <h1>Shadow Lab</h1>
      <div class="controls">
        <label>Map <input data-testid="shadow-map-size" type="range" min="64" max="256" step="64" value="128" /></label>
        <label>Bias <input data-testid="shadow-bias" type="range" min="0" max="0.01" step="0.001" value="0.003" /></label>
        <label>Darkness <input data-testid="shadow-darkness" type="range" min="0.25" max="0.85" step="0.01" value="0.62" /></label>
        <label>PCF radius <input data-testid="shadow-pcf-radius" type="range" min="0.5" max="3" step="0.5" value="1.5" /></label>
      </div>
      <pre data-testid="shadow-lab-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return {
    renderCanvas: shell.querySelector("[data-testid='shadow-lab-render-canvas']")!,
    projectionCanvas: shell.querySelector("[data-testid='shadow-lab-canvas']")!,
    status: shell.querySelector("pre")!,
    mapSizeInput: shell.querySelector("[data-testid='shadow-map-size']")!,
    biasInput: shell.querySelector("[data-testid='shadow-bias']")!,
    darknessInput: shell.querySelector("[data-testid='shadow-darkness']")!,
    pcfRadiusInput: shell.querySelector("[data-testid='shadow-pcf-radius']")!
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #101214; color: #edf3f5; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    .canvases { min-height: 0; display: grid; grid-template-columns: minmax(112px, 0.16fr) minmax(0, 1.84fr); background: #dfe8ed; }
    canvas { width: 100%; height: min(78vh, 700px); display: block; background: #dfe8ed; }
    section { border-top: 1px solid #30383e; background: #171c20; padding: 0.85rem 1rem; display: grid; grid-template-columns: 10rem minmax(18rem, 1fr); gap: 0.85rem; align-items: start; }
    h1, p, pre { margin: 0; }
    h1 { font-size: 1rem; }
    .controls { display: grid; gap: 0.5rem; color: #cad3d8; font-size: 0.875rem; }
    .controls label { display: grid; grid-template-columns: 5rem 1fr; gap: 0.75rem; align-items: center; }
    input { width: 100%; accent-color: #8fd4ff; }
    pre { display: none; }
    @media (max-width: 760px) { .canvases { grid-template-columns: 1fr; } section { grid-template-columns: 1fr; } canvas { height: 34vh; } }
  `;
  document.head.append(style);
}
