/**
 * Hazard hit boxes and the drawn size that matches them (render layer; the sim is a deterministic port and keeps its
 * original numbers). `sim.ts` hits the runner when its centre is within 0.88 m of a hazard's lane centre (`o < 0.88`)
 * and a crate is cleared above 0.85 m (`i.y > 0.85`). A hazard drawn wider than that box let the runner visibly run
 * through the end of a crate or beam it missed (an adjacent lane is only 1.19 m away in the backstreets), and a crate
 * drawn taller let a cleared jump pass through its top. Drawn half-width + the runner's ~0.35 m body ~ 0.88 m.
 */
export const HAZARD_HIT = { half: 0.88, barrierClear: 0.85 } as const;

/** Procedural spiked beam is authored 2.5 m wide (`buildSpikedBeamHazardNode`); it is drawn at this width. */
export const BEAM_AUTHORED_WIDTH = 2.5;
export const BEAM_DRAWN = { half: 0.7 } as const;
export const BEAM_SCALE_X = (BEAM_DRAWN.half * 2) / BEAM_AUTHORED_WIDTH;
