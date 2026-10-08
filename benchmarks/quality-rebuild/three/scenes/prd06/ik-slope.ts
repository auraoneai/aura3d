// Lane adapter `prd06-ik-slope` (PRD-06 T3.9), three side: Soldier Idle on a
// 20° ramp + 18 cm stairs, leg chains solved by CCDIKSolver against the shared
// analytic terrain (spec.terrain → target bones at ground height).
// `extra.footIk` carries the same engine-reported contact metric as the aura
// side — acceptance per §17.0, not image parity.
import { prd06IkSlope } from "../../../scenes/prd06/ik-slope";
import { runThreeScene } from "../../common";

export default (host: HTMLElement) => runThreeScene(prd06IkSlope, host);
