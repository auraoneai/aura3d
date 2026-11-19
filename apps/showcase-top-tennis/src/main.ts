/** Aura Slam 3D, native build. Mounts examples/aura-slam/ without duplicating its code. */
import "../../showcase-port-shared/quickbar.css";
import "../../showcase-port-shared/worker-lab";
import "../../../examples/aura-slam/main";

import { IDOL_MODEL_KEYS } from "../../../examples/aura-slam/view/assets";

/**
 * Asset ids the production route build must ship: the Idol wow pass GLBs (athletes, umpire, World Tour set pieces) under
 * public/aura-assets; court surfaces, net, boards, bleachers and crowd stay procedural.
 */
export const AURA_ASSET_IDS = IDOL_MODEL_KEYS;
