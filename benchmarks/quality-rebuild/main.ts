/**
 * Page router: `index.html?engine=aura3d|three&scene=<scene-id>[&dpr=1|2][&variant=<id>][&pass=mask][&a3d-qr=<flags>]`.
 *
 * Scene routing reads the C-30 registry (`shared/registry.ts`), not the glob
 * file names: base scenes resolve to `./{engine}/{id}.ts`; lane scenes
 * (`<owner>-<slug>`) resolve to `./{engine}/scenes/{owner}/{slug}.ts`.
 * Quarantined entries are never routed.
 *
 * Publishes `window.__QR_READY__` (ReadyPayloadV2) once the engine has loaded
 * every asset, sampled the fixed time and rendered its settle frames, or
 * `window.__QR_ERROR__` if the run threw. With `pass=mask` on the three side
 * the registry-requested masks render in the same page load after READY and
 * land on `window.__QR_MASKS__` (PRD-12 §6.3).
 */
import { ACTIVE_SCENE_IDS, getActiveSceneSpec, laneAdapterModulePath } from "./shared/registry";
import { getSceneSpec } from "./shared/scenes";
import type { ReadyPayload } from "./shared/types";

declare global {
  interface Window {
    __QR_READY__?: ReadyPayload;
    // Lane-main pages may write richer objects; declared unknown like prd02's.
    __QR_ERROR__?: unknown;
    __QR_SCENES__?: readonly string[];
    __QR_MASKS__?: Readonly<Record<string, { dataUrl: string; width: number; height: number; bytes: number }>>;
    __QR_MASK_INDEX__?: readonly string[];
    __QR_SPEC__?: { id: string; masks: readonly string[]; brokenControls: readonly string[]; dprs?: readonly number[] };
  }
}

type SceneModule = { default: (host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }) => Promise<ReadyPayload> };

const auraModules = import.meta.glob<SceneModule>(["./aura3d/*.ts", "./aura3d/scenes/*/*.ts", "!./aura3d/common.ts"]);
const threeModules = import.meta.glob<SceneModule>(["./three/*.ts", "./three/scenes/*/*.ts", "!./three/common.ts", "!./three/lib/*.ts"]);

window.__QR_SCENES__ = ACTIVE_SCENE_IDS;

async function renderMaskPasses(sceneId: string): Promise<void> {
  const spec = ownerPrefixed(sceneId) ? getActiveSceneSpec(sceneId) : getSceneSpec(sceneId, true);
  const graph = window.__QR_THREE_GRAPH__;
  const kinds = spec?.masks ?? [];
  if (!spec || !graph || kinds.length === 0) return;
  const { renderMasks } = await import("./three/lib/mask");
  window.__QR_MASKS__ = await renderMasks(graph, spec, kinds);
}

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const engine = params.get("engine");
  const sceneId = params.get("scene");
  const variant = params.get("variant") ?? "default";
  const pass = params.get("pass") ?? "frame";
  const dprParam = Number(params.get("dpr") ?? "1");
  const dpr = dprParam === 2 ? 2 : 1;
  const qrFlags = (params.get("a3d-qr") ?? "").split(",").map((flag) => flag.trim()).filter(Boolean);
  const host = document.getElementById("stage");
  if (!host) throw new Error("index.html is missing #stage");
  if (!sceneId || (engine !== "aura3d" && engine !== "three")) {
    host.innerHTML = `<p style="color:#ccc;font:14px system-ui;padding:16px">Use ?engine=aura3d|three&amp;scene=${ACTIVE_SCENE_IDS.join("|")}</p>`;
    return;
  }
  let spec = getSceneSpec(sceneId, true);
  if (!spec || ownerPrefixed(sceneId)) {
    // Lane scenes route only when the registry has them active.
    const active = getActiveSceneSpec(sceneId);
    if (!active) throw new Error(`Scene ${sceneId} is not active in the registry (quarantined or unknown)`);
    spec = active;
  }
  host.style.width = `${spec.resolution.width}px`;
  host.style.height = `${spec.resolution.height}px`;

  const modules = engine === "aura3d" ? auraModules : threeModules;
  const path = ownerPrefixed(sceneId) ? laneAdapterModulePath(engine, sceneId) : `./${engine}/${sceneId}.ts`;
  const loader = path ? modules[path] : undefined;
  if (!loader) throw new Error(`No ${engine} implementation for scene ${sceneId} (${path})`);
  const module = await loader();
  const payload = await module.default(host, { variant: variant as ReadyPayload["variant"], dpr, qrFlags });
  window.__QR_SPEC__ = { id: spec.id, masks: spec.masks ?? [], brokenControls: spec.brokenControls ?? [], dprs: spec.dprs };
  if (pass === "mask" && engine === "three") await renderMaskPasses(sceneId);
  document.body.dataset.qrReady = "true";
  window.__QR_READY__ = payload;
}

function ownerPrefixed(id: string): boolean {
  return /^prd\d{2}-/.test(id);
}

main().catch((error: unknown) => {
  window.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  document.body.dataset.qrError = "true";
});
