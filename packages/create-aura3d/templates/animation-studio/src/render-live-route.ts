/**
 * render-live-route.ts — the live 3D route ENTRY (the generic player).
 *
 * This file contains NO scene-specific content. It loads whatever EpisodeDocument is
 * injected (a Director-GENERATED scene, the working document, or an explicitly chosen
 * example) and hands it to the GENERIC `scene-player`, which can render ANY document.
 *
 * IMPORTANT: there is NO content fixture as the default. When nothing is injected the
 * route plays a neutral EMPTY placeholder and prints a clear "no scene loaded" message.
 * The Moon Garden scene is now an EXAMPLE (`src/examples/moon-garden.example.ts`) and is
 * used ONLY when explicitly requested — never as the default render path.
 *
 * This is the bridge for both project goals:
 * generalization = a Director GENERATES documents; studio = an agent EDITS documents.
 */

import { mountScenePlayer } from "./scene-player";
import { emptyDocument, EMPTY_DOCUMENT_NOTICE } from "./empty-document";
import type { EpisodeDocument } from "./episode-document";

// The capture script / studio injects the scene to render (any document) via this global.
// If nothing is injected we fall back to the generic EMPTY placeholder — never a fixture.
const injected = (window as Window & { __AURA_EPISODE_DOCUMENT__?: EpisodeDocument }).__AURA_EPISODE_DOCUMENT__;
const documentToPlay = injected ?? emptyDocument;
if (!injected) {
  // eslint-disable-next-line no-console
  console.warn(EMPTY_DOCUMENT_NOTICE);
}

void mountScenePlayer(documentToPlay).catch((error: unknown) => {
  const diagnostics = (error as { diagnostics?: readonly string[] })?.diagnostics;
  const baseMessage = error instanceof Error ? error.message : String(error);
  const message = diagnostics && diagnostics.length > 0 ? `${baseMessage} :: ${diagnostics.join(" | ")}` : baseMessage;
  const liveWindow = window as Window & { __AURA_LIVE_ROUTE_ERROR__?: string };
  liveWindow.__AURA_LIVE_ROUTE_ERROR__ = message;
  const root = document.querySelector<HTMLDivElement>("#app");
  if (root) {
    root.innerHTML = `<pre style="color:#f88;background:#0b0f1a;padding:24px;white-space:pre-wrap;">scene-player failed: ${message}</pre>`;
  }
  // eslint-disable-next-line no-console
  console.error("scene-player failed", error);
});
