export interface WebGL2ShaderDescriptor { readonly label: string; readonly backend?: 'webgl2'; readonly detail?: string; }
export class WebGL2Shader { readonly backend = 'webgl2' as const; constructor(readonly descriptor: WebGL2ShaderDescriptor) {} }
