/** @deprecated PRD-15 T2.7 — the wrapper collapsed onto `Renderer`; removed in Phase 8. */
export { Renderer as AdvancedRenderer } from "../Renderer";
export type { RendererOptions as AdvancedRendererOptions } from "../Renderer";
export type { RendererInput, CameraLike, RenderSource } from "../Renderer";
import type { RendererInput } from "../Renderer";
import type { RenderSource } from "../Renderer";
import type { RenderItem } from "../ForwardPass";
import type { Scene } from "@aura3d/scene";
export type AdvancedRendererSource = RendererInput | RenderSource | Iterable<RenderItem> | Scene;
export * from "../Renderer";
export * from "../RenderDevice";
export * from "../Geometry";
export * from "../Material";
export * from "../PBRMaterial";
export * from "../UnlitMaterial";
export * from "../ForwardPass";
