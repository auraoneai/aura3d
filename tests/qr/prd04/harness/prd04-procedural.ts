// PRD-04 §16.1 S7 — procedural-material-detail driver.
//
// Mounts a single 1 m sphere lit by a three-light rig with the requested
// `material.*` procedural preset. The spec compares `extra.frame` pixel
// detail (masked Laplacian variance) flag-on vs flag-off; flag-off the
// procedural texture specs are dropped at compile time so the sphere
// renders flat — that contrast IS the §15.4 negative control.
//
// URL params:
//   flags=<csv>            (e.g. `materials` or `none`)
//   preset=fabric|brushedMetal|blackRubber|frostedGlass
//   width|height=px        (default 512)
//   settle=<steps>         (default 30)

import {
  camera,
  createAuraApp,
  lights,
  material,
  primitives,
  resolveQrFlags,
  scene,
  type AuraMaterialSpec
} from "@aura3d/engine";
import { setTypedGLBActorQrFlags, setTypedGLBActorQrTransmissionMode } from "@aura3d/engine/lanes";
import { setRendererQrFlags } from "@aura3d/rendering";
import { decodePngDataUrl } from "/benchmarks/quality-rebuild/scenes/prd04/metrics.js";
import { expandPrd04FlagList } from "/benchmarks/quality-rebuild/scenes/prd04/flags.js";

declare global {
  interface Window {
    __QR_READY__?: unknown;
    __QR_ERROR__?: string;
    __QR_STAGE__?: string;
    __QR_BOOT_TIMER__?: number;
  }
}

const params = new URLSearchParams(globalThis.location.search);
const stage = document.getElementById("stage") ?? document.body;

const PRESETS: Record<string, () => AuraMaterialSpec> = {
  fabric: () => material.fabric({ color: "#8b6d4c" }),
  brushedMetal: () => material.brushedMetal({ color: "#c8ccd2" }),
  blackRubber: () => material.blackRubber(),
  frostedGlass: () => material.frostedGlass()
};

window.__QR_STAGE__ = "module-evaluated";

async function main(): Promise<void> {
  const flags = (params.get("flags") ?? "").split(",").filter((flag) => flag.length > 0);
  const presetName = params.get("preset") ?? "fabric";
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`unknown preset ${presetName}`);
  const width = Number(params.get("width") ?? 512);
  const height = Number(params.get("height") ?? 512);
  const settle = Number(params.get("settle") ?? 30);

  const qrFlags = resolveQrFlags({ options: expandPrd04FlagList(flags) });
  setTypedGLBActorQrFlags(qrFlags);
  setRendererQrFlags(qrFlags);
  setTypedGLBActorQrTransmissionMode("auto");

  const built = scene();
  built.background("#15171b");
  built.camera(
    camera.perspective({ position: [0, 0.45, 1.9], target: [0, 0, 0], fov: 32, near: 0.05, far: 20 })
  );
  built.add(lights.ambient({ name: "fill", intensity: 0.22, color: "#ffffff" }));
  built.add(
    lights.directional({ name: "key", position: [3, 4, 2.5], intensity: 2.4, color: "#fff4e2" }).lookAt(0, 0, 0)
  );
  built.add(
    lights.directional({ name: "rim", position: [-3, 2, -2], intensity: 0.9, color: "#bcd4ff" }).lookAt(0, 0, 0)
  );
  built.add(
    primitives.sphere({
      name: "probe",
      material: preset(),
      size: [1, 1, 1],
      castShadow: false,
      receiveShadow: false
    }).position(0, 0, 0)
  );

  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  const app = createAuraApp(stage as HTMLElement, {
    scene: built,
    renderer: { qualityProfile: "production" }, // T0-10/T0-13: deprecated CCR-15-1 mode/fallback dropped — no silent safe-basic mask
    pixelRatio: 1,
    resize: false,
    autoStart: false
  });

  await app.ready();
  for (let index = 0; index < settle; index += 1) app.step(1 / 60);
  const frame = await decodePngDataUrl(app.screenshot().dataUrl);

  window.__QR_READY__ = {
    scene: `prd04-procedural:${presetName}`,
    engine: "aura3d",
    flags,
    warnings: [],
    extra: {
      procedural: { preset: presetName, qrFlagsApplied: flags.length > 0 },
      frame
    }
  };
}

main()
  .catch((error) => {
  window.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}
${error.stack ?? ""}` : String(error);
  })
  .finally(() => {
    window.__QR_STAGE__ = "settled";
    clearTimeout(window.__QR_BOOT_TIMER__);
  });
