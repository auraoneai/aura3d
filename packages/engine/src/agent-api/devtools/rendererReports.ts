// PRD-15 Phase 3 shim — devtools/rendererReports.ts moved to agent-api/rendererReports.ts
// (shared runtime plumbing, not an evidence-surface helper). Re-exports keep the
// 0b-1 import path alive for advanced-runtime/production-runtime consumers.
export * from "../rendererReports.js";
