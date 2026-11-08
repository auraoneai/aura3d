/**
 * Registers the bundled render worker for `?worker=1` on routes that mount an example (examples/<game>/main.ts reads it
 * through `labWorkerDefaults()`). Import before the example. The worker is only constructed when `?worker=1` is set.
 */
import { createWorkerRendererWorker } from "@aura3d/engine/worker";
import { registerLabWorkerFactory } from "../../examples/shared/lab-flags";

registerLabWorkerFactory(createWorkerRendererWorker);
