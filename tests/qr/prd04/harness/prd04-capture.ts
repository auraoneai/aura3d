/**
 * prd04-capture.ts — lane-local scene page (PRD-04 §13 phase-1 baseline
 * captures; "meanwhile" for Q-04-3). URL:
 *   prd04-capture.html?engine=aura3d|three&scene=prd04-<slug>&flags=none
 * Publishes window.__QR_READY__ (ReadyPayload) or __QR_ERROR__.
 * `flags` is recorded on the payload's `qrFlags`; flag plumbing itself is the
 * C-01 provider's — at `none` no A3D_QR_* flag is applied.
 *
 * P7 probe params forwarded to both adapters:
 *   quality=<tier>     C-27 tier (aura3d only; three ignores it)
 *   strip=1            spec.strip camera orbit + per-frame luma captures (S6)
 *   tint=<#hex|none>   tint override/suppression (S3)
 *   lightsOff=<name>   drop a named light (light-count isolation probe)
 *   pixels=1           decoded frame pixels on extra.frame (per-spec opt-in)
 */
import { adapters as auraAdapters } from "/benchmarks/quality-rebuild/aura3d/scenes/prd04/index.js";
import { adapters as threeAdapters } from "/benchmarks/quality-rebuild/three/scenes/prd04/index.js";
import { prd04SceneSpecs } from "/benchmarks/quality-rebuild/scenes/prd04/index.js";

declare global {
  interface Window {
    __QR_READY__?: unknown;
    __QR_ERROR__?: string;
    __QR_STAGE__?: string;
    __QR_BOOT_TIMER__?: number;
  }
}

// 04-BOOT: stage markers — if the page wedges, the spec (and the HTML watchdog)
// report the stage it died at instead of a bare timeout.
window.__QR_STAGE__ = "module-evaluated";

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const engine = params.get("engine");
  const sceneId = params.get("scene") ?? "";
  const flags = params.get("flags") ?? "none";
  const host = document.getElementById("stage");
  if (!host) throw new Error("missing #stage");
  if (!sceneId || (engine !== "aura3d" && engine !== "three")) {
    host.innerHTML = `<p style="color:#ccc;font:14px system-ui;padding:16px">Use ?engine=aura3d|three&scene=${Object.keys(prd04SceneSpecs).join("|")}</p>`;
    return;
  }
  type AdapterLoader = (host: HTMLElement, options?: {
    readonly qrFlags?: readonly string[];
    readonly transmission?: "auto" | "env" | "off";
    readonly quality?: "low" | "medium" | "high" | "ultra";
    readonly strip?: boolean;
    readonly tint?: string;
    readonly lightsOff?: string;
    readonly pixels?: boolean;
  }) => Promise<unknown>;
  window.__QR_STAGE__ = "adapter-resolve";
  let loader = (engine === "aura3d" ? auraAdapters : threeAdapters)[sceneId] as AdapterLoader | undefined;
  if (!loader) {
    // Legacy negative-control scenes (e.g. 02-pbr-product, 05-transmission):
    // top-level adapter modules default-export (host) => Promise<ReadyPayload>.
    window.__QR_STAGE__ = `adapter-import:${engine}/${sceneId}`;
    const mod = (await import(
      /* @vite-ignore */ `/benchmarks/quality-rebuild/${engine}/${sceneId}.ts`
    )) as { default?: (host: HTMLElement) => Promise<unknown> };
    loader = mod.default as (host: HTMLElement) => Promise<unknown>;
  }
  if (!loader) throw new Error(`No ${engine} adapter for scene ${sceneId}`);
  // `flags=none` requests an empty flag set; anything else is forwarded to the
  // adapter (the aura3d lane applies it via `qualityRebuild.flags` and reports
  // the applied list back on `extra.appliedQrFlags`; the three.js oracle ignores
  // it — it is the flag-free reference).
  const requestedFlags = flags === "none" ? [] : flags.split(",").filter(Boolean);
  const transmission = params.get("transmission") as "auto" | "env" | "off" | null;
  const quality = params.get("quality") as "low" | "medium" | "high" | "ultra" | null;
  window.__QR_STAGE__ = `adapter-run:${sceneId}`;
  const payload = (await loader(host, {
    qrFlags: requestedFlags,
    ...(transmission !== null ? { transmission } : {}),
    ...(quality !== null ? { quality } : {}),
    ...(params.get("strip") === "1" ? { strip: true } : {}),
    ...(params.get("tint") !== null ? { tint: params.get("tint")! } : {}),
    ...(params.get("lightsOff") !== null ? { lightsOff: params.get("lightsOff")! } : {}),
    ...(params.get("pixels") === "1" ? { pixels: true } : {})
  })) as Record<string, unknown>;
  window.__QR_STAGE__ = "payload-published";
  payload.qrFlags = requestedFlags;
  document.body.dataset.qrReady = "true";
  window.__QR_READY__ = payload;
}

main()
  .catch((error: unknown) => {
    window.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
    document.body.dataset.qrError = "true";
  })
  .finally(() => {
    // The module's own outcome is known — disarm the HTML boot watchdog.
    window.__QR_STAGE__ = "settled";
    clearTimeout(window.__QR_BOOT_TIMER__);
  });
