import {
  camera,
  collectDecalBudgetTelemetry,
  createAuraApp,
  decals,
  lights,
  material,
  primitives,
  resolveDecalFadeOpacity,
  scene,
  type AuraSceneNode,
  type AuraVec3,
} from "@aura3d/engine";

interface DecalViewProbe {
  readonly view: string;
  readonly cameraPosition: AuraVec3;
  readonly expected: readonly { readonly name: string; readonly expectedOpacity: number; readonly mounted: boolean }[];
  readonly measured: Record<string, number>;
  readonly nonDarkPixels: number;
  readonly checksum: number;
  readonly drawCalls: number;
}

interface RootDecalsResult {
  readonly status: "ready" | "error" | "waiting";
  readonly telemetry?: ReturnType<typeof collectDecalBudgetTelemetry>;
  readonly probes?: readonly DecalViewProbe[];
  readonly grazingRepeatDelta?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_ROOT_DECALS__?: RootDecalsResult;
  }
}

window.__AURA3D_ROOT_DECALS__ = { status: "waiting" };

const DECAL_DEFS = [
  { name: "root decal crimson impact", color: "#ff2a1a", position: [-0.75, 0.012, 0.1] as AuraVec3, size: 0.62 as const, fade: undefined },
  { name: "root decal viridian spray", color: "#22ff66", position: [0.15, 0.012, -0.35] as AuraVec3, size: 0.55 as const, fade: undefined },
  { name: "root decal amber scorch", color: "#ffbb22", position: [0.8, 0.012, 0.3] as AuraVec3, size: 0.5 as const, fade: { near: 3, far: 6 } as const },
] as const;

const DECAL_NORMAL: AuraVec3 = [0, 1, 0];
const BASE_OPACITY = 0.85;

const VIEWS = [
  { id: "head-on", cameraPosition: [0, 3.4, 1.1] as AuraVec3 },
  { id: "far", cameraPosition: [0, 5.5, 5.5] as AuraVec3 },
  { id: "grazing", cameraPosition: [3.6, 0.32, 0] as AuraVec3 },
  { id: "grazing-repeat", cameraPosition: [3.6, 0.32, 0] as AuraVec3 },
] as const;

const COLOR_TARGETS: Record<string, readonly [number, number, number]> = {
  "root decal crimson impact": [255, 42, 26],
  "root decal viridian spray": [34, 255, 102],
  "root decal amber scorch": [255, 187, 34],
};

/** sRGB of the concrete floor the decals float over. */
const FLOOR_RGB: readonly [number, number, number] = [35, 40, 48];

/**
 * Opacity-aware match target: translucent decals blend toward the floor, and
 * PBR shading darkens the flat color, so matching the raw target would miss
 * every faded decal. The matcher compares against the expected blend.
 */
function blendedTarget(decalName: string, expectedOpacity: number): readonly [number, number, number] {
  const target = COLOR_TARGETS[decalName]!;
  return [
    expectedOpacity * target[0] + (1 - expectedOpacity) * FLOOR_RGB[0],
    expectedOpacity * target[1] + (1 - expectedOpacity) * FLOOR_RGB[1],
    expectedOpacity * target[2] + (1 - expectedOpacity) * FLOOR_RGB[2],
  ];
}

