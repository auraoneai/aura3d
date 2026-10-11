// PRD-08 S9 — prd08-motion-impact-shake (three.js r0.185.1 reference, C-30 admittedAsReference).
import { motionSpec, runMotionThreeScene, type MotionRunOptions } from "./common";

export default (host: HTMLElement, opts: MotionRunOptions = {}) => runMotionThreeScene(motionSpec("prd08-motion-impact-shake"), host, opts);
