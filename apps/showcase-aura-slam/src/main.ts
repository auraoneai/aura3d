/** Aura Slam 3D, native build. Mounts examples/aura-slam/ without duplicating its code. */
import "../../../examples/aura-slam/main";

/** Asset ids the production route build must ship (it scans route sources for these ids). */
export const AURA_ASSET_IDS = ["showcaseStadiumSeats", "rooftopScoreboardRigMeshy", "rooftopFloodlightTowerMeshy"] as const;
