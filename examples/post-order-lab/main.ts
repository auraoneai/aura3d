import {
  camera,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  effects,
  lights,
  material,
  primitives,
  scene,
  type AuraApp
} from "@aura3d/engine";

/**
 * threejs-parity R-03b (lane L1): proves the §6.1 slot order on the WebGL2
 * path. The scene is dark with bloom enabled, so bloom only has energy to
 * spread where a custom pass writes it. One HDR "band" pass (very bright
 * magenta over the left edge) is registered at a chosen slot:
 *
 * - `before-bloom`: bloom extracts the band and spills a halo past its edge.
 * - `after-bloom` / `before-tonemap`: the band is written after the bloom
 *   composite, so its edge stays crisp and the neighbourhood stays dark.
 */

export type PostOrderSlot = "none" | "before-bloom" | "after-bloom" | "before-tonemap";

interface LabEvidence {
  readonly id: "post-order-lab";
  status: "loading" | "ready" | "error";
  frame: number;
  slot: PostOrderSlot;
  passNames: readonly string[];
  /** Band right edge as a fraction of the canvas width (matches the pass's `u_edge`). */
  readonly bandEdge: number;
  readonly errors: readonly string[];
  routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
  error?: string;
}

declare global {
  interface Window {
    __AURA_POST_ORDER_LAB__?: LabEvidence;
    /** Swaps the band pass to `slot` (or removes it for "none") and renders one frame. */
    __AURA_POST_ORDER_LAB_SET_SLOT__?: (slot: PostOrderSlot) => Promise<void>;
    /** Engine-readback PNG data URL of the current frame. */
    __AURA_POST_ORDER_LAB_SHOT__?: () => Promise<string>;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (!canvas) throw new Error("post-order-lab canvas is missing");

const BAND_EDGE = 0.12;
const errors: string[] = [];
const evidence: LabEvidence = {
  id: "post-order-lab",
  status: "loading",
  frame: 0,
  slot: "none",
  passNames: [],
  bandEdge: BAND_EDGE,
  errors
};

let app: AuraApp | undefined;
let releaseBand: (() => void) | undefined;

const publish = () => {
  window.__AURA_POST_ORDER_LAB__ = evidence;
  const el = document.querySelector("#evidence");
  if (el) el.textContent = evidence.status === "ready" ? `frame ${evidence.frame} · slot ${evidence.slot}` : evidence.status;
};

const buildScene = () =>
  scene()
    .background("#05060d")
    .camera(camera.perspective({ position: [0, 1.4, 6], target: [0, 0.5, 0], fov: 46 }))
    .add(lights.directional({ name: "dim key", position: [3, 6, 4], intensity: 0.25 }))
    .add(primitives.box({ name: "dim-box", material: material.pbr({ color: "#202636", roughness: 0.9 }) })
      .position(1.6, 0.5, 0))
    .add(effects.bloom({ name: "order-lab bloom", intensity: 1.2, threshold: 0.9, radius: 0.6 }));

const BAND_GLSL = `uniform float u_edge;
void main() {
  vec4 c = texture(u_color, v_uv);
  outColor = v_uv.x < u_edge ? vec4(8.0, 0.0, 8.0, 1.0) : c;
}`;

const renderFrame = (): void => {
  if (!app) return;
  app.step(1 / 60);
  evidence.frame += 1;
  publish();
};

const setSlot = async (slot: PostOrderSlot): Promise<void> => {
  if (!app) return;
  releaseBand?.();
  releaseBand = undefined;
  evidence.passNames = [];
  if (slot !== "none") {
    const release = app.post?.addPostPass?.(effects.shaderPass({
      name: "order-band",
      order: slot,
      glsl: BAND_GLSL,
      uniforms: { u_edge: BAND_EDGE }
    }));
    if (typeof release === "function") releaseBand = release as () => void;
    evidence.passNames = ["order-band"];
  }
  evidence.slot = slot;
  // Two frames: the first rebuilds the post graph for the new pass set, the
  // second is the steady-state frame the spec reads back.
  renderFrame();
  renderFrame();
};

const boot = async (): Promise<void> => {
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: buildScene()
  });
  await app.ready();
  window.__AURA_POST_ORDER_LAB_SET_SLOT__ = setSlot;
  window.__AURA_POST_ORDER_LAB_SHOT__ = async () => {
    const blob = (await app?.capture?.({ type: "png-blob" })) as Blob | undefined;
    if (!blob) return "";
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  };
  evidence.status = "ready";
  evidence.routeHealth = createAuraRouteHealthSnapshot(app, { parityIds: ["SH-03"] });
  renderFrame();
};

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  errors.push(message);
  evidence.status = "error";
  evidence.error = message;
  publish();
});
