export interface WebGL2RenderTargetDescriptor { readonly label: string; readonly backend?: 'webgl2'; readonly detail?: string; }
export class WebGL2RenderTarget { readonly backend = 'webgl2' as const; constructor(readonly descriptor: WebGL2RenderTargetDescriptor) {} }
