/**
 * prd05-capture.ts — lane-local scene page for the PRD-05 §16.1 optimized-vs-
 * source equivalence runs (S6). URL:
 *   prd05-capture.html?engine=aura3d|three&scene=prd05-optimized-<slug>&flags=assets&variant=optimized|source
 * Publishes window.__QR_READY__ (ReadyPayload) or __QR_ERROR__.
 *
 * `variant=source` resolves every model object at the optimizer's input corpus
 * file (`prd05Assets[id].source`) — the un-optimized GLB — so the spec compares
 * optimized vs source on identical scene composition within each engine.
 */
import { adapters as auraAdapters } from "/benchmarks/quality-rebuild/aura3d/scenes/prd05/index.js";
import { adapters as threeAdapters } from "/benchmarks/quality-rebuild/three/scenes/prd05/index.js";
import { prd05SceneSpecs } from "/benchmarks/quality-rebuild/scenes/prd05/index.js";

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
  const flags = params.get("flags") ?? "assets";
  const variant = params.get("variant") ?? "optimized";
  const host = document.getElementById("stage");
  if (!host) throw new Error("missing #stage");
  if (!sceneId || (engine !== "aura3d" && engine !== "three")) {
    host.innerHTML = `<p style="color:#ccc;font:14px system-ui;padding:16px">Use ?engine=aura3d|three&scene=${Object.keys(prd05SceneSpecs).join("|")}</p>`;
    return;
  }
  type AdapterLoader = (host: HTMLElement, options?: {
    readonly qrFlags?: readonly string[];
    readonly sourceAssets?: boolean;
  }) => Promise<unknown>;
  const loader = (engine === "aura3d" ? auraAdapters : threeAdapters)[sceneId] as AdapterLoader | undefined;
  if (!loader) throw new Error(`No ${engine} adapter for scene ${sceneId} — expected one of ${Object.keys(engine === "aura3d" ? auraAdapters : threeAdapters).join(",")}`);

  const requestedFlags = flags === "none" ? [] : flags.split(",").filter(Boolean);
  const payload = (await loader(host, {
    qrFlags: requestedFlags,
    sourceAssets: variant === "source"
  })) as Record<string, unknown>;
  payload.qrFlags = requestedFlags;
  payload.assetVariant = variant;
  document.body.dataset.qrReady = "true";
  window.__QR_READY__ = payload;
}

main().catch((error: unknown) => {
  window.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  document.body.dataset.qrError = "true";
});
