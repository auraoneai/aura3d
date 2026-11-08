/**
 * Lab flags: ?backend=, ?gamut=p3 and ?worker=1 map to createAuraApp option fragments via the shared parser. WebGPU is the
 * default (backend "auto", WebGL2 fallback kept; real-GPU check 2026-11-08: same frame, about 0.9x the WebGL2 frame rate
 * or better); `?backend=webgl2` forces WebGL2.
 */
import { labAppOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";
import { createWorkerRendererWorker } from "@aura3d/engine/worker";

(window as unknown as { __AURA_LAB_APP_OPTIONS__?: unknown }).__AURA_LAB_APP_OPTIONS__ = labAppOptions(readLabFlags(), { backend: "auto", createWorker: createWorkerRendererWorker });