void run().catch((error: unknown) => {
  window.__AURA3D_ROOT_DECALS__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function run(): Promise<void> {
  const mount = document.querySelector<HTMLElement>("#mount");
  if (!mount) throw new Error("Root decals harness requires #mount.");
  const probes: DecalViewProbe[] = [];
  // Telemetry covers the authored decal set (the head-on view mounts every
  // decal; grazing/far views cull fully faded ones through the CPU fade path).
  let authoredNodes: AuraSceneNode[] = [];
  for (const view of VIEWS) {
    const probe = await captureView(mount, view.id, view.cameraPosition);
    probes.push(probe.probe);
    if (view.id === "head-on") authoredNodes = probe.nodes;
  }
  const telemetry = collectDecalBudgetTelemetry(authoredNodes);
  const grazing = probes.find((probe) => probe.view === "grazing")!;
  const repeat = probes.find((probe) => probe.view === "grazing-repeat")!;
  window.__AURA3D_ROOT_DECALS__ = {
    status: "ready",
    telemetry,
    probes,
    grazingRepeatDelta: Math.abs(grazing.checksum - repeat.checksum) +
      Math.abs(grazing.nonDarkPixels - repeat.nonDarkPixels),
  };
}

async function captureView(
  mount: HTMLElement,
  view: string,
  cameraPosition: AuraVec3,
): Promise<{ readonly probe: DecalViewProbe; readonly nodes: AuraSceneNode[] }> {
  const figure = document.createElement("figure");
  figure.style.margin = "4px";
  const caption = document.createElement("figcaption");
  caption.textContent = view;
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  figure.append(caption, canvas);
  mount.append(figure);
  const floorNode = primitives.box({
    name: "root decal concrete floor",
    position: [0, -0.5, 0],
    scale: [8, 1, 8],
    material: material.pbr({ color: "#232830", roughness: 0.9, metallic: 0 }),
  }).toJSON();
  const expected = DECAL_DEFS.map((def) => {
    const expectedOpacity = resolveDecalFadeOpacity({
      normal: DECAL_NORMAL,
      cameraPosition,
      decalPosition: def.position,
      ...(def.fade ? { fade: def.fade } : {}),
      baseOpacity: BASE_OPACITY,
    });
    return { name: def.name, expectedOpacity, mounted: expectedOpacity >= 0.01 };
  });
  // Fully faded decals are culled before mount — the documented root CPU-side
  // fade path (no native depth-fade sampler at root): nothing to blend, no draw.
  const decalNodes = DECAL_DEFS.flatMap((def, index) => {
    if (!expected[index]!.mounted) return [];
    return [
      decals.project({
        name: def.name,
        color: def.color,
        size: def.size,
        position: def.position,
        normal: DECAL_NORMAL,
        opacity: expected[index]!.expectedOpacity,
        ...(def.fade ? { fade: def.fade } : {}),
      }).toJSON(),
    ];
  });
  const nodes: AuraSceneNode[] = [floorNode, ...decalNodes];
  const appScene = scene()
    .background("#05070c")
    .addMany(nodes)
    .add(lights.studio({ intensity: 1.1 }))
    .camera(camera.perspective({ position: cameraPosition, target: [0, 0, 0], fov: 40 }));
  const app = createAuraApp(canvas, { scene: appScene, pixelRatio: 1, resize: false });
  await waitForDraw(app, view);
  const matchTargets: Record<string, readonly [number, number, number]> = Object.fromEntries(
    expected.filter((entry) => entry.mounted).map((entry) => [entry.name, blendedTarget(entry.name, entry.expectedOpacity)]),
  );
  const metrics = await analyzeScreenshot(app.screenshot().dataUrl, matchTargets);
  const drawCalls = app.diagnostics().drawCalls;
  app.dispose();
  // Keep the canvas mounted: the spec screenshots the full 2x2 view grid.
  return {
    probe: {
      view,
      cameraPosition,
      expected,
      measured: metrics.counts,
      nonDarkPixels: metrics.nonDarkPixels,
      checksum: metrics.checksum,
      drawCalls,
    },
    nodes,
  };
  // Canvases stay mounted: the spec screenshots the full 2x2 view grid.
}

async function waitForDraw(app: ReturnType<typeof createAuraApp>, view: string): Promise<void> {
  for (let index = 0; index < 300; index += 1) {
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`${view}: ${diagnostics.errors.join("\n")}`);
    if (diagnostics.drawCalls > 0) return;
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(`${view}: root decal app did not draw before the harness timeout.`);
}

async function analyzeScreenshot(
  dataUrl: string,
  matchTargets: Record<string, readonly [number, number, number]>,
): Promise<{ readonly counts: Record<string, number>; readonly nonDarkPixels: number; readonly checksum: number }> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create analysis canvas.");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const counts: Record<string, number> = Object.fromEntries(Object.keys(COLOR_TARGETS).map((name) => [name, 0]));
  let nonDarkPixels = 0;
  let checksum = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (luma > 24) nonDarkPixels += 1;
    checksum = (checksum + Math.round(luma) * (index + 17)) % 1_000_003;
    for (const [name, target] of Object.entries(matchTargets)) {
      if (Math.abs(r - target[0]) < 90 && Math.abs(g - target[1]) < 90 && Math.abs(b - target[2]) < 90) {
        counts[name] = (counts[name] ?? 0) + 1;
      }
    }
  }
  return { counts, nonDarkPixels, checksum };
}
