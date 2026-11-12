/** Aura Slam 3D, native build. Mounts examples/aura-slam/ without duplicating its code. */
import "../../showcase-port-shared/quickbar.css";
import "../../showcase-port-shared/worker-lab";
import "../../../examples/aura-slam/main";

/** Asset ids the production route build must ship (all stadium, gear & athlete geometry is procedural). */
export const AURA_ASSET_IDS = [] as const;
