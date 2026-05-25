export type V5MaterialMode = "opaque" | "alpha-test" | "alpha-blend" | "transmissive" | "double-sided";

export class V5MaterialSystem {
  readonly modes: readonly V5MaterialMode[] = ["opaque", "alpha-test", "alpha-blend", "transmissive", "double-sided"];

  supports(mode: V5MaterialMode): boolean {
    return this.modes.includes(mode);
  }
}
