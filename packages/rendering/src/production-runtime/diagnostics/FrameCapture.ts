import type { ProductionPixelMetrics } from '../ProductionRendererTypes';
export interface FrameCapture { readonly path: string; readonly backend: string; readonly metrics: ProductionPixelMetrics; }
