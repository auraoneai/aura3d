import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  material,
  primitives,
  scene,
  type AuraSceneBuilder
} from "@aura3d/engine";

interface N1M3Capture {
  readonly id: string;
  readonly drawCalls: number;
  readonly nodeCount: number;
  readonly spotNodes: number;
  readonly environment: {
    readonly preset?: string;
    readonly iblPixelBacked: boolean;
    readonly hdriStatus: string;
    readonly hdriRotation?: number;
  };
  readonly checksum: number;
  readonly nonDarkPixels: number;
  readonly meta: Record<string, string | number | boolean>;
}

interface N1M3Result {
  readonly status: "ready" | "error" | "waiting";
  readonly captures?: readonly N1M3Capture[];
  readonly checks?: Record<string, boolean | number | string>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_N1M3_SPOT_HDRI__?: N1M3Result;
  }
}

window.__AURA3D_N1M3_SPOT_HDRI__ = { status: "waiting" };

const hdriAssets = defineAuraAssets({
  studioSmall: { type: "texture", format: "hdr", url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", hash: "f6a989f89432eb4e" }
});

const stage = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");
if (!stage || !shoot) {
  window.__AURA3D_N1M3_SPOT_HDRI__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_N1M3_SPOT_HDRI__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

const fixedCamera = camera.perspective({ position: [2.2, 1.6, 4.4], target: [0, 0.8, -0.5], fov: 50 });

function roomBody(withSpot: boolean): AuraSceneBuilder {
  const body = scene()
    .background("#04060b")
    .add(primitives.box({ name: "floor", material: material.pbr({ color: "#141a24" }) }).position(0, -0.6, 0).scale([9, 0.2, 9]))
    .add(primitives.box({ name: "hero-box", material: material.pbr({ color: "#3d5a80", metalness: 0.6, roughness: 0.35 }) }).position(-0.6, 0.5, -0.6).scale([1, 2, 1]))
    .add(primitives.sphere({ name: "orb", material: material.pbr({ color: "#98c1d9", metalness: 0.9, roughness: 0.15 }) }).position(1.1, 0.4, -0.9).scale(0.8))
    .add(lights.ambient({ intensity: 0.35 }));
  return withSpot
    ? body.add(lights.spot({ position: [0.4, 3.2, 1.6], target: [-0.2, 0.6, -0.7], angle: 0.5, penumbra: 0.35, distance: 14, intensity: 30, color: "#fff1d6" }))
    : body.add(lights.directional({ intensity: 0.6 }));
}

function sceneForVariant(id: string): AuraSceneBuilder {
  if (id === "spot-off") return roomBody(false).camera(fixedCamera);
  if (id === "spot-on") return roomBody(true).camera(fixedCamera);
  if (id === "hdri-rot0") return roomBody(true).add(environments.hdri({ texture: hdriAssets.studioSmall, rotation: 0 })).camera(fixedCamera);
  return roomBody(true).add(environments.hdri({ texture: hdriAssets.studioSmall, rotation: 0.35 })).camera(fixedCamera);
}

async function runHarness(): Promise<void> {
  const captures: N1M3Capture[] = [];
  for (const id of ["spot-off", "spot-on", "hdri-rot0", "hdri-rot035"] as const) {
    captures.push(await capture(id, sceneForVariant(id)));
  }
  const byId = (id: string): N1M3Capture => captures.find((entry) => entry.id === id)!;
  window.__AURA3D_N1M3_SPOT_HDRI__ = {
    status: "ready",
    captures,
    checks: {
      spotDiff: Math.abs(byId("spot-on").checksum - byId("spot-off").checksum) +
        Math.abs(byId("spot-on").nonDarkPixels - byId("spot-off").nonDarkPixels),
      rotationDiff: Math.abs(byId("hdri-rot035").checksum - byId("hdri-rot0").checksum) +
        Math.abs(byId("hdri-rot035").nonDarkPixels - byId("hdri-rot0").nonDarkPixels),
      spotNodesOff: byId("spot-off").spotNodes,
      spotNodesOn: byId("spot-on").spotNodes,
      hdriBacked0: byId("hdri-rot0").environment.iblPixelBacked,
      hdriBacked35: byId("hdri-rot035").environment.iblPixelBacked,
      hdriRotation0: byId("hdri-rot0").environment.hdriRotation ?? -1,
      hdriRotation35: byId("hdri-rot035").environment.hdriRotation ?? -1
    }
  };
}

async function capture(id: string, appScene: AuraSceneBuilder): Promise<N1M3Capture> {
  stage!.style.minHeight = "0px";
  stage!.replaceChildren();
  const app = createAuraApp(stage!, {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: appScene
  });
  try {
    await waitForAppDraw(app);
    if (id === "hdri-rot0" || id === "hdri-rot035") await waitForIblPixelBacked(app);
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the N1M3 probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the N1M3 probe.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let checksum = 0;
    let nonDarkPixels = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (luma > 24) nonDarkPixels += 1;
      checksum = (checksum + Math.round(luma) * (index + 17)) % 1_000_003;
    }
    const diagnostics = app.diagnostics();
    const environment = diagnostics.renderer?.environment;
    return {
      id,
      drawCalls: diagnostics.drawCalls,
      nodeCount: app.scene.nodes.length,
      spotNodes: app.scene.nodes.filter((node) => node.kind === "light" && node.light === "spot").length,
      environment: {
        preset: environment?.preset,
        iblPixelBacked: environment?.iblPixelBacked ?? false,
        hdriStatus: environment?.hdriStatus ?? "unknown",
        ...(environment?.hdriRotation === undefined ? {} : { hdriRotation: environment.hdriRotation })
      },
      checksum,
      nonDarkPixels,
      meta: { kind: id.startsWith("spot") ? "n1-spot" : "m3-hdri-rotation" }
    };
  } finally {
    app.dispose();
  }
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if (app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = app.diagnostics();
  if (!(diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0)) {
    throw new Error(`N1M3 variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForIblPixelBacked(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 240_000) {
    if (app.diagnostics().renderer?.environment?.iblPixelBacked) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!app.diagnostics().renderer?.environment?.iblPixelBacked) {
    throw new Error(`N1M3 HDRI upgrade never landed: ${JSON.stringify(app.diagnostics().renderer?.environment)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}
