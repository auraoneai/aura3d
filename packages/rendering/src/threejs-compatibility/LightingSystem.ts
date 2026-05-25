export type V5LightKind = "directional" | "point" | "spot" | "hemisphere" | "ambient" | "rect-area";

export interface V5LightDescriptor {
  readonly kind: V5LightKind;
  readonly intensity: number;
  readonly castsShadow?: boolean;
}

export class V5LightingSystem {
  readonly lightKinds: readonly V5LightKind[] = ["directional", "point", "spot", "hemisphere", "ambient", "rect-area"];

  createDefaultRig(): readonly V5LightDescriptor[] {
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
