export type ThreeCompatMaterialMode = "opaque" | "alpha-test" | "alpha-blend" | "transmissive" | "double-sided";

export class ThreeCompatMaterialSystem {
  readonly modes: readonly ThreeCompatMaterialMode[] = ["opaque", "alpha-test", "alpha-blend", "transmissive", "double-sided"];

  supports(mode: ThreeCompatMaterialMode): boolean {
    return this.modes.includes(mode);
  }
}
