export interface WebGL2CapabilitiesDescriptor { readonly label: string; readonly backend?: 'webgl2'; readonly detail?: string; }
export class WebGL2Capabilities { readonly backend = 'webgl2' as const; constructor(readonly descriptor: WebGL2CapabilitiesDescriptor) {} }
