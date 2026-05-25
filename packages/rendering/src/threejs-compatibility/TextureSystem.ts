export interface V5TextureCapability {
  readonly name: string;
  readonly supported: boolean;
}

export class V5TextureSystem {
  readonly capabilities: readonly V5TextureCapability[] = [
    { name: "srgb-textures", supported: true },
    { name: "linear-textures", supported: true },
    { name: "normal-maps", supported: true },
    { name: "orm-packed-textures", supported: true },
    { name: "hdr-environment-textures", supported: true },
    { name: "ktx2-status-report", supported: true }
  ];

  supports(name: string): boolean {
    return this.capabilities.some((capability) => capability.name === name && capability.supported);
  }
}
