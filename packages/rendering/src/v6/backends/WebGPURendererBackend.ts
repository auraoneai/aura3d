import { createV6WebGPUReport, type V6WebGPULike, type V6WebGPUReport } from '../ProductionWebGPURenderer';

export interface WebGPURendererBackendOptions {
  readonly navigatorGpu?: V6WebGPULike | null;
  readonly userAgent?: string;
}

export class WebGPURendererBackend {
  readonly backend = 'webgpu' as const;
  readonly contextType = 'webgpu';
  private constructor(private readonly report: V6WebGPUReport) {}

  static async create(options: WebGPURendererBackendOptions = {}): Promise<WebGPURendererBackend> {
    return new WebGPURendererBackend(await createV6WebGPUReport(options.navigatorGpu ?? null));
  }

  getReport(): V6WebGPUReport {
    return this.report;
  }

  getDiagnostics(): { readonly backend: 'webgpu'; readonly contextType: 'webgpu'; readonly realDevice: boolean; readonly fallback?: string } {
    return { backend: this.backend, contextType: this.contextType, realDevice: this.report.status === 'available', fallback: this.report.warnings[0] };
  }
}
