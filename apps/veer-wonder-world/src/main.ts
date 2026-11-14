// Wonder World entry (PRD 04 A05; PRD 03 section 2): a thin bootstrap with no
// story logic. It installs the safety net, reads the page switches and the
// parent settings saved on this device, creates the app (src/app.ts, whose
// stage mounts the real `createGame` from `@aura3d/engine/game`) and publishes
// the QA hooks.
//
// Safety net (`installSafetyNet` from `@aura3d/debug`): `selfHeal: false`. A
// black-frame self-heal reloads the page one quality rung down; for a toddler
// that restarts the story mid-sentence and can repeat its opening without a
// grown-up asking, so this app never reloads by itself (the black-frame guard,
// which exists only to reload, is not installed either). Blank or black frames
// are caught instead by the remote first-frame and route-health specs (J08) and
// can be reported from a device with `?diag=1`, which shows the diagnostics
// panel (renderer string, draw calls, shader and context-loss errors).
//
// Page switches: `?story=<id>` `?mode=watch-sing|play-together` `?autostart=1`
// `?manual=1` `?backend=auto|webgpu|webgl2` `?reducedMotion=1` `?audio=0` `?seed=N` `?diag=1`.
// None of them can turn on a microphone (src/runtime/feature-flags.ts).
//
// Nothing is logged to the console. A boot failure is recorded on
// `document.body.dataset.aura3dError` (read by `aura3d check-deploy --browser`)
// and in the QA error global, as an engine message only.

import { installSafetyNet } from "@aura3d/debug";
import { readQaParams } from "@aura3d/engine";
import { createApp, type WonderApp } from "./app.js";
import { WELCOME_NAME } from "./personal.js";
import { installWonderQaHooks } from "./qa/install-hooks.js";
import { readFlags } from "./runtime/feature-flags.js";
import type { PlayMode } from "./types.js";
import { REDUCED_MOTION_CLASS, prefersMoreContrast, prefersReducedMotion } from "./ui/accessibility.js";
import { loadSettings, safeLocalStorage } from "./ui/settings-store.js";

const QA_PARAMS = {
  story: { type: "string" },
  show: { type: "string" },
  mode: { type: "string" },
  autostart: { type: "flag" },
  manual: { type: "flag" },
  seed: { type: "int", default: 1 }
} as const;

const PLAY_MODES: readonly PlayMode[] = ["play-together", "watch-sing", "auto"];

function playModeOf(value: string | undefined): PlayMode | undefined {
  return PLAY_MODES.find((mode) => mode === value);
}

function bootErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 200);
}

function markBootError(error: unknown): void {
  document.body.dataset["aura3dError"] = bootErrorText(error);
}

/**
 * index.html shows a static splash (`data-ui="boot"`) from the first paint, so the page is not blank while the
 * bundle downloads and the stage boots. The app's first screen fades in above it, and the splash goes when that
 * fade ends, so no blank gap opens between the two. In reduced motion nothing fades: the first screen is already
 * fully drawn above the splash, which goes at once. SPLASH_MAX_MS is only a backstop for a screen that never
 * finishes its fade.
 */
const SPLASH_MAX_MS = 10_000;

function removeSplashUnderFirstScreen(uiRoot: HTMLElement): () => void {
  const byId = document.getElementById("ww-boot");
  const splash = uiRoot.querySelector('[data-ui="boot"]') ?? byId;
  if (!splash) return () => undefined;
  if (
    document.documentElement.dataset["broadcast"] === "true" ||
    document.documentElement.classList.contains(REDUCED_MOTION_CLASS) ||
    prefersReducedMotion(window)
  ) {
    byId?.remove();
    splash.remove();
    return () => undefined;
  }
  // The first screen is already fading in: the splash's own content fades out under it (styles.css).
  splash.classList.add("ww-boot-leaving");
  let timer = 0;
  const remove = (): void => {
    window.clearTimeout(timer);
    uiRoot.removeEventListener("animationend", onAnimationEnd);
    splash.remove();
  };
  const onAnimationEnd = (event: AnimationEvent): void => {
    if (event.target instanceof Element && event.target.classList.contains("ww-screen")) remove();
  };
  uiRoot.addEventListener("animationend", onAnimationEnd);
  timer = window.setTimeout(remove, SPLASH_MAX_MS);
  return remove;
}

function boot(): void {
  const search = window.location.search;
  const flags = readFlags(search);
  const params = readQaParams(QA_PARAMS, search);

  let app: WonderApp | null = null;
  const safety = installSafetyNet({
    safety: { selfHeal: false, panel: "query" },
    app: { diagnostics: () => app?.auraApp()?.diagnostics() },
    search
  });

  const uiRoot = document.getElementById("ui");
  if (!uiRoot) {
    markBootError(new Error("missing #ui overlay root"));
    return;
  }

  // Settings live on this device only; `?mode=` applies to this page load and is saved only if the grown-up changes a setting.
  const storage = safeLocalStorage(window);
  let settings = loadSettings(storage, prefersReducedMotion(window), prefersMoreContrast(window));
  if (flags.broadcast) {
    settings = { ...settings, mode: "broadcast" };
  } else {
    const mode = playModeOf(params.mode);
    if (mode) settings = { ...settings, mode };
  }

  if (flags.broadcast) {
    document.documentElement.dataset["broadcast"] = "true";
    removeSplashUnderFirstScreen(uiRoot);
  }

  const created = createApp({
    uiRoot,
    stageHost: document.getElementById("stage"),
    flags,
    settings,
    storage: flags.broadcast ? null : storage,
    welcomeName: flags.broadcast ? null : WELCOME_NAME,
    query: {
      ...(params.story !== undefined && params.story.length > 0 ? { story: params.story } : {}),
      ...(params.show !== undefined && params.show.length > 0 ? { show: params.show } : {}),
      autostart: params.autostart,
      manual: params.manual
    }
  });
  app = created;
  const qa = installWonderQaHooks(created, { seed: params.seed });
  const clearBootSplash = removeSplashUnderFirstScreen(uiRoot);

  created
    .whenReady()
    .then(() => {
      clearBootSplash();
    })
    .catch((error: unknown) => {
      clearBootSplash();
      qa.reportError(error);
      markBootError(error);
    });
  window.addEventListener("error", (event) => created.reportError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => created.reportError(event.reason));
  // A page that is really leaving (not kept in the back/forward cache) stops every sound and timer.
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    created.dispose();
    qa.uninstall();
    safety.dispose();
  });
}

boot();
