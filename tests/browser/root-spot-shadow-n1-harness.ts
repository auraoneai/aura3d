import {
  camera,
  createAuraApp,
  lights,
  material,
  primitives,
  scene,
  type AuraSceneBuilder
} from "@aura3d/engine";

interface N1Capture {
  readonly id: string;
  readonly drawCalls: number;
  readonly spot: {
    readonly requested: boolean;
    readonly casterIsSpot: boolean;
    readonly casterName?: string;
    readonly atlasResolution?: number;
    readonly spotPixelBacked: boolean;
    readonly reason: string;
  };
  readonly shadowRequested: boolean;
  readonly shadowMapRendered: boolean;
  readonly shadowMapSampled: boolean;
  readonly checksum: number;
  readonly nonDarkPixels: number;
}

interface N1Result {
  readonly status: "ready" | "error" | "waiting";
  readonly captures?: readonly N1Capture[];
  readonly checks?: Record<string, boolean | number | string>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_N1_SPOT_SHADOW__?: N1Result;
  }
}

window.__AURA3D_N1_SPOT_SHADOW__ = { status: "waiting" };

const stage = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");
if (!stage || !shoot) {
  window.__AURA3D_N1_SPOT_SHADOW__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_N1_SPOT_SHADOW__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

/**
 * N1 adoption scenes (muse3jsparity-PRD N1: night scene + arena). The
 * showcase mains stay untouched per lane rules, so the two adoption rigs
 * live here as root-built scenes: a night-street lamp rig and an arena
 * stage-spot rig. In each scene the ONLY difference between variants is the
 * spot's `shadow: true` request flag — direct lighting is identical, so any
 * pixel delta is the shadow-caster path.
 */
function nightStreetScene(spotShadow: boolean): AuraSceneBuilder {
  return scene()
    .background("#04060b")
    .camera(camera.perspective({ position: [3.4, 2.4, 5.2], target: [0, 0.8, -0.6], fov: 50 }))
    .add(primitives.box({ name: "street", material: material.pbr({ color: "#151a24", roughness: 0.9 }) }).position(0, -0.6, 0).scale([10, 0.2, 10]))
    .add(primitives.box({ name: "lamp-pole", material: material.pbr({ color: "#232a36" }) }).position(-1.4, 1.2, -0.8).scale([0.18, 3.6, 0.18]))
    .add(primitives.box({ name: "parked-cart", material: material.pbr({ color: "#3d5a80", roughness: 0.5 }) }).position(0.2, 0.1, -0.8).scale([1.1, 1.4, 0.9]))
    .add(lights.ambient({ intensity: 0.22 }))
    .add(lights.directional({ name: "moon", position: [3, 5, 2], intensity: 0.7, color: "#9db8dd" }))
    .add(lights.spot({
      name: "streetlamp",
      position: [-1.4, 3.1, -0.8],
      target: [0.2, 0, -0.8],
      angle: 0.55,
      penumbra: 0.4,
      distance: 12,
      intensity: 26,
      color: "#ffd9a0",
      ...(spotShadow ? { shadow: true as const } : {})
    }));
}

function arenaScene(spotShadow: boolean): AuraSceneBuilder {
  return scene()
    .background("#060409")
    .camera(camera.perspective({ position: [3.8, 2.6, 5.4], target: [0, 0.9, -0.4], fov: 50 }))
    .add(primitives.box({ name: "arena-floor", material: material.pbr({ color: "#191420", roughness: 0.85 }) }).position(0, -0.6, 0).scale([10, 0.2, 10]))
    .add(primitives.box({ name: "pedestal", material: material.pbr({ color: "#4a3f66", roughness: 0.45, metallic: 0.3 }) }).position(0, 0.2, -0.6).scale([1.2, 1.6, 1.2]))
    .add(primitives.box({ name: "trophy", material: material.pbr({ color: "#c9a227", roughness: 0.3, metallic: 0.8 }) }).position(0, 1.35, -0.6).scale([0.4, 0.5, 0.4]))
    .add(lights.ambient({ intensity: 0.2 }))
    .add(lights.directional({ name: "house-wash", position: [-3, 4, 3], intensity: 0.55, color: "#b8a8dd" }))
    .add(lights.spot({
      name: "stage-spot",
      position: [0.6, 4.2, 2.2],
      target: [0, 0.8, -0.6],
      angle: 0.42,
      penumbra: 0.35,
      distance: 14,
      intensity: 34,
      color: "#fff1d6",
      ...(spotShadow ? { shadow: true as const } : {})
    }));
}

function sceneForVariant(id: string): AuraSceneBuilder {
  if (id === "street-unrequested") return nightStreetScene(false);
  if (id === "street-requested") return nightStreetScene(true);
  if (id === "arena-unrequested") return arenaScene(false);
  return arenaScene(true);
}

async function runHarness(): Promise<void> {
  const captures: N1Capture[] = [];
  for (const id of ["street-unrequested", "street-requested", "arena-unrequested", "arena-requested"] as const) {
    captures.push(await capture(id, sceneForVariant(id)));
  }
  const byId = (id: string): N1Capture => captures.find((entry) => entry.id === id)!;
  window.__AURA3D_N1_SPOT_SHADOW__ = {
    status: "ready",
    captures,
    checks: {
      streetDiff: Math.abs(byId("street-requested").checksum - byId("street-unrequested").checksum) +
        Math.abs(byId("street-requested").nonDarkPixels - byId("street-unrequested").nonDarkPixels),
      arenaDiff: Math.abs(byId("arena-requested").checksum - byId("arena-unrequested").checksum) +
        Math.abs(byId("arena-requested").nonDarkPixels - byId("arena-unrequested").nonDarkPixels),
      streetRequested: byId("street-requested").spot.requested,
      streetCasterIsSpot: byId("street-requested").spot.casterIsSpot,
      streetCasterName: byId("street-requested").spot.casterName ?? "missing",
      streetAtlas: byId("street-requested").spot.atlasResolution ?? 0,
      streetBacked: byId("street-requested").spot.spotPixelBacked,
      streetUnrequestedCaster: byId("street-unrequested").spot.casterIsSpot,
      arenaRequested: byId("arena-requested").spot.requested,
      arenaCasterIsSpot: byId("arena-requested").spot.casterIsSpot,
      arenaBacked: byId("arena-requested").spot.spotPixelBacked,
      arenaUnrequestedCaster: byId("arena-unrequested").spot.casterIsSpot
    }
  };
}

async function capture(id: string, appScene: AuraSceneBuilder): Promise<N1Capture> {
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
    if (!canvas) throw new Error("Aura app did not expose a canvas for the N1 probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the N1 probe.");
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
    const shadows = diagnostics.renderer?.shadows;
    return {
      id,
      drawCalls: diagnostics.drawCalls,
      spot: {
        requested: shadows?.spot?.requested ?? false,
        casterIsSpot: shadows?.spot?.casterIsSpot ?? false,
        ...(shadows?.spot?.casterName === undefined ? {} : { casterName: shadows.spot.casterName }),
        ...(shadows?.spot?.atlasResolution === undefined ? {} : { atlasResolution: shadows.spot.atlasResolution }),
        spotPixelBacked: shadows?.spot?.spotPixelBacked ?? false,
        reason: shadows?.spot?.reason ?? "missing"
      },
      shadowRequested: shadows?.requested ?? false,
      shadowMapRendered: shadows?.mapRendered ?? false,
      shadowMapSampled: shadows?.mapSampled ?? false,
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
    throw new Error(`N1 variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}
