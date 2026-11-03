import { installWorkerRenderer } from "./workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "./workerProtocol.js";
import { installWorkerAssetsFromUrl } from "@aura3d/core";

// URLs are installed before any request or renderer is created. Custom worker
// entries without a packaged asset manifest retain their existing behavior.
installWorkerAssetsFromUrl(globalThis.location.href);
installWorkerRenderer(globalThis as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>);
