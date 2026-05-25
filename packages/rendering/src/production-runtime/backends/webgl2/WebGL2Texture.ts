export interface WebGL2TextureDescriptor { readonly label: string; readonly backend?: 'webgl2'; readonly detail?: string; }
export class WebGL2Texture { readonly backend = 'webgl2' as const; constructor(readonly descriptor: WebGL2TextureDescriptor) {} }
