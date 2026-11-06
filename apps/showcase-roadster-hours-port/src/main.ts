/** Roadster Hours — Aura3D port of the mechanics. Mounts examples/roadster-hours-port/ without duplicating its code. */
import "../../showcase-port-shared/diag";
import { createLoadingProgress } from "../../showcase-port-shared/loading-progress";
import { labAppOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";

// A1: drive the shared loading-progress helper from the game's own loading overlay (no visual change; exposes
// `data-progress` on #loading). The game hides #loading when the route is ready.
const loading = createLoadingProgress({
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

import "../../../examples/roadster-hours-port/main";
