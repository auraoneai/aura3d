/**
 * Page router: `index.html?engine=aura3d|three&scene=<scene-id>`.
 *
 * Publishes `window.__QR_READY__` (ReadyPayload) once the engine has loaded
 * every asset, sampled the fixed time and rendered its settle frames, or
 * `window.__QR_ERROR__` if the run threw.
 */
import { getSceneSpec, sceneIds } from "./shared/scenes";
import type { ReadyPayload } from "./shared/types";

declare global {
  interface Window {
    __QR_READY__?: ReadyPayload;
    __QR_ERROR__?: string;
    __QR_SCENES__?: readonly string[];
  }
}

type SceneModule = { default: (host: HTMLElement) => Promise<ReadyPayload> };

const auraModules = import.meta.glob<SceneModule>(["./aura3d/*.ts", "!./aura3d/common.ts"]);
const threeModules = import.meta.glob<SceneModule>(["./three/*.ts", "!./three/common.ts"]);

window.__QR_SCENES__ = sceneIds;

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const engine = params.get("engine");
  const sceneId = params.get("scene");
  const host = document.getElementById("stage");
  if (!host) throw new Error("index.html is missing #stage");
  if (!sceneId || (engine !== "aura3d" && engine !== "three")) {
    host.innerHTML = `<p style="color:#ccc;font:14px system-ui;padding:16px">Use ?engine=aura3d|three&amp;scene=${sceneIds.join("|")}</p>`;
    return;
  }
  const spec = getSceneSpec(sceneId);
  host.style.width = `${spec.resolution.width}px`;
  host.style.height = `${spec.resolution.height}px`;
  const modules = engine === "aura3d" ? auraModules : threeModules;
  const loader = modules[`./${engine}/${sceneId}.ts`];
  if (!loader) throw new Error(`No ${engine} implementation for scene ${sceneId}`);
  const module = await loader();
  const payload = await module.default(host);
  document.body.dataset.qrReady = "true";
  window.__QR_READY__ = payload;
}

main().catch((error: unknown) => {
  window.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  document.body.dataset.qrError = "true";
});
