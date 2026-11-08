/** Roadster Hours — Aura3D port of the mechanics. Mounts examples/roadster-hours-port/ without duplicating its code. */
import "../../showcase-port-shared/diag";
import { createLoadingProgress } from "../../showcase-port-shared/loading-progress";
import "../../showcase-port-shared/quickbar.css";
import { labAppOptions, labCameraOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";

// A1: drive the shared loading-progress helper from the game's own loading overlay (no visual change; exposes
// `data-progress` on #loading). The game hides #loading when the route is ready.
// A1 (visible): a thin progress bar under the status line, kept in step by the same helper (no copy changes).
const loadingBar = document.createElement("div");
loadingBar.className = "aura3d-loading";
loadingBar.setAttribute("role", "progressbar");
loadingBar.setAttribute("aria-valuemin", "0");
loadingBar.setAttribute("aria-valuemax", "100");
loadingBar.style.cssText = "width:min(220px,60vw);margin:14px auto 0;color:#e8c98a";
const mountBar = (): void => { document.querySelector("#loading > div")?.appendChild(loadingBar); };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountBar); else mountBar();
const loading = createLoadingProgress({
  element: loadingBar,
  onProgress: (fraction) => document.getElementById("loading")?.setAttribute("data-progress", fraction.toFixed(2))
});
loading.set(0.1, "Preparing the road ahead");
const stage = (): void => {
  const overlay = document.getElementById("loading");
  const status = document.getElementById("loading-status");
  if (!overlay) return;
  if (overlay.classList.contains("hidden")) loading.done();
  else if (status?.textContent === "Loading models") loading.set(0.6, "Loading models");
};
const hook = (): void => {
  const overlay = document.getElementById("loading");
  if (!overlay) return;
  const observer = new MutationObserver(stage);
  observer.observe(overlay, { attributes: true, attributeFilter: ["class"] });
  const status = document.getElementById("loading-status");
  if (status) observer.observe(status, { childList: true, characterData: true, subtree: true });
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook); else hook();

// W-8: EXPERIMENTAL lab flags, default OFF. Only a present `?backend=` / `?gamut=` query publishes anything; the game
// merges the fragment into its createAuraApp options.
const lab = readLabFlags();
if (lab.any) {
  const { renderer, output } = labAppOptions(lab);
  (window as unknown as { __A3D_LAB_APP_OPTIONS__?: unknown }).__A3D_LAB_APP_OPTIONS__ = { ...(renderer ? { renderer } : {}), ...(output ? { output } : {}) };
}
// A9: reversed depth by default (real-GPU checked); `?depth=standard` opts out, `?depth=logarithmic` overrides. The fragment
// reaches `camera.perspective({ depth })` in world.ts through this global.
const cameraOptions = labCameraOptions(lab, "reversed");
if (cameraOptions.depth) (window as unknown as { __A3D_LAB_CAMERA_OPTIONS__?: unknown }).__A3D_LAB_CAMERA_OPTIONS__ = cameraOptions;

import "../../../examples/roadster-hours-port/main";
