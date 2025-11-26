/**
 * Rendering Pipeline module for G3D 5.0.
 * Provides a complete rendering pipeline system with automatic resource management,
 * render graph scheduling, and efficient draw call batching.
 *
 * @module rendering/pipeline
 */

// Core pipeline
export {
  RenderPipeline,
} from './RenderPipeline';

export type {
  ViewportDescriptor,
  ScissorDescriptor,
  MultiViewConfig,
  RenderPipelineStats,
  RenderPipelineConfig,
} from './RenderPipeline';

// Render passes
export {
  RenderPass,
} from './RenderPass';

export type {
  RenderPassDescriptor,
  AttachmentReference,
  ClearValues,
  PassDependency,
} from './RenderPass';

// Render graph
export {
  RenderGraph,
} from './RenderGraph';

export type {
  RenderGraphOptions,
  RenderGraphStats,
} from './RenderGraph';

// Render targets
export {
  RenderTarget,
  TextureFormat,
  LoadAction,
  StoreAction,
} from './RenderTarget';

export type {
  RenderTargetDescriptor,
  RenderTargetAttachment,
  AttachmentDescriptor,
} from './RenderTarget';

// Pipeline state
export {
  PipelineState,
  BlendFactor,
  BlendOperation,
  CompareFunction,
  StencilOperation,
  CullMode,
  FrontFace,
  PolygonMode,
  ColorWriteMask,
} from './PipelineState';

export type {
  PipelineStateDescriptor,
  BlendState,
  DepthState,
  StencilState,
  RasterizerState,
  StencilOperationState,
} from './PipelineState';

// Draw calls
export {
  DrawCall,
  PrimitiveTopology,
  IndexFormat,
} from './DrawCall';

export type {
  VertexBufferBinding,
  IndexBufferBinding,
  IndirectDrawBuffer,
} from './DrawCall';

// Render queue
export {
  RenderQueue,
  RenderQueueType,
} from './RenderQueue';

export type {
  RenderQueueEntry,
} from './RenderQueue';
