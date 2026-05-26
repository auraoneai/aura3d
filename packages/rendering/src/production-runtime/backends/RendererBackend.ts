import type { ProductionRenderProof, ProductionRendererBackend, ProductionRendererFeature, ProductionRendererInput } from '../ProductionRendererTypes';

export interface RendererBackendDiagnostics {
  readonly backend: ProductionRendererBackend;
  readonly contextType: string;
  readonly realDevice: boolean;
  readonly fallback?: string;
}

export interface RendererBackend {
  readonly backend: ProductionRendererBackend;
  readonly contextType: string;
  renderImportedAsset(input: ProductionRendererInput): ProductionRenderProof;
  getFeatures(): readonly ProductionRendererFeature[];
  getDiagnostics(): RendererBackendDiagnostics;
  dispose(): void;
}
