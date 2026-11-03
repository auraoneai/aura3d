import { installWorkerRenderer } from "@aura3d/engine/worker";

// The worker consumes the same packed public API as the host project.
installWorkerRenderer(self);
