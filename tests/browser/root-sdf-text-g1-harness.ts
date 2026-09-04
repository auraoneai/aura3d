import {
  camera,
  createAuraApp,
  lights,
  material,
  primitives,
  scene,
  text3D,
  type AuraSceneBuilder
} from "@aura3d/engine";

interface G1Capture {
  readonly id: string;
  readonly drawCalls: number;
  readonly text: {
    readonly sdfTexts: number;
    readonly textPixelBacked: boolean;
    readonly quadCount: number;
    readonly lastOpacity: number;
    readonly reason: string;
  };
  readonly checksum: number;
  readonly nonDarkPixels: number;
}

interface G1Result {
  readonly status: "ready" | "error" | "waiting";
  readonly captures?: readonly G1Capture[];
  readonly checks?: Record<string, boolean | number | string>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_G1_SDF_TEXT__?: G1Result;
  }
}

window.__AURA3D_G1_SDF_TEXT__ = { status: "waiting" };

const stage = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");
if (!stage || !shoot) {
  window.__AURA3D_G1_SDF_TEXT__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_G1_SDF_TEXT__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

const nearCamera = camera.perspective({ position: [0, 1.4, 3.4], target: [0, 1.2, -1], fov: 46 });
const farCamera = camera.perspective({ position: [0, 1.6, 11], target: [0, 1.2, -1], fov: 46 });

function roomBody(): AuraSceneBuilder {
  return scene()
    .background("#04060b")
    .add(primitives.box({ name: "floor", material: material.pbr({ color: "#141a24" }) }).position(0, -0.6, 0).scale([9, 0.2, 9]))
    .add(lights.ambient({ intensity: 0.5 }));
}

function sdfTextNode(occlusion: "dim" | "hide" | "show", style?: { lodFadeNear: number; lodFadeFar: number }) {
  return text3D("AURA", {
    backend: "sdf",
    size: 0.9,
    material: material.pbr({ color: "#f5f5f5" }),
    sdfOcclusion: occlusion,
    ...(style === undefined ? {} : { sdfStyle: style })
  }).position(0, 1.2, -1);
}

function sceneForVariant(id: string): AuraSceneBuilder {
  if (id === "sdf-near") return roomBody().add(sdfTextNode("dim")).camera(nearCamera);
  if (id === "mesh") {
    return roomBody()
      .add(text3D("AURA", { size: 0.9, material: material.pbr({ color: "#f5f5f5" }) }).position(0, 1.2, -1))
      .camera(nearCamera);
  }
  if (id === "sdf-occluded") {
    return roomBody()
      .add(primitives.box({ name: "occluder", material: material.pbr({ color: "#05070a", roughness: 1, metallic: 0 }) }).position(0, 1.2, 1).scale([3, 3, 0.5]))
      .add(sdfTextNode("dim"))
      .camera(nearCamera);
  }
  if (id === "sdf-hidden") {
    return roomBody()
      .add(primitives.box({ name: "occluder", material: material.pbr({ color: "#05070a", roughness: 1, metallic: 0 }) }).position(0, 1.2, 1).scale([3, 3, 0.5]))
      .add(sdfTextNode("hide"))
      .camera(nearCamera);
  }
  // sdf-far: LOD fade range fully fades the text at this distance.
  return roomBody()
    .add(sdfTextNode("dim", { lodFadeNear: 4, lodFadeFar: 8 }))
    .camera(farCamera);
}

async function runHarness(): Promise<void> {
  const captures: G1Capture[] = [];
  for (const id of ["sdf-near", "mesh", "sdf-occluded", "sdf-hidden", "sdf-far"] as const) {
    captures.push(await capture(id, sceneForVariant(id)));
  }
  const byId = (id: string): G1Capture => captures.find((entry) => entry.id === id)!;
  window.__AURA3D_G1_SDF_TEXT__ = {
    status: "ready",
    captures,
    checks: {
      sdfMeshDiff: Math.abs(byId("sdf-near").checksum - byId("mesh").checksum) +
        Math.abs(byId("sdf-near").nonDarkPixels - byId("mesh").nonDarkPixels),
      occludedDimmer: byId("sdf-near").nonDarkPixels - byId("sdf-occluded").nonDarkPixels,
      hiddenDelta: Math.abs(byId("sdf-hidden").checksum - byId("sdf-near").checksum),
      farDelta: Math.abs(byId("sdf-far").checksum - byId("sdf-near").checksum),
      nearBacked: byId("sdf-near").text.textPixelBacked,
      nearQuads: byId("sdf-near").text.quadCount,
      nearOpacity: byId("sdf-near").text.lastOpacity,
      occludedOpacity: byId("sdf-occluded").text.lastOpacity,
      hiddenBacked: byId("sdf-hidden").text.textPixelBacked,
      farOpacity: byId("sdf-far").text.lastOpacity,
      farBacked: byId("sdf-far").text.textPixelBacked
    }
  };
}

async function capture(id: string, appScene: AuraSceneBuilder): Promise<G1Capture> {
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
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the G1 probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the G1 probe.");
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
    const text = diagnostics.renderer?.text;
    return {
      id,
      drawCalls: diagnostics.drawCalls,
      text: {
        sdfTexts: text?.sdfTexts ?? -1,
        textPixelBacked: text?.textPixelBacked ?? false,
        quadCount: text?.quadCount ?? 0,
        lastOpacity: text?.lastOpacity ?? -1,
        reason: text?.reason ?? "missing"
      },
      checksum,
      nonDarkPixels
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
    throw new Error(`G1 variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}
