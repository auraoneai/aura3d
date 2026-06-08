/**
 * @aura3d/engine/animation-studio — the PROMOTED canonical home of the Animation Studio
 * generative core (#10). The schema (EpisodeDocument), the deterministic Director
 * heuristics, the coherence Validator, and the pure Scene-Tool transforms now ship as a
 * first-class engine module so any consumer — not just the template — can generate, edit,
 * and validate episode documents programmatically.
 *
 * The animation-studio TEMPLATE keeps local mirrors of these files because its render path
 * (scene-player.ts in the browser) resolves them through Vite's dist alias; the engine
 * module is the library API. Both share identical logic.
 *
 * Note: this module is PURE (schema + heuristics + validation + transforms). It does NOT
 * include the browser renderer (scene-player) or the headless capture scripts — those
 * stay in the template/run surface.
 */

export * from "./episode-document";
export * from "./animation-episode-validator";
export * from "./director-heuristics";
export * from "./scene-tools";
