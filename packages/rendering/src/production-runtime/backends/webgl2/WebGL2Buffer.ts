export interface WebGL2BufferDescriptor { readonly label: string; readonly backend?: 'webgl2'; readonly detail?: string; }
export class WebGL2Buffer { readonly backend = 'webgl2' as const; constructor(readonly descriptor: WebGL2BufferDescriptor) {} }
