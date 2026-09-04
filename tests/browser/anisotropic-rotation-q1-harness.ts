import {
  camera,
  createAuraApp,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

/**
 * Q1.3 anisotropic-GGX same-scene rotation proof (muse3jsparity-PRD Part Q).
 *
 * Variants share one scene body: a single anisotropic metal sphere, floor,
 * fixed key light and camera. The ONLY difference between `rot0` and `rot90`
 * is `anisotropyRotation` (0 vs PI/2). The `noAniso` / `noAnisoRot` pair is
 * the control: with anisotropy 0 the rotation uniform must be pixel-inert,
 * proving the rot0-vs-rot90 delta comes from the anisotropic lobe and not
 * from an unrelated uniform side effect.
 */

type AnisoVariantId = "rot0" | "rot90" | "noAniso" | "noAnisoRot";

interface AnisoCapture {
  readonly id: AnisoVariantId;
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

declare global {
  interface Window {
    __AURA3D_ANISO_RUNNER__?: {
      renderVariant(id: AnisoVariantId): Promise<AnisoCapture>;
    };
    __AURA3D_ANISO_ERROR__?: string;
  }
}

void run().catch((error: unknown) => {
  window.__AURA3D_ANISO_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  window.__AURA3D_ANISO_RUNNER__ = {
    renderVariant: async (id) => renderVariant(id)
  };
}

function sphereMaterial(id: AnisoVariantId) {
  const base = {
    color: "#b8bcc4",
    metallic: 1,
    roughness: 0.32,
    anisotropy: 0.9
  } as const;
  if (id === "rot0") return material.pbr({ ...base, anisotropyRotation: 0 });
  if (id === "rot90") return material.pbr({ ...base, anisotropyRotation: Math.PI / 2 });
  if (id === "noAnisoRot") {
    return material.pbr({ color: "#b8bcc4", metallic: 1, roughness: 0.32, anisotropy: 0, anisotropyRotation: Math.PI / 2 });
  }
  return material.pbr({ color: "#b8bcc4", metallic: 1, roughness: 0.32, anisotropy: 0 });
}

async function renderVariant(id: AnisoVariantId): Promise<AnisoCapture> {
  const stage = requiredElement("aniso-stage");
  stage.style.width = "640px";
  stage.style.height = "480px";
  stage.style.minHeight = "0px";
  stage.replaceChildren();
  const app = createAuraApp(stage, {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070d")
      .camera(camera.perspective({ position: [0, 1.1, 3.2], target: [0, 0.75, 0], fov: 40 }))
      .add(primitives.plane({
        name: "aniso floor",
        material: material.pbr({ color: "#2a313b", roughness: 0.9, metallic: 0 })
      }).position(0, 0, 0).scale([9, 1, 9]))
      .add(primitives.sphere({
        name: "aniso subject sphere",
        material: sphereMaterial(id)
      }).position(0, 0.75, 0).scale([1.1, 1.1, 1.1]))
      .add(lights.directional({ name: "aniso key", position: [2.4, 3.6, 2.2], intensity: 2.4 }))
  });
  try {
    const started = performance.now();
    while (performance.now() - started < 30_000) {
      if (app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const diagnostics = app.diagnostics();
    if (!(diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0)) {
      throw new Error(`Aniso variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    app.step(1 / 60);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the aniso probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the aniso probe.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return {
      id,
      drawCalls: diagnostics.drawCalls,
      pixels: Array.from(pixels),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    app.dispose();
  }
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Aniso harness is missing #${id}.`);
  return element;
}
