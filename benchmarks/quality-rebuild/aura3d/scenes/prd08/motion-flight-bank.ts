// PRD-08 S9 — prd08-motion-flight-bank (Aura3D, real lane-08 rig via app.camera).
import { motionSpec, runMotionAuraScene, type MotionRunOptions } from "./common";

export default (host: HTMLElement, opts: MotionRunOptions = {}) => runMotionAuraScene(motionSpec("prd08-motion-flight-bank"), host, opts);
