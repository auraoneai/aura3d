// PRD-08 S9 — prd08-motion-rail-shot (Aura3D, real lane-08 rig via app.camera).
import { motionSpec, runMotionAuraScene, type MotionRunOptions } from "./common";

export default (host: HTMLElement, opts: MotionRunOptions = {}) => runMotionAuraScene(motionSpec("prd08-motion-rail-shot"), host, opts);
