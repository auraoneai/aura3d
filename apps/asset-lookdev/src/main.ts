/**
 * apps/asset-lookdev — the §6.7 look-dev stage entry point.
 *
 * Query contract (what capture.mjs drives):
 *   ?glb=<url>&engine=aura|three&cam=px,py,pz,tx,ty,tz&fov=<deg>
 *   &radius=<m>&hdri=<stage-id>&debug=<view>&dpr=<n>
 *
 * Publishes window.__a3dLookDev once the staged frame settles.
 */
import "./buffer-polyfill";
import { loadLookdevStage } from "./stage";
import { parseLookdevRequest } from "./shared";
import { runAuraAdapter, type LookdevRunResult as AuraResult } from "./aura-adapter";
import { runThreeAdapter, type LookdevRunResult as ThreeResult } from "./three-adapter";

declare global {
  interface Window {
    __a3dLookDev?: {
      readonly status: "loading" | "ready" | "error";
      readonly result?: AuraResult | ThreeResult;
      readonly error?: string;
    };
  }
}

void run();

async function run(): Promise<void> {
  const host = document.getElementById("viewport-host");
  if (!(host instanceof HTMLElement)) throw new Error("asset-lookdev requires #viewport-host");
  window.__a3dLookDev = { status: "loading" };
  try {
    const request = parseLookdevRequest(window.location.search);
    const stage = await loadLookdevStage();
    const result = request.engine === "three"
      ? await runThreeAdapter(request, stage, host)
      : await runAuraAdapter(request, stage, host);
    window.__a3dLookDev = { status: "ready", result };
    document.title = `asset-lookdev ${request.engine} ${request.debug ?? "beauty"}`;
  } catch (error) {
    window.__a3dLookDev = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
  }
}
