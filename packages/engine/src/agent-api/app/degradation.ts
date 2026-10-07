// PRD-15 T4.1: the sink implementation lives in compiler/degradation.ts —
// compiler/renderer.ts consumes it and compiler may not value-import app/
// (layering gate). Re-exported here so the app/degradation.js surface is
// unchanged for app-tier consumers.
export { createDegradationSink } from "../compiler/degradation.js";
export type { AuraDegradationSinkOptions } from "../compiler/degradation.js";
