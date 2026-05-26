export interface GPUBufferDescriptorProduction { readonly label: string; readonly byteLength: number; readonly usage: readonly string[]; }
export class GPUBuffer { constructor(readonly descriptor: GPUBufferDescriptorProduction) {} }
