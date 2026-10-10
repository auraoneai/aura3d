// PRD-04 §16.2 "light-count-extension-materials" — integrated probe.
//
// Mounts the Khronos ClearCoatTest GLB ringed by 24 point lights. The spec
// compares a fully-lit frame against `lightsOff=<name>` frames: every
// suppressed light must change pixels (its contribution reached the material),
// and `materials.lightsDroppedByMaterial` must report 0 — extension materials
// evaluate all 24 lights, not the uniform-16 cap.
//
// URL params:
//   flags=<csv>      all | all,-materials | materials | none
//   lights=<n>       point-light count around the ring (default 24)
//   lightsOff=<csv>  light names to drop before compile (repeatable probe)
//   asset=<url>      override GLB (default: clear-coat-test.glb)
//   pixels=1         include decoded frame pixels on extra.frame
//   width|height=px  (default 512)
//   settle=<steps>   (default 30)

import {
  camera,
  createAuraApp,
  lights,
  model,
  resolveQrFlags,
  scene,
  unsafeModelUrl,
  type AuraApp
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

window.__QR_STAGE__ = "module-evaluated";

async function main(): Promise<void> {
  const flags = (params.get("flags") ?? "").split(",").filter((flag) => flag.length > 0);
  const lightCount = Math.max(1, Number(params.get("lights") ?? 24));
  const suppressed = new Set((params.get("lightsOff") ?? "").split(",").filter(Boolean));
  const assetUrl =
    params.get("asset") ?? "/fixtures/asset-corpus/clear-coat-test.glb";
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
    camera.perspective({ position: [0, 0.9, 4.6], target: [0, 0.4, 0], fov: 38, near: 0.05, far: 40 })
  );
  const names: string[] = [];
  for (let i = 0; i < lightCount; i += 1) {
    const name = `pt-${i}`;
    if (suppressed.has(name)) continue;
    names.push(name);
    const angle = (i / lightCount) * Math.PI * 2;
    built.add(
      lights.point({
        name,
        position: [Math.cos(angle) * 2.2, 0.6, Math.sin(angle) * 2.2],
        intensity: 1.4,
        color: "#ffffff"
      })
    );
  }
  built.add(
    model(unsafeModelUrl(assetUrl), { name: "probe", scaleMode: "world", castShadow: false, receiveShadow: false }).position(
      0,
      0,
      0
    )
  );

  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  const app: AuraApp = createAuraApp(stage as HTMLElement, {
    scene: built,
    renderer: { qualityProfile: "production" }, // T0-10/T0-13: deprecated CCR-15-1 mode/fallback dropped — no silent safe-basic mask
    pixelRatio: 1,
    resize: false,
    autoStart: false
  });
  await app.ready();
  for (let index = 0; index < settle; index += 1) app.step(1 / 60);

  const materials = (app.diagnostics() as { materials?: { lightsDroppedByMaterial?: number } }).materials;
  const extra: Record<string, unknown> = {
    lightCount: names.length,
    lightsRequested: lightCount,
    lightsSuppressed: [...suppressed],
    lightsDroppedByMaterial: materials?.lightsDroppedByMaterial ?? null
  };
  if (params.get("pixels") === "1") {
    extra.frame = await decodePngDataUrl(app.screenshot().dataUrl);
  }

  window.__QR_READY__ = {
    scene: "prd04-light-count",
    engine: "aura3d",
    flags,
    warnings: [],
    extra
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
