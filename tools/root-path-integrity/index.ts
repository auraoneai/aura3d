/**
 * muse3jsparity-PRD PART T root-path integrity gates (named asserts).
 *
 * - T1a `assertNoUndocumentedRendererMount` (renderer-mount-policy)
 * - T1b `assertNoMultiOwnerPixelExports` (pixel-export-policy)
 * - T2a `assertPrimitiveHeroDisclosure` (primitive-hero-policy)
 * - T3b `assertFrameGraphResourceFlow` (framegraph-resource-policy)
 */
export {
  assertNoUndocumentedRendererMount,
  classifyRouteMount,
  findUndocumentedRendererMounts,
} from "./renderer-mount-policy.js";
export type {
  DocumentedRendererBucket,
  RouteMountClassification,
  UndocumentedRendererMount,
} from "./renderer-mount-policy.js";
export {
  PIXEL_SYMBOL_PATTERN,
  assertNoMultiOwnerPixelExports,
  findMultiOwnerPixelExports,
} from "./pixel-export-policy.js";
export type {
  ExportOwnershipRecord,
  ExportSymbolKind,
  MultiOwnerPixelFinding,
  PixelImplementation,
} from "./pixel-export-policy.js";
export {
  assertPrimitiveHeroDisclosure,
  findUndisclosedPrimitiveHeroes,
  usesTypedRig,
} from "./primitive-hero-policy.js";
export type { PrimitiveHeroViolation } from "./primitive-hero-policy.js";
export {
  assertFrameGraphResourceFlow,
  findFrameGraphResourceBreaks,
} from "./framegraph-resource-policy.js";
export type { FlowPassRecord, FrameGraphFlowOptions } from "./framegraph-resource-policy.js";
