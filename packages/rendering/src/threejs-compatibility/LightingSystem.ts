export type ThreeCompatLightKind = "directional" | "point" | "spot" | "hemisphere" | "ambient" | "rect-area";

export interface ThreeCompatLightDescriptor {
  readonly kind: ThreeCompatLightKind;
  readonly intensity: number;
  readonly castsShadow?: boolean;
}

export class ThreeCompatLightingSystem {
  readonly lightKinds: readonly ThreeCompatLightKind[] = ["directional", "point", "spot", "hemisphere", "ambient", "rect-area"];

  createDefaultRig(): readonly ThreeCompatLightDescriptor[] {
    return [
      { kind: "ambient", intensity: 0.18 },
      { kind: "hemisphere", intensity: 0.42 },
      { kind: "directional", intensity: 3.2, castsShadow: true },
      { kind: "point", intensity: 35 },
      { kind: "spot", intensity: 18, castsShadow: true },
      { kind: "rect-area", intensity: 12 }
    ];
  }
}
