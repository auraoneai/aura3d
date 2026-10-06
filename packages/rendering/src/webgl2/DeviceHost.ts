// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import type { WebGL2StateCache } from "../WebGL2StateCache";
import type { WebGL2Device } from "../WebGL2Device";
import type { TextureFilterAnisotropicExtension, WebGL2Buffer, WebGL2ErrorCheckMode, WebGL2RenderTarget, WebGL2ShaderProgram } from "../WebGL2Device";
import type { WebGL2Counters } from "./Counters";
import type { WebGL2ContextLifecycle } from "./ContextLifecycle";
import type { WebGL2TextureRegistry } from "./TextureUpload";
import type { WebGL2SamplerRegistry } from "./Samplers";
import type { WebGL2DrawCallBinder } from "./MultiDraw";
import type { WebGL2ReadbackProbe } from "./Probe";
import type { WebGL2LegacyPostPipeline } from "./LegacyPost";

/**
 * The shared seam bag: everything extracted subsystem code used to reach via
 * `this.` on WebGL2Device. Constructed once in the device constructor; the
 * subsystems are attached after the bag fields exist, so cross-subsystem refs
 * (host.samplers, host.post, ...) resolve lazily at call time.
 */
export interface WebGL2DeviceHost {
  gl: WebGL2RenderingContext;
  readonly stateCache: WebGL2StateCache;
  readonly counters: WebGL2Counters;
  readonly buffers: Set<WebGL2Buffer>;
  readonly shaders: Set<WebGL2ShaderProgram>;
  readonly renderTargets: Set<WebGL2RenderTarget>;
  activeRenderTarget: WebGL2RenderTarget | null;
  disposed: boolean;
  contextLost: boolean;
  readonly errorCheckMode: WebGL2ErrorCheckMode;
  readonly anisotropicFilteringExtension: TextureFilterAnisotropicExtension | null;
  readonly maxTextureAnisotropy: number;
  readonly maxVertexAttributes: number;
  lifecycle: WebGL2ContextLifecycle;
  textureRegistry: WebGL2TextureRegistry;
  samplers: WebGL2SamplerRegistry;
  drawBinder: WebGL2DrawCallBinder;
  probe: WebGL2ReadbackProbe;
  post: WebGL2LegacyPostPipeline;
  readonly resolveMultisampleTarget: (target: WebGL2RenderTarget) => void;
  readonly device: WebGL2Device;
  readonly textureBudgetPolicy?: import("../textures/TextureBudget").TextureBudgetPolicy;
}
