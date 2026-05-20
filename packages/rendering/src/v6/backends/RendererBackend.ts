import type { V6RenderProof, V6RendererBackend, V6RendererFeature, V6RendererInput } from '../ProductionRendererTypes';

export interface RendererBackendDiagnostics {
  readonly backend: V6RendererBackend;
  readonly contextType: string;
  readonly realDevice: boolean;
  readonly fallback?: string;
}

export interface RendererBackend {
  readonly backend: V6RendererBackend;
  readonly contextType: string;
  renderImportedAsset(input: V6RendererInput): V6RenderProof;
  getFeatures(): readonly V6RendererFeature[];
  getDiagnostics(): RendererBackendDiagnostics;
  dispose(): void;
}
