import { createProductionWebGPUReport, type ProductionWebGPULike, type ProductionWebGPUReport } from '../ProductionWebGPURenderer';

export interface WebGPURendererBackendOptions {
  readonly navigatorGpu?: ProductionWebGPULike | null;
  readonly userAgent?: string;
}

export class WebGPURendererBackend {
  readonly backend = 'webgpu' as const;
  readonly contextType = 'webgpu';
  private constructor(private readonly report: ProductionWebGPUReport) {}

  static async create(options: WebGPURendererBackendOptions = {}): Promise<WebGPURendererBackend> {
    return new WebGPURendererBackend(await createProductionWebGPUReport(options.navigatorGpu ?? null));
  }

  getReport(): ProductionWebGPUReport {
    return this.report;
  }

  getDiagnostics(): { readonly backend: 'webgpu'; readonly contextType: 'webgpu'; readonly realDevice: boolean; readonly fallback?: string } {
    return { backend: this.backend, contextType: this.contextType, realDevice: this.report.status === 'available', fallback: this.report.warnings[0] };
  }
}
