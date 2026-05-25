export class TextureStreamingV5 {
  constructor(public readonly textureCount: number, public readonly residentMipBias = 1) {}
  get estimatedMemoryBytes(): number { return this.textureCount * 1024 * 1024 * Math.max(1, 4 - this.residentMipBias); }
}
