/**
 * prd04-capture.ts — lane-local scene page (PRD-04 §13 phase-1 baseline
 * captures; "meanwhile" for Q-04-3). URL:
 *   prd04-capture.html?engine=aura3d|three&scene=prd04-<slug>&flags=none
 * Publishes window.__QR_READY__ (ReadyPayload) or __QR_ERROR__.
 * `flags` is recorded on the payload's `qrFlags`; flag plumbing itself is the
 * C-01 provider's — at `none` no A3D_QR_* flag is applied.
 */
import { adapters as auraAdapters } from "/benchmarks/quality-rebuild/aura3d/scenes/prd04/index.js";
import { adapters as threeAdapters } from "/benchmarks/quality-rebuild/three/scenes/prd04/index.js";
import { prd04SceneSpecs } from "/benchmarks/quality-rebuild/scenes/prd04/index.js";

declare global {
  interface Window {
    __QR_READY__?: unknown;
    __QR_ERROR__?: string;
  }
}

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
  type AdapterLoader = (host: HTMLElement, options?: { readonly qrFlags?: readonly string[] }) => Promise<unknown>;
  let loader = (engine === "aura3d" ? auraAdapters : threeAdapters)[sceneId] as AdapterLoader | undefined;
  if (!loader) {
    // Legacy negative-control scenes (e.g. 02-pbr-product, 05-transmission):
    // top-level adapter modules default-export (host) => Promise<ReadyPayload>.
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
  const payload = (await loader(host, { qrFlags: requestedFlags })) as Record<string, unknown>;
  payload.qrFlags = requestedFlags;
  document.body.dataset.qrReady = "true";
  window.__QR_READY__ = payload;
}

main().catch((error: unknown) => {
  window.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  document.body.dataset.qrError = "true";
});
