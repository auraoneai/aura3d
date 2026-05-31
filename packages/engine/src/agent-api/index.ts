export type AuraVec3 = readonly [number, number, number];
export type AuraColor = `#${string}` | string;
export type AuraAssetType = "model" | "texture" | "environment" | "audio";
export type AuraModelFormat = "glb" | "gltf";
export type AuraTextureFormat = "png" | "jpg" | "jpeg" | "webp" | "ktx2";

export interface AuraAssetDefinition {
  readonly type: AuraAssetType;
  readonly format: string;
  readonly url: string;
  readonly hash?: string;
  readonly bounds?: AuraVec3;
  readonly sizeBytes?: number;
  readonly optional?: boolean;
  readonly metadata?: AuraAssetMetadata;
}

export interface AuraAssetMetadata {
  readonly materials?: readonly string[];
  readonly animations?: readonly string[];
  readonly textures?: readonly string[];
  readonly thumbnailUrl?: string;
  readonly license?: string;
}

const auraAssetRefBrand: unique symbol = Symbol("AuraAssetRef");

export type AuraAssetRef<
  TType extends AuraAssetType = AuraAssetType,
  TId extends string = string
> = AuraAssetDefinition & {
  readonly kind: "aura-asset-ref";
  readonly id: TId;
  readonly type: TType;
  readonly [auraAssetRefBrand]: {
    readonly type: TType;
    readonly id: TId;
  };
};

export type AuraAssetMap<T extends Record<string, AuraAssetDefinition>> = {
  readonly [K in keyof T]: AuraAssetRef<T[K]["type"], Extract<K, string>> & T[K];
};

export function defineAuraAssets<const T extends Record<string, AuraAssetDefinition>>(definitions: T): AuraAssetMap<T> {
  const refs: Record<string, AuraAssetRef> = {};
  for (const [id, definition] of Object.entries(definitions)) {
    refs[id] = {
      ...definition,
      kind: "aura-asset-ref",
      id,
      [auraAssetRefBrand]: {
        type: definition.type,
        id
      }
    } as AuraAssetRef;
  }
  return refs as AuraAssetMap<T>;
}

export interface AuraTransformSpec {
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
  readonly lookAt?: AuraVec3;
}

export interface AuraMaterialSpec {
  readonly name?: string;
  readonly color?: AuraColor;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly emissive?: AuraColor;
  readonly opacity?: number;
  readonly transmission?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly thickness?: number;
  readonly ior?: number;
  readonly attenuationColor?: AuraColor;
  readonly attenuationDistance?: number;
  readonly envMapIntensity?: number;
  readonly texture?: AuraAssetRef<"texture">;
}

export interface AuraModelOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly visible?: boolean;
}

export interface AuraPrimitiveOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly size?: number | AuraVec3;
}

export interface AuraAnimationSpec {
  readonly clip?: string;
  readonly loop?: boolean;
  readonly speed?: number;
}

export interface AuraInteractionSpec {
  readonly cursor?: string;
  readonly onClick?: string;
  readonly onHover?: string;
}

export type AuraSceneNode =
  | AuraModelNode
  | AuraPrimitiveNode
  | AuraLightNode
  | AuraEffectNode
  | AuraInteractionNode;

export interface AuraModelNode extends AuraTransformSpec {
  readonly kind: "model";
  readonly name?: string;
  readonly asset: AuraAssetRef<"model">;
  readonly material?: AuraMaterialSpec;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly visible: boolean;
  readonly animation?: AuraAnimationSpec;
  readonly interaction?: AuraInteractionSpec;
}

export interface AuraPrimitiveNode extends AuraTransformSpec {
  readonly kind: "primitive";
  readonly primitive: "box" | "sphere" | "plane" | "cylinder";
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly size?: number | AuraVec3;
  readonly animation?: AuraAnimationSpec;
  readonly interaction?: AuraInteractionSpec;
}

export type AuraLightType = "ambient" | "directional" | "point" | "studio";

export interface AuraLightNode extends AuraTransformSpec {
  readonly kind: "light";
  readonly light: AuraLightType;
  readonly name?: string;
  readonly color?: AuraColor;
  readonly intensity: number;
}

export type AuraEffectType = "fog" | "bloom" | "rain" | "particles";

export interface AuraEffectNode {
  readonly kind: "effect";
  readonly effect: AuraEffectType;
  readonly name?: string;
  readonly intensity?: number;
  readonly density?: number;
  readonly color?: AuraColor;
  readonly speed?: number;
  readonly wind?: AuraVec3;
  readonly particleCount?: number;
  readonly emitter?: "fountain" | "swirl" | "ambient";
  readonly radius?: number;
  readonly height?: number;
  readonly splashes?: boolean;
  readonly mist?: boolean;
}

declare global {
  // Some TypeScript DOM libs expose <strong> as HTMLElement only. Agents often
  // use this element for HUD counters, so keep that code portable.
  interface HTMLStrongElement extends HTMLElement {}
}

export interface AuraInteractionNode {
  readonly kind: "interaction";
  readonly mode: "orbit" | "pointer" | "keyboard";
  readonly target?: string;
}

export class AuraNodeBuilder<TNode extends AuraSceneNode> {
  constructor(private readonly value: TNode) {}

  position(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly position: AuraVec3 }> {
    return this.with({ position: [x, y, z] as const });
  }

  rotate(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly rotation: AuraVec3 }> {
    return this.with({ rotation: [x, y, z] as const });
  }

  scale(value: number | AuraVec3): AuraNodeBuilder<TNode & { readonly scale: number | AuraVec3 }> {
    return this.with({ scale: value });
  }

  lookAt(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly lookAt: AuraVec3 }> {
    return this.with({ lookAt: [x, y, z] as const });
  }

  material(material: AuraMaterialSpec): AuraNodeBuilder<TNode & { readonly material: AuraMaterialSpec }> {
    return this.with({ material });
  }

  animate(animation: AuraAnimationSpec): AuraNodeBuilder<TNode & { readonly animation: AuraAnimationSpec }> {
    return this.with({ animation });
  }

  onPointer(interaction: AuraInteractionSpec): AuraNodeBuilder<TNode & { readonly interaction: AuraInteractionSpec }> {
    return this.with({ interaction });
  }

  toJSON(): TNode {
    return this.value;
  }

  private with<TPatch extends Partial<AuraSceneNode>>(patch: TPatch): AuraNodeBuilder<TNode & TPatch> {
    return new AuraNodeBuilder({ ...this.value, ...patch } as TNode & TPatch);
  }
}

export function model<TAsset extends AuraAssetRef<"model">>(
  asset: TAsset,
  options: AuraModelOptions = {}
): AuraNodeBuilder<AuraModelNode> {
  return new AuraNodeBuilder({
    kind: "model",
    asset,
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    material: options.material,
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true,
    visible: options.visible ?? true
  });
}

export function unsafeModelUrl(url: string, options: Omit<AuraAssetDefinition, "type" | "format" | "url"> = {}): AuraAssetRef<"model", "unsafe"> {
  const format = url.toLowerCase().endsWith(".gltf") ? "gltf" : "glb";
  return defineAuraAssets({
    unsafe: {
      ...options,
      type: "model",
      format,
      url,
      metadata: {
        ...(options.metadata ?? {}),
        license: options.metadata?.license ?? "unknown"
      }
    }
  }).unsafe;
}

function primitive(primitiveName: AuraPrimitiveNode["primitive"], options: AuraPrimitiveOptions = {}): AuraNodeBuilder<AuraPrimitiveNode> {
  return new AuraNodeBuilder({
    kind: "primitive",
    primitive: primitiveName,
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    material: options.material,
    size: options.size
  });
}

export const primitives = {
  box: (options?: AuraPrimitiveOptions) => primitive("box", options),
  sphere: (options?: AuraPrimitiveOptions) => primitive("sphere", options),
  plane: (options?: AuraPrimitiveOptions) => primitive("plane", options),
  cylinder: (options?: AuraPrimitiveOptions) => primitive("cylinder", options)
} as const;

export const material = {
  pbr: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: "#d7dee8",
    roughness: 0.55,
    metallic: 0,
    ...options
  }),
  emissive: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#111827",
    emissive: options.emissive ?? options.color ?? "#38d6ff",
    roughness: options.roughness ?? 0.35,
    metallic: options.metallic ?? 0,
    ...options
  }),
  metal: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#dce6ee",
    roughness: options.roughness ?? 0.12,
    metallic: options.metallic ?? 1,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.16,
    envMapIntensity: options.envMapIntensity ?? 1.45,
    ...options
  }),
  rubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#111317",
    roughness: options.roughness ?? 0.86,
    metallic: options.metallic ?? 0,
    ...options
  }),
  glass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#d8f2ff",
    roughness: options.roughness ?? 0.04,
    metallic: options.metallic ?? 0,
    opacity: options.opacity ?? 0.24,
    transmission: options.transmission ?? 1,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.04,
    thickness: options.thickness ?? 0.74,
    ior: options.ior ?? 1.48,
    attenuationColor: options.attenuationColor ?? options.color ?? "#d8f2ff",
    attenuationDistance: options.attenuationDistance ?? 0.85,
    envMapIntensity: options.envMapIntensity ?? 1.85,
    ...options
  }),
  clearcoat: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#e8edf5",
    roughness: options.roughness ?? 0.16,
    metallic: options.metallic ?? 0,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.04,
    envMapIntensity: options.envMapIntensity ?? 1.35,
    ...options
  })
} as const;

export const lights = {
  ambient: (options: { readonly name?: string; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "ambient",
      name: options.name,
      intensity: options.intensity ?? 0.28,
      color: options.color ?? "#ffffff"
    }),
  directional: (options: { readonly name?: string; readonly position?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "directional",
      name: options.name,
      position: options.position ?? [3, 4, 3],
      intensity: options.intensity ?? 1.5,
      color: options.color ?? "#ffffff"
    }),
  point: (options: { readonly name?: string; readonly position?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "point",
      name: options.name,
      position: options.position ?? [2, 2.5, 1.5],
      intensity: options.intensity ?? 2,
      color: options.color ?? "#ffffff"
    }),
  studio: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "studio",
      name: "studio-key-fill-rim",
      intensity: options.intensity ?? 1,
      color: "#ffffff",
      position: [0, 3, 4]
    })
} as const;

export type AuraCameraMode = "perspective" | "orbit" | "dolly" | "follow";

export interface AuraCameraSpec {
  readonly mode: AuraCameraMode;
  readonly position?: AuraVec3;
  readonly target?: AuraVec3;
  readonly fov?: number;
  readonly distance?: number;
  readonly from?: AuraVec3;
  readonly to?: AuraVec3;
  readonly seconds?: number;
  readonly targetNode?: string;
}

export const camera = {
  perspective: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => ({
    mode: "perspective",
    position: options.position ?? [0, 1.4, 4],
    target: options.target ?? [0, 0.8, 0],
    fov: options.fov ?? 45
  }),
  orbit: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => {
    const distance = options.distance ?? 4;
    const target = options.target ?? [0, 0.8, 0];
    return {
      mode: "orbit",
      distance,
      target,
      position: options.position ?? [
        target[0] + distance * 0.62,
        target[1] + distance * 0.42,
        target[2] + distance * 0.78
      ],
      fov: options.fov ?? 45
    };
  },
  dolly: (options: Omit<AuraCameraSpec, "mode"> & { readonly from: AuraVec3; readonly to: AuraVec3 }): AuraCameraSpec => ({
    mode: "dolly",
    from: options.from,
    to: options.to,
    target: options.target ?? [0, 0.8, 0],
    seconds: options.seconds ?? 6,
    fov: options.fov ?? 45
  }),
  follow: (options: Omit<AuraCameraSpec, "mode"> & { readonly targetNode: string }): AuraCameraSpec => ({
    mode: "follow",
    targetNode: options.targetNode,
    distance: options.distance ?? 5,
    target: options.target ?? [0, 1, 0],
    fov: options.fov ?? 50
  })
} as const;

export interface AuraTimelineSpec {
  readonly mode: "loop" | "once";
  readonly seconds?: number;
}

export const timeline = {
  loop: (options: Omit<AuraTimelineSpec, "mode"> = {}): AuraTimelineSpec => ({
    mode: "loop",
    seconds: options.seconds ?? 8
  }),
  once: (options: Omit<AuraTimelineSpec, "mode"> = {}): AuraTimelineSpec => ({
    mode: "once",
    seconds: options.seconds ?? 4
  })
} as const;

export const effects = {
  fog: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "fog",
      density: options.density ?? 0.12,
      color: options.color ?? "#9fb7d9"
    }),
  bloom: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "bloom",
      intensity: options.intensity ?? 0.35,
      color: options.color ?? "#ffffff"
    }),
  rain: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "rain",
      intensity: options.intensity ?? 0.4,
      density: options.density ?? 0.72,
      color: options.color ?? "#bcd7ff",
      speed: options.speed ?? 1,
      wind: options.wind ?? [-0.32, -5.4, -0.16],
      particleCount: options.particleCount,
      splashes: options.splashes ?? true,
      mist: options.mist ?? true
    }),
  particles: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "particles",
      name: options.name ?? `${options.emitter ?? "swirl"} particle system`,
      intensity: options.intensity ?? 0.8,
      density: options.density ?? 1,
      color: options.color ?? "#7dfcff",
      speed: options.speed ?? 1,
      particleCount: options.particleCount ?? 900,
      emitter: options.emitter ?? "swirl",
      radius: options.radius ?? 1.15,
      height: options.height ?? 2.4
    })
} as const;

export const interactions = {
  orbit: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "orbit",
      target: options.target
    }),
  pointer: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "pointer",
      target: options.target
    }),
  keyboard: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "keyboard",
      target: options.target
    })
} as const;

type AuraUiTarget<TElement extends HTMLElement = HTMLElement> = string | TElement;

function resolveUiElement<TElement extends HTMLElement>(target: AuraUiTarget<TElement>, label: string): TElement {
  if (typeof target !== "string") return target;
  const element = document.querySelector<TElement>(target);
  if (!element) throw new Error(`Aura3D UI helper could not find ${label}: ${target}`);
  return element;
}

export const ui = {
  root: (selector = "#app"): HTMLElement => resolveUiElement<HTMLElement>(selector, "root"),
  text: (selector: string): HTMLElement => resolveUiElement<HTMLElement>(selector, "text"),
  button: (selector: string): HTMLButtonElement => resolveUiElement<HTMLButtonElement>(selector, "button"),
  html: (target: AuraUiTarget, markup: string, position: InsertPosition = "beforeend"): HTMLElement => {
    const element = resolveUiElement<HTMLElement>(target, "html mount");
    element.insertAdjacentHTML(position, markup);
    return element;
  },
  setText: (target: AuraUiTarget, value: string | number): void => {
    resolveUiElement<HTMLElement>(target, "text").textContent = String(value);
  },
  setPressed: (target: AuraUiTarget<HTMLButtonElement>, pressed: boolean): void => {
    const button = resolveUiElement<HTMLButtonElement>(target, "button");
    button.setAttribute("aria-pressed", String(pressed));
  },
  onClick: (target: AuraUiTarget<HTMLButtonElement>, handler: (button: HTMLButtonElement, event: MouseEvent) => void): HTMLButtonElement => {
    const button = resolveUiElement<HTMLButtonElement>(target, "button");
    button.onclick = (event) => handler(button, event);
    return button;
  }
} as const;

export interface AuraSceneSnapshot {
  readonly schema: "aura3d-scene-snapshot/1.0";
  readonly background: AuraColor;
  readonly camera: AuraCameraSpec;
  readonly timeline?: AuraTimelineSpec;
  readonly nodes: readonly AuraSceneNode[];
  readonly diagnostics: {
    readonly enabled: boolean;
  };
}

export class AuraSceneBuilder {
  private readonly nodes: AuraSceneNode[] = [];
  private backgroundColor: AuraColor = "#070b12";
  private cameraSpec: AuraCameraSpec = camera.orbit();
  private timelineSpec: AuraTimelineSpec | undefined;
  private diagnosticsEnabled = false;

  background(color: AuraColor): this {
    this.backgroundColor = color;
    return this;
  }

  add(node: AuraNodeBuilder<AuraSceneNode> | AuraSceneNode): this {
    this.nodes.push(node instanceof AuraNodeBuilder ? node.toJSON() : node);
    return this;
  }

  addMany(nodes: readonly (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[]): this {
    for (const node of nodes) this.add(node);
    return this;
  }

  camera(next: AuraCameraSpec): this {
    this.cameraSpec = next;
    return this;
  }

  timeline(next: AuraTimelineSpec): this {
    this.timelineSpec = next;
    return this;
  }

  diagnostics(enabled = true): this {
    this.diagnosticsEnabled = enabled;
    return this;
  }

  toJSON(): AuraSceneSnapshot {
    return {
      schema: "aura3d-scene-snapshot/1.0",
      background: this.backgroundColor,
      camera: this.cameraSpec,
      timeline: this.timelineSpec,
      nodes: [...this.nodes],
      diagnostics: {
        enabled: this.diagnosticsEnabled
      }
    };
  }
}

export function scene(): AuraSceneBuilder {
  return new AuraSceneBuilder();
}

function dataBarColor(value: number): AuraColor {
  if (value < 0.34) return "#20d6f2";
  if (value < 0.67) return "#ffd166";
  return "#ef476f";
}

type CityBlockTimeOfDay = "day" | "night";

function makeCityCrosswalk(namePrefix: string, x: number, z: number, orientation: "northSouth" | "eastWest"): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  for (let index = 0; index < 5; index += 1) {
    const offset = -0.56 + index * 0.28;
    nodes.push(primitives.box({
      name: `${namePrefix} stripe ${index + 1}`,
      material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" })
    })
      .position(orientation === "northSouth" ? x + offset : x, 0.036, orientation === "northSouth" ? z : z + offset)
      .scale(orientation === "northSouth" ? [0.075, 0.018, 0.82] : [0.82, 0.018, 0.075])
      .toJSON());
  }
  return nodes;
}

function makeBuildingWindowRows(x: number, z: number, height: number, towerIndex: number, timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const bandHeight = Math.max(0.72, height * 0.58);
  const bandY = 0.36 + bandHeight / 2;
  const warm = timeOfDay === "night"
    ? material.emissive({ color: "#ffd98a", emissive: "#ffd98a" })
    : material.emissive({ color: "#fff1b8", emissive: "#ffda73" });
  const cool = timeOfDay === "night"
    ? material.emissive({ color: "#8bdcff", emissive: "#8bdcff" })
    : material.emissive({ color: "#caeaff", emissive: "#89cfff" });
  const sign = towerIndex % 4 === 0
    ? [primitives.box({
      name: `roofline neon sign ${towerIndex + 1}`,
      material: material.emissive({ color: "#ff7ad9", emissive: "#ff7ad9" })
    }).position(x, height + 0.08, z + 0.64).scale([0.78, 0.08, 0.035]).toJSON()]
    : [];

  return [
    primitives.box({
      name: `front warm window column ${towerIndex + 1}`,
      material: warm
    }).position(x - 0.24, bandY, z + 0.66).scale([0.12, bandHeight, 0.034]).toJSON(),
    primitives.box({
      name: `front cool window column ${towerIndex + 1}`,
      material: cool
    }).position(x + 0.24, bandY, z + 0.66).scale([0.12, Math.max(0.54, bandHeight * 0.72), 0.034]).toJSON(),
    primitives.box({
      name: `side warm window column ${towerIndex + 1}`,
      material: warm
    }).position(x + 0.66, bandY, z - 0.24).scale([0.034, bandHeight, 0.12]).toJSON(),
    primitives.box({
      name: `side cool window column ${towerIndex + 1}`,
      material: cool
    }).position(x + 0.66, bandY, z + 0.24).scale([0.034, Math.max(0.54, bandHeight * 0.72), 0.12]).toJSON(),
    ...sign
  ];
}

function makeBuildingDetails(x: number, z: number, height: number, towerIndex: number, timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const storefrontMaterial = material.emissive({
    color: timeOfDay === "night" ? "#fef3c7" : "#dff6ff",
    emissive: timeOfDay === "night" ? "#fbbf24" : "#7dd3fc"
  });
  const awningMaterial = material.clearcoat({
    color: towerIndex % 2 === 0 ? "#ef4444" : "#2563eb",
    roughness: 0.28,
    clearcoat: 0.75,
    clearcoatRoughness: 0.08
  });
  const roofColor = towerIndex % 2 === 0 ? "#1f2933" : "#26313a";
  const nodes: AuraSceneNode[] = [
    primitives.box({
      name: `rooftop mechanical cap ${towerIndex + 1}`,
      material: material.pbr({ color: roofColor, roughness: 0.74, metallic: 0.08 })
    }).position(x - 0.28, height + 0.08, z - 0.2).scale([0.34, 0.16, 0.38]).toJSON(),
    primitives.box({
      name: `street-level lit storefront ${towerIndex + 1}`,
      material: storefrontMaterial
    }).position(x, 0.26, z + 0.67).scale([0.72, 0.22, 0.038]).toJSON(),
    primitives.box({
      name: `striped storefront awning ${towerIndex + 1}`,
      material: awningMaterial
    }).position(x, 0.44, z + 0.71).rotate(-0.16, 0, 0).scale([0.82, 0.055, 0.18]).toJSON(),
    primitives.box({
      name: `street address plaque ${towerIndex + 1}`,
      material: material.emissive({ color: "#f8fafc", emissive: timeOfDay === "night" ? "#dbeafe" : "#93c5fd" })
    }).position(x - 0.42, 0.38, z + 0.713).scale([0.12, 0.08, 0.024]).toJSON(),
    primitives.box({
      name: `dark vertical facade reveal ${towerIndex + 1}`,
      material: material.pbr({ color: "#111827", roughness: 0.8, metallic: 0.02 })
    }).position(x - 0.01, Math.max(0.65, height * 0.5), z + 0.692).scale([0.035, Math.max(0.75, height * 0.62), 0.026]).toJSON()
  ];

  if (towerIndex % 5 === 2) {
    nodes.push(primitives.cylinder({
      name: `round rooftop water tank ${towerIndex + 1}`,
      material: material.metal({ color: "#576574", roughness: 0.36 })
    }).position(x + 0.32, height + 0.18, z + 0.24).scale([0.16, 0.25, 0.16]).toJSON());
  }

  if (towerIndex % 6 === 1) {
    nodes.push(primitives.box({
      name: `thin rooftop antenna ${towerIndex + 1}`,
      material: material.metal({ color: "#d1d5db", roughness: 0.22 })
    }).position(x + 0.36, height + 0.52, z - 0.36).scale([0.025, 0.72, 0.025]).toJSON());
  }

  return nodes;
}

function makeCityVehicle(name: string, x: number, z: number, color: AuraColor, rotation = 0): AuraSceneNode[] {
  return [
    primitives.box({
      name: `${name} car body`,
      material: material.clearcoat({ color, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.08 })
    }).position(x, 0.115, z).rotate(0, rotation, 0).scale([0.42, 0.15, 0.22]).toJSON(),
    primitives.box({
      name: `${name} windshield`,
      material: material.glass({ color: "#bdefff", opacity: 0.56, transmission: 0.65 })
    }).position(x, 0.22, z).rotate(0, rotation, 0).scale([0.2, 0.09, 0.17]).toJSON(),
    primitives.box({
      name: `${name} headlight pair`,
      material: material.emissive({ color: "#fff7cc", emissive: "#fff7cc" })
    }).position(x + Math.sin(rotation) * 0.24, 0.15, z + Math.cos(rotation) * 0.24).rotate(0, rotation, 0).scale([0.2, 0.035, 0.028]).toJSON()
  ];
}

export interface AuraSolarSystemPrefabOptions {
  readonly orbitSegments?: number;
  readonly starCount?: number;
  readonly labels?: "attached" | "none";
}

export interface AuraPrimitiveHumanoidPrefabOptions {
  readonly showJoints?: boolean;
  readonly motionTrail?: boolean;
}

export const prefabs = {
  particleFountain: (options: { readonly color?: AuraColor; readonly count?: number } = {}): readonly AuraSceneNode[] => [
    primitives.plane({ name: "wide particle collision ground plane", material: material.pbr({ color: "#101923", roughness: 0.78, metallic: 0.04 }) }).position(0, -0.02, 0).scale([4.6, 1, 4.6]).toJSON(),
    primitives.cylinder({ name: "painted particle collision splash ring", material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", opacity: 0.52 }) }).position(0, 0.012, 0).scale([1.42, 0.012, 1.42]).toJSON(),
    primitives.cylinder({ name: "visible particle emitter base", material: material.metal({ color: "#263747", roughness: 0.2 }) }).position(0, 0.035, 0).scale([0.62, 0.09, 0.62]).toJSON(),
    primitives.sphere({ name: "fountain glow core", material: material.emissive({ color: options.color ?? "#7dfcff", emissive: options.color ?? "#7dfcff" }) }).position(0, 0.2, 0).scale(0.16).toJSON(),
    primitives.box({ name: "emission rate control slider track", material: material.pbr({ color: "#cbd5e1", roughness: 0.42 }) }).position(-1.95, 0.08, 1.92).scale([1.05, 0.04, 0.06]).toJSON(),
    primitives.box({ name: "emission rate control knob high", material: material.emissive({ color: "#facc15", emissive: "#facc15" }) }).position(-1.48, 0.16, 1.92).scale([0.12, 0.18, 0.12]).toJSON(),
    primitives.box({ name: "hot young particle color swatch", material: material.emissive({ color: "#fff7ad", emissive: "#fff7ad" }) }).position(1.74, 0.08, 1.9).scale([0.18, 0.11, 0.08]).toJSON(),
    primitives.box({ name: "cool old particle color swatch", material: material.emissive({ color: "#60a5fa", emissive: "#60a5fa" }) }).position(2.0, 0.08, 1.9).scale([0.18, 0.11, 0.08]).toJSON(),
    effects.particles({ name: "lifetime colored gravity fountain arcs", emitter: "fountain", color: options.color ?? "#7dfcff", particleCount: options.count ?? 1800, radius: 1.5, height: 3.18, intensity: 1.48, speed: 1.12 }).toJSON(),
    effects.particles({ name: "falling collision sparkle particles", emitter: "fountain", color: "#ff7ad9", particleCount: Math.round((options.count ?? 1800) * 0.42), radius: 1.7, height: 1.25, intensity: 1.18, speed: 1.28 }).toJSON(),
    effects.particles({ name: "multicolor particle cloud halo", emitter: "swirl", color: "#ff7ad9", particleCount: Math.round((options.count ?? 1800) * 0.55), radius: 1.95, height: 1.9, intensity: 1.18, speed: 0.72 }).toJSON(),
    effects.bloom({ intensity: 0.55, color: options.color ?? "#7dfcff" }).toJSON()
  ],

  cityBlock: (options: { readonly blocks?: number; readonly litWindows?: boolean; readonly timeOfDay?: CityBlockTimeOfDay } = {}): readonly AuraSceneNode[] => {
    const blocks = Math.max(3, Math.min(30, options.blocks ?? 20));
    const timeOfDay = options.timeOfDay ?? "night";
    const road = material.pbr({ color: "#171b1d", roughness: 0.78 });
    const sideRoad = material.pbr({ color: "#202528", roughness: 0.78 });
    const sidewalk = material.pbr({ color: "#94a3b8", roughness: 0.84, metallic: 0.02 });
    const curb = material.emissive({ color: "#d9e4ef", emissive: "#bcd2e5" });
    const nodes: AuraSceneNode[] = [
      primitives.plane({ name: "asphalt street grid", material: material.pbr({ color: timeOfDay === "night" ? "#2f3a37" : "#9fb49b", roughness: 0.86, metallic: 0.02 }) }).position(0, -0.04, 0).scale([20, 1, 20]).toJSON(),
      primitives.box({ name: "main north south road", material: road }).position(0, 0.012, 0).scale([0.44, 0.024, 10.8]).toJSON(),
      primitives.box({ name: "main east west road", material: road }).position(0, 0.014, 0).scale([11.4, 0.024, 0.44]).toJSON(),
      primitives.box({ name: "left city avenue", material: sideRoad }).position(-3.45, 0.013, 0).scale([0.3, 0.022, 10.8]).toJSON(),
      primitives.box({ name: "right city avenue", material: sideRoad }).position(2.55, 0.013, 0).scale([0.3, 0.022, 10.8]).toJSON(),
      primitives.box({ name: "front cross street", material: sideRoad }).position(0, 0.015, -2.7).scale([11.4, 0.022, 0.3]).toJSON(),
      primitives.box({ name: "back cross street", material: sideRoad }).position(0, 0.015, 2.55).scale([11.4, 0.022, 0.3]).toJSON(),
      primitives.box({ name: "northwest raised sidewalk slab", material: sidewalk }).position(-1.76, 0.006, 1.32).scale([2.42, 0.036, 1.76]).toJSON(),
      primitives.box({ name: "northeast raised sidewalk slab", material: sidewalk }).position(1.66, 0.006, 1.32).scale([2.24, 0.036, 1.76]).toJSON(),
      primitives.box({ name: "southwest raised sidewalk slab", material: sidewalk }).position(-1.76, 0.006, -1.42).scale([2.42, 0.036, 1.82]).toJSON(),
      primitives.box({ name: "southeast raised sidewalk slab", material: sidewalk }).position(1.66, 0.006, -1.42).scale([2.24, 0.036, 1.82]).toJSON(),
      primitives.box({ name: "central intersection curb north", material: curb }).position(0, 0.052, 0.62).scale([1.32, 0.028, 0.035]).toJSON(),
      primitives.box({ name: "central intersection curb south", material: curb }).position(0, 0.052, -0.62).scale([1.32, 0.028, 0.035]).toJSON(),
      primitives.box({ name: "central intersection curb west", material: curb }).position(-0.62, 0.052, 0).scale([0.035, 0.028, 1.32]).toJSON(),
      primitives.box({ name: "central intersection curb east", material: curb }).position(0.62, 0.052, 0).scale([0.035, 0.028, 1.32]).toJSON(),
      primitives.box({ name: "left road stripe", material: material.emissive({ color: "#f7d66b", emissive: "#f7d66b" }) }).position(-0.18, 0.032, 0).scale([0.035, 0.02, 15.2]).toJSON(),
      primitives.box({ name: "right road stripe", material: material.emissive({ color: "#f7d66b", emissive: "#f7d66b" }) }).position(0.18, 0.032, 0).scale([0.035, 0.02, 15.2]).toJSON(),
      primitives.box({ name: "cross street white line", material: material.emissive({ color: "#e8eef5", emissive: "#e8eef5" }) }).position(0, 0.034, 0.24).scale([15.4, 0.02, 0.035]).toJSON(),
      ...makeCityCrosswalk("zebra crosswalk near", 0, -0.34, "northSouth"),
      ...makeCityCrosswalk("zebra crosswalk far", 0, 0.72, "northSouth"),
      ...makeCityCrosswalk("zebra crosswalk west", -0.72, 0, "eastWest"),
      ...makeCityCrosswalk("zebra crosswalk east", 0.72, 0, "eastWest")
    ];
    const xSlots = [-4.25, -2.58, -0.95, 1.45, 3.3];
    const zSlots = [-4, -1.45, 1.3, 3.65];
    for (let index = 0; index < blocks; index += 1) {
      const col = index % 5;
      const row = Math.floor(index / 5);
      const x = xSlots[col] ?? ((col - 2) * 1.85);
      const z = zSlots[row] ?? (-4 + row * 2.25);
      const height = 1.15 + ((index * 7) % 6) * 0.45 + (col === 0 || col === 4 ? 0.25 : 0);
      const color = index % 3 === 0 ? "#6c7a7e" : index % 3 === 1 ? "#8a7558" : "#415665";
      nodes.push(primitives.box({
        name: `city tower ${index + 1}`,
        material: material.pbr({ color, roughness: 0.68, metallic: 0.06 })
      }).position(x, height / 2, z).scale([1.08, height, 1.08]).toJSON());
      if (options.litWindows !== false) {
        nodes.push(...makeBuildingWindowRows(x, z, height, index, timeOfDay));
      }
      nodes.push(...makeBuildingDetails(x, z, height, index, timeOfDay));
    }
    const lampPositions: AuraVec3[] = [
      [-1.15, 0, 0.85], [1.15, 0, 0.85], [-1.15, 0, -0.85], [1.15, 0, -0.85],
      [-3.85, 0, -2.05], [-2.95, 0, 2.05], [2.05, 0, -2.05], [3.05, 0, 2.05],
      [-5.15, 0, 0.15], [4.25, 0, -0.15], [-0.2, 0, -3.18], [0.2, 0, 3.05]
    ];
    for (let index = 0; index < lampPositions.length; index += 1) {
      const [x, , z] = lampPositions[index];
      nodes.push(primitives.cylinder({ name: `street light pole ${index + 1}`, material: material.metal({ color: "#6f7d86", roughness: 0.32 }) }).position(x, 0.34, z).scale([0.035, 0.68, 0.035]).toJSON());
      nodes.push(primitives.sphere({ name: `warm street lamp ${index + 1}`, material: material.emissive({ color: "#ffd98a", emissive: "#ffd98a" }) }).position(x, 0.74, z).scale(0.09).toJSON());
    }
    nodes.push(
      ...makeCityVehicle("red northbound", -0.18, -1.7, "#ef4444", 0),
      ...makeCityVehicle("blue southbound", 0.2, 1.78, "#2563eb", 3.1416),
      ...makeCityVehicle("yellow crosstown taxi", -2.0, 0.22, "#facc15", 1.5708),
      ...makeCityVehicle("white crosstown van", 2.0, -0.22, "#f8fafc", -1.5708),
      primitives.box({ name: "foreground day night state board", material: material.pbr({ color: "#08111f", roughness: 0.48, metallic: 0.16 }) }).position(-1.38, 0.22, 4.92).scale([1.72, 0.22, 0.08]).toJSON(),
      primitives.sphere({ name: "large day sun state marker", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-2.0, 0.58, 4.9).scale(0.22).toJSON(),
      primitives.sphere({ name: "large night moon state marker", material: material.emissive({ color: "#dbeafe", emissive: "#93c5fd" }) }).position(-0.76, 0.58, 4.9).scale(0.22).toJSON(),
      primitives.box({
        name: timeOfDay === "night" ? "foreground active night state bar" : "foreground active day state bar",
        material: material.emissive({ color: timeOfDay === "night" ? "#93c5fd" : "#fde047", emissive: timeOfDay === "night" ? "#93c5fd" : "#fde047" })
      }).position(timeOfDay === "night" ? -0.76 : -2.0, 0.34, 4.82).scale([0.42, 0.06, 0.045]).toJSON(),
      primitives.box({ name: "night streetlight glow proof strip", material: material.emissive({ color: timeOfDay === "night" ? "#fbbf24" : "#fde68a", emissive: timeOfDay === "night" ? "#fbbf24" : "#fde68a" }) }).position(1.36, 0.045, 3.72).scale([1.1, 0.018, 0.16]).toJSON(),
      primitives.box({ name: "day night toggle pedestal", material: material.pbr({ color: "#0f172a", roughness: 0.62, metallic: 0.08 }) }).position(-4.95, 0.09, 4.82).scale([0.88, 0.16, 0.34]).toJSON(),
      primitives.sphere({ name: "gold sun icon on day night toggle", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-5.28, 0.32, 4.82).scale(0.16).toJSON(),
      primitives.sphere({ name: "silver moon icon on day night toggle", material: material.emissive({ color: "#dbeafe", emissive: "#93c5fd" }) }).position(-4.62, 0.32, 4.82).scale(0.16).toJSON(),
      primitives.box({
        name: timeOfDay === "night" ? "active night state toggle knob" : "active day state toggle knob",
        material: material.emissive({ color: timeOfDay === "night" ? "#93c5fd" : "#fde047", emissive: timeOfDay === "night" ? "#93c5fd" : "#fde047" })
      }).position(timeOfDay === "night" ? -4.62 : -5.28, 0.2, 4.48).scale([0.26, 0.08, 0.12]).toJSON(),
      primitives.box({ name: "red traffic signal over intersection", material: material.emissive({ color: "#ef4444", emissive: "#ef4444" }) }).position(-0.58, 0.9, -0.58).scale([0.11, 0.11, 0.035]).toJSON(),
      primitives.box({ name: "green traffic signal over intersection", material: material.emissive({ color: "#22c55e", emissive: "#22c55e" }) }).position(0.58, 0.9, 0.58).scale([0.11, 0.11, 0.035]).toJSON()
    );
    return nodes;
  },

  materialSwatches: (): readonly AuraSceneNode[] => [
    primitives.box({ name: "matte studio floor for material comparison", material: material.pbr({ color: "#8a95a3", roughness: 0.5, metallic: 0.04 }) }).position(0, -0.03, -0.72).scale([8.1, 0.14, 2.35]).toJSON(),
    primitives.box({ name: "split material reflection wall", material: material.pbr({ color: "#d8e2ee", roughness: 0.28, metallic: 0.04 }) }).position(0, 1.08, -1.82).scale([8.1, 2.18, 0.08]).toJSON(),
    primitives.box({ name: "white softbox reflection strip", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(0, 2.18, -1.72).scale([6.6, 0.18, 0.08]).toJSON(),
    primitives.box({ name: "black reflection contrast strip", material: material.pbr({ color: "#05070d", roughness: 0.18, metallic: 0.24 }) }).position(0, 1.78, -1.69).scale([6.1, 0.12, 0.08]).toJSON(),
    primitives.box({ name: "cool blue environment reflection panel", material: material.emissive({ color: "#77e6ff", emissive: "#77e6ff" }) }).position(-3.55, 1.12, -1.24).rotate(0, 0.16, 0).scale([0.08, 1.18, 1.38]).toJSON(),
    primitives.box({ name: "warm gold environment reflection panel", material: material.emissive({ color: "#ffd18a", emissive: "#ffd18a" }) }).position(3.55, 1.12, -1.24).rotate(0, -0.16, 0).scale([0.08, 1.18, 1.38]).toJSON(),
    primitives.box({ name: "chrome bright reflection card", material: material.emissive({ color: "#f8fbff", emissive: "#f8fbff" }) }).position(-2.8, 1.55, -0.14).rotate(0, 0.06, -0.18).scale([0.76, 0.05, 0.06]).toJSON(),
    primitives.box({ name: "chrome dark reflection card", material: material.pbr({ color: "#030712", roughness: 0.12, metallic: 0.25 }) }).position(-2.8, 1.32, -0.12).rotate(0, 0.06, -0.18).scale([0.62, 0.045, 0.06]).toJSON(),
    primitives.sphere({ name: "mirror chrome metal swatch", material: material.metal({ color: "#f4fbff", roughness: 0.025, clearcoat: 0.18, envMapIntensity: 1.75 }) }).position(-2.8, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "transparent cyan glass swatch", material: material.glass({ color: "#95eaff", opacity: 0.22, transmission: 1, thickness: 0.9, attenuationDistance: 0.68 }) }).position(-1.4, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "matte charcoal rubber swatch", material: material.rubber({ color: "#171a22", roughness: 0.99 }) }).position(0, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "emissive magenta swatch", material: material.emissive({ color: "#ff42c8", emissive: "#ff42c8", roughness: 0.12 }) }).position(1.4, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "emissive magenta glow halo", material: material.emissive({ color: "#7a0f5c", emissive: "#ff42c8", opacity: 0.28 }) }).position(1.4, 0.9, -0.83).scale([1.32, 1.32, 0.035]).toJSON(),
    primitives.sphere({ name: "red automotive clearcoat swatch", material: material.clearcoat({ color: "#ef233c", roughness: 0.045, clearcoat: 1, clearcoatRoughness: 0.018, envMapIntensity: 1.55 }) }).position(2.8, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "transparent clearcoat outer gloss layer", material: material.clearcoat({ color: "#ffffff", opacity: 0.16, roughness: 0.015, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2.0 }) }).position(2.8, 0.9, -0.72).scale(1.15).toJSON(),
    primitives.box({ name: "clearcoat white topcoat highlight", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(2.72, 1.34, -0.13).rotate(0, -0.1, -0.22).scale([0.72, 0.055, 0.05]).toJSON(),
    primitives.box({ name: "clearcoat amber base reflection", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(2.94, 1.12, -0.14).rotate(0, -0.1, -0.22).scale([0.48, 0.04, 0.045]).toJSON(),
    primitives.box({ name: "metal label plinth", material: material.emissive({ color: "#dff4ff", emissive: "#dff4ff" }) }).position(-2.8, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "glass label plinth", material: material.emissive({ color: "#7dd3fc", emissive: "#7dd3fc" }) }).position(-1.4, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "rubber label plinth", material: material.emissive({ color: "#475569", emissive: "#475569" }) }).position(0, 0.18, 0.38).scale([1.0, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "emissive label plinth", material: material.emissive({ color: "#ff42c8", emissive: "#ff42c8" }) }).position(1.4, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "clearcoat label plinth", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(2.8, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "glass white contrast card", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(-1.55, 0.9, -1.5).scale([0.42, 0.58, 0.04]).toJSON(),
    primitives.box({ name: "glass dark contrast card", material: material.pbr({ color: "#020617", roughness: 0.26, metallic: 0.12 }) }).position(-1.18, 0.9, -1.5).scale([0.42, 0.58, 0.04]).toJSON(),
    primitives.box({ name: "glass refracted white stripe", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(-1.42, 1.2, -1.47).scale([0.06, 0.88, 0.035]).toJSON(),
    primitives.box({ name: "glass refracted dark stripe", material: material.pbr({ color: "#05070d", roughness: 0.22, metallic: 0.1 }) }).position(-1.31, 0.9, -1.46).scale([0.06, 0.7, 0.035]).toJSON(),
    primitives.box({ name: "rubber roughness sample strip", material: material.pbr({ color: "#334155", roughness: 1, metallic: 0 }) }).position(-0.18, 1.38, -0.12).rotate(0, 0.02, 0.2).scale([0.42, 0.035, 0.04]).toJSON(),
    primitives.box({ name: "rubber diffuse edge strip", material: material.pbr({ color: "#0b0f16", roughness: 1, metallic: 0 }) }).position(0.2, 1.18, -0.11).rotate(0, -0.02, -0.18).scale([0.34, 0.032, 0.04]).toJSON(),
    effects.bloom({ intensity: 0.24, color: "#ff42c8" }).toJSON()
  ],

  productStage: (): readonly AuraSceneNode[] => [
    primitives.plane({ name: "clean studio backdrop sweep", material: material.pbr({ color: "#f1f5f9", roughness: 0.48, metallic: 0.01 }) }).position(0, 1.02, -2.85).rotate(1.5708, 0, 0).scale([6.4, 1, 3.2]).toJSON(),
    primitives.cylinder({ name: "round white product inspection plinth", material: material.clearcoat({ color: "#f8fafc", roughness: 0.16 }) }).position(0, 0.26, -0.65).scale([3.7, 0.52, 3.7]).toJSON(),
    primitives.cylinder({ name: "soft elliptical contact shadow", material: material.pbr({ color: "#020617", roughness: 0.94, opacity: 0.36 }) }).position(0, 0.535, -0.65).scale([2.05, 0.014, 1.08]).toJSON(),
    primitives.cylinder({ name: "thin brushed turntable rotation ring", material: material.pbr({ color: "#dbeafe", roughness: 0.22, metallic: 0.12, opacity: 0.22 }) }).position(0, 0.526, -0.65).scale([2.84, 0.008, 2.84]).toJSON(),
    primitives.cylinder({ name: "cyan orbit control arc", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9", opacity: 0.34 }) }).position(0, 0.572, -0.65).scale([3.08, 0.006, 3.08]).toJSON(),
    primitives.box({ name: "front turntable rotation tick", material: material.emissive({ color: "#8fefff", emissive: "#8fefff" }) }).position(0, 0.562, 0.62).scale([0.42, 0.018, 0.045]).toJSON(),
    primitives.box({ name: "left turntable rotation tick", material: material.emissive({ color: "#8fefff", emissive: "#8fefff" }) }).position(-1.28, 0.562, -0.65).rotate(0, 1.5708, 0).scale([0.42, 0.018, 0.045]).toJSON(),
    primitives.box({ name: "right turntable rotation tick", material: material.emissive({ color: "#ffd29a", emissive: "#ffd29a" }) }).position(1.28, 0.562, -0.65).rotate(0, 1.5708, 0).scale([0.42, 0.018, 0.045]).toJSON(),
    primitives.box({ name: "fit to bounds centerline guide", material: material.emissive({ color: "#7dd3fc", emissive: "#7dd3fc", opacity: 0.38 }) }).position(0, 1.22, -0.65).scale([0.035, 1.34, 0.035]).toJSON(),
    primitives.box({ name: "left normalized asset height bracket", material: material.emissive({ color: "#bae6fd", emissive: "#bae6fd", opacity: 0.42 }) }).position(-0.96, 1.28, -0.64).scale([0.035, 1.48, 0.04]).toJSON(),
    primitives.box({ name: "right normalized asset height bracket", material: material.emissive({ color: "#bae6fd", emissive: "#bae6fd", opacity: 0.42 }) }).position(0.96, 1.28, -0.64).scale([0.035, 1.48, 0.04]).toJSON(),
    primitives.box({ name: "top normalized asset fit bracket", material: material.emissive({ color: "#bae6fd", emissive: "#bae6fd", opacity: 0.42 }) }).position(0, 2.0, -0.64).scale([1.96, 0.035, 0.04]).toJSON(),
    primitives.box({ name: "left vertical studio softbox", material: material.emissive({ color: "#f8fbff", emissive: "#f8fbff" }) }).position(-2.58, 1.32, -1.18).scale([0.07, 1.52, 1.56]).toJSON(),
    primitives.box({ name: "right warm rim softbox", material: material.emissive({ color: "#ffe2b8", emissive: "#ffe2b8" }) }).position(2.45, 1.08, -1.1).scale([0.07, 1.12, 1.38]).toJSON(),
    primitives.box({ name: "overhead rectangular softbox reflection", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(0, 2.52, -0.9).rotate(0.08, 0, 0).scale([1.88, 0.08, 0.62]).toJSON(),
    primitives.box({ name: "rear cool reflection card", material: material.emissive({ color: "#bdefff", emissive: "#bdefff" }) }).position(-1.62, 1.08, -2.1).rotate(0, 0.18, 0).scale([0.68, 0.9, 0.045]).toJSON(),
    primitives.box({ name: "rear warm reflection card", material: material.emissive({ color: "#ffd7a3", emissive: "#ffd7a3" }) }).position(1.62, 1.0, -2.08).rotate(0, -0.18, 0).scale([0.62, 0.82, 0.045]).toJSON(),
    primitives.box({ name: "front low product highlight card", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(0, 0.58, 0.62).scale([1.18, 0.045, 0.04]).toJSON()
  ],

  physicsRamp: (): readonly AuraSceneNode[] => [
    primitives.box({ name: "rigid physics ramp", material: material.pbr({ color: "#2c3642", roughness: 0.52, metallic: 0.12 }) }).position(-0.35, 0.28, -0.8).rotate(0, 0, -0.42).scale([2.4, 0.16, 0.82]).toJSON(),
    primitives.box({ name: "static catch platform", material: material.pbr({ color: "#151b22", roughness: 0.62, metallic: 0.08 }) }).position(0.65, 0.02, -0.55).scale([2.4, 0.12, 1.2]).toJSON(),
    primitives.box({ name: "settled rigid body cube 1", material: material.clearcoat({ color: "#6ee7ff" }) }).position(0.18, 0.22, -0.58).rotate(0.12, 0.34, 0.08).scale(0.24).toJSON(),
    primitives.box({ name: "settled rigid body cube 2", material: material.clearcoat({ color: "#ffd166" }) }).position(0.52, 0.22, -0.42).rotate(-0.18, 0.2, -0.12).scale(0.24).toJSON(),
    primitives.box({ name: "settled rigid body cube 3", material: material.clearcoat({ color: "#ef476f" }) }).position(0.82, 0.22, -0.72).rotate(0.08, -0.28, 0.2).scale(0.24).toJSON()
  ],

  physicsPlayground: (options: { readonly cubes?: number } = {}): readonly AuraSceneNode[] => {
    const count = Math.max(12, Math.min(80, options.cubes ?? 50));
    const nodes: AuraSceneNode[] = [
      primitives.plane({ name: "physics contact grid floor", material: material.pbr({ color: "#0b1118", roughness: 0.82, metallic: 0.04 }) }).position(0.35, -0.04, -0.68).scale([4.8, 1, 3.25]).toJSON(),
      primitives.box({ name: "wide tilted collision ramp", material: material.pbr({ color: "#2c3948", roughness: 0.5, metallic: 0.1 }) }).position(-0.35, 0.34, -0.8).rotate(0, 0, -0.34).scale([3.4, 0.16, 1.35]).toJSON(),
      primitives.box({ name: "lower catch platform", material: material.pbr({ color: "#141b23", roughness: 0.64, metallic: 0.06 }) }).position(0.86, 0.04, -0.68).scale([2.6, 0.12, 1.65]).toJSON(),
      primitives.box({ name: "gravity direction arrow shaft", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9" }) }).position(-1.9, 1.15, -0.95).rotate(0, 0, 1.5708).scale([0.58, 0.035, 0.04]).toJSON(),
      primitives.box({ name: "gravity direction arrow head", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9" }) }).position(-1.9, 0.78, -0.95).rotate(0, 0, 0.82).scale([0.18, 0.035, 0.04]).toJSON(),
      primitives.cylinder({ name: "bright collision contact patch", material: material.emissive({ color: "#ff5151", emissive: "#ff5151" }) }).position(0.48, 0.13, -0.78).scale([0.72, 0.018, 0.42]).toJSON()
    ];
    const palette = ["#f97316", "#38bdf8", "#a3e635", "#f43f5e", "#facc15", "#c084fc"];
    for (let index = 0; index < count; index += 1) {
      const col = index % 10;
      const row = Math.floor(index / 10);
      const isFalling = index < 8;
      const x = isFalling ? -1.65 + col * 0.32 : -1.45 + col * 0.32 + (row % 2) * 0.08;
      const y = isFalling ? 1.12 + (index % 4) * 0.18 : 0.34 + row * 0.22 + (col % 3) * 0.045;
      const z = isFalling ? -1.28 + (index % 4) * 0.2 : -1.22 + (index % 5) * 0.22;
      nodes.push(primitives.box({
        name: `${isFalling ? "falling" : "settled"} visible rigid body cube ${index + 1}`,
        material: material.clearcoat({ color: palette[index % palette.length], roughness: 0.2 })
      }).position(x, y, z).rotate(index * 0.08, index * 0.13, index * 0.05).scale(0.18).animate(isFalling ? { clip: "float", speed: 0.42 + index * 0.03 } : { clip: "pulse", speed: 0.12 }).toJSON());
      if (isFalling) {
        nodes.push(primitives.box({
          name: `fall path streak ${index + 1}`,
          material: material.emissive({ color: palette[index % palette.length], emissive: palette[index % palette.length] })
        }).position(x - 0.08, y - 0.24, z).rotate(0, 0, -0.34).scale([0.035, 0.46, 0.035]).toJSON());
      }
    }
    for (let index = 0; index < 8; index += 1) {
      nodes.push(primitives.box({
        name: `red contact normal vector ${index + 1}`,
        material: material.emissive({ color: "#ff5151", emissive: "#ff5151" })
      }).position(0.02 + index * 0.16, 0.44 + index * 0.025, -1.22 + (index % 4) * 0.2).rotate(0, 0, -0.58).scale([0.035, 0.32, 0.035]).toJSON());
    }
    return nodes;
  },

  solarSystem: (options: AuraSolarSystemPrefabOptions = {}): readonly AuraSceneNode[] => {
    const orbitSegments = Math.max(16, Math.min(48, options.orbitSegments ?? 24));
    const starCount = Math.max(18, Math.min(80, options.starCount ?? 42));
    const labels = options.labels ?? "attached";
    const planets = [
      { name: "Mercury", radius: 0.82, size: 0.09, color: "#cbd5e1", speed: 1.4, angle: 0.2 },
      { name: "Venus", radius: 1.12, size: 0.12, color: "#fbbf24", speed: 1.1, angle: 1.05 },
      { name: "Earth", radius: 1.46, size: 0.13, color: "#38bdf8", speed: 0.86, angle: 2.0 },
      { name: "Mars", radius: 1.78, size: 0.105, color: "#f97316", speed: 0.68, angle: 2.82 },
      { name: "Jupiter", radius: 2.18, size: 0.22, color: "#f5d0a9", speed: 0.42, angle: 3.7 },
      { name: "Saturn", radius: 2.6, size: 0.19, color: "#fde68a", speed: 0.32, angle: 4.56 }
    ] as const;
    const nodes: AuraSceneNode[] = [
      primitives.sphere({ name: "glowing labeled sun", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(0, 0.14, 0).scale(0.44).animate({ clip: "pulse", speed: 0.32 }).toJSON(),
      primitives.sphere({ name: "transparent golden sun corona", material: material.emissive({ color: "#ff9f1c", emissive: "#ffd166", opacity: 0.32 }) }).position(0, 0.14, 0).scale(0.76).animate({ clip: "pulse", speed: 0.22 }).toJSON(),
      primitives.sphere({ name: "wide amber solar glow halo", material: material.emissive({ color: "#7c2d12", emissive: "#f97316", opacity: 0.18 }) }).position(0, 0.14, 0).scale(1.08).animate({ clip: "pulse", speed: 0.18 }).toJSON(),
      lights.point({ name: "warm solar key light", position: [0, 0.72, 0], color: "#ffd166", intensity: 1.9 }).toJSON(),
      effects.bloom({ intensity: 0.72, color: "#ffd166" }).toJSON()
    ];
    for (let index = 0; index < starCount; index += 1) {
      nodes.push(primitives.sphere({
        name: `background star ${index + 1}`,
        material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" })
      }).position(seededRange(index, 701, -3.45, 3.45), seededRange(index, 702, 0.12, 1.2), seededRange(index, 703, -3.35, 3.05)).scale(seededRange(index, 704, 0.012, 0.034)).toJSON());
    }
    for (const planet of planets) {
      const segmentLength = (Math.PI * 2 * planet.radius) / orbitSegments * 0.58;
      for (let segment = 0; segment < orbitSegments; segment += 1) {
        const angle = (segment / orbitSegments) * Math.PI * 2;
        nodes.push(primitives.box({
          name: `${planet.name} orbit path segment ${segment + 1}`,
          material: material.emissive({ color: "#64748b", emissive: "#475569", opacity: 0.78 })
        }).position(Math.cos(angle) * planet.radius, 0.012, Math.sin(angle) * planet.radius).rotate(0, Math.PI / 2 - angle, 0).scale([segmentLength, 0.014, 0.02]).toJSON());
      }
      const x = Math.cos(planet.angle) * planet.radius;
      const z = Math.sin(planet.angle) * planet.radius;
      nodes.push(primitives.sphere({
        name: `${planet.name} labeled orbiting planet`,
        material: material.clearcoat({ color: planet.color, roughness: 0.18 })
      }).position(x, 0.14, z).scale(planet.size).animate({ clip: "float", speed: planet.speed }).toJSON());
      if (labels === "attached") {
        const labelDirection = x >= 0 ? 1 : -1;
        const labelX = x + labelDirection * (0.34 + planet.size * 0.95);
        const labelZ = z + 0.18;
        nodes.push(
          primitives.box({
            name: `${planet.name} attached label leader line`,
            material: material.emissive({ color: planet.color, emissive: planet.color, opacity: 0.88 })
          }).position((x + labelX) / 2, 0.19, (z + labelZ) / 2).rotate(0, labelDirection > 0 ? -0.26 : 0.26, 0).scale([Math.abs(labelX - x), 0.018, 0.022]).toJSON(),
          primitives.box({
            name: `${planet.name} visible label plinth`,
            material: material.emissive({ color: planet.color, emissive: planet.color })
          }).position(labelX, 0.095, labelZ).scale([0.34 + planet.name.length * 0.035, 0.035, 0.09]).toJSON(),
          primitives.plane({
            name: `${planet.name} readable planet label`,
            material: material.emissive({ color: "#020617", emissive: planet.color, opacity: 0.94 })
          }).position(labelX, 0.34, labelZ).scale([0.52 + planet.name.length * 0.06, 1, 0.2]).toJSON()
        );
      }
    }
    nodes.push(primitives.cylinder({
      name: "Saturn visible ring",
      material: material.emissive({ color: "#fde68a", emissive: "#fde68a" })
    }).position(Math.cos(4.56) * 2.6, 0.14, Math.sin(4.56) * 2.6).rotate(0.9, 0.2, 0.1).scale([0.4, 0.012, 0.4]).toJSON());
    nodes.push(
      primitives.box({ name: "Jupiter visible equator band", material: material.emissive({ color: "#b45309", emissive: "#b45309" }) }).position(Math.cos(3.7) * 2.18, 0.16, Math.sin(3.7) * 2.18 + 0.01).scale([0.34, 0.026, 0.035]).toJSON(),
      primitives.sphere({ name: "Earth small moon", material: material.emissive({ color: "#e2e8f0", emissive: "#cbd5e1" }) }).position(Math.cos(2.0) * 1.46 + 0.22, 0.17, Math.sin(2.0) * 1.46 + 0.08).scale(0.035).animate({ clip: "float", speed: 1.2 }).toJSON()
    );
    return nodes;
  },

  dataBars3D: (options: { readonly grid?: number } = {}): readonly AuraSceneNode[] => {
    const grid = Math.max(3, Math.min(8, options.grid ?? 6));
    const halfSpan = ((grid - 1) / 2) * 0.58;
    const floorSpan = Math.max(4.3, grid * 0.72);
    const maxHeight = 2.37;
    const nodes: AuraSceneNode[] = [
      primitives.plane({ name: "matte chart floor", material: material.pbr({ color: "#16242a", roughness: 0.68, metallic: 0.08 }) }).position(0, -0.025, 0).scale([floorSpan, 1, floorSpan]).toJSON(),
      primitives.box({ name: "dark rear chart wall", material: material.pbr({ color: "#0b1217", roughness: 0.52, metallic: 0.1, opacity: 0.72 }) }).position(0, 1.12, -halfSpan - 0.55).scale([floorSpan, 2.3, 0.055]).toJSON(),
      primitives.box({ name: "left analytics side wall", material: material.pbr({ color: "#101923", roughness: 0.58, metallic: 0.08, opacity: 0.58 }) }).position(-halfSpan - 0.55, 1.0, 0).scale([0.055, 2.0, floorSpan]).toJSON(),
      primitives.box({ name: "x axis rail", material: material.emissive({ color: "#d9f8ff", emissive: "#d9f8ff" }) }).position(0, 0.025, halfSpan + 0.36).scale([floorSpan - 0.55, 0.035, 0.035]).toJSON(),
      primitives.box({ name: "z axis rail", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-halfSpan - 0.36, 0.025, 0).scale([0.035, 0.035, floorSpan - 0.55]).toJSON(),
      primitives.box({ name: "height axis rail", material: material.emissive({ color: "#f4fbff", emissive: "#f4fbff" }) }).position(-halfSpan - 0.36, maxHeight / 2, halfSpan + 0.36).scale([0.04, maxHeight, 0.04]).toJSON(),
      primitives.box({ name: "selected metric callout slab", material: material.glass({ color: "#dff8ff", opacity: 0.18, transmission: 0.55, thickness: 0.2 }) }).position(halfSpan + 0.44, 1.45, -halfSpan - 0.48).rotate(0, -0.34, 0).scale([1.08, 0.48, 0.045]).toJSON(),
      primitives.box({ name: "selected metric callout title bar", material: material.emissive({ color: "#8ff3ff", emissive: "#8ff3ff" }) }).position(halfSpan + 0.44, 1.66, -halfSpan - 0.43).rotate(0, -0.34, 0).scale([0.82, 0.05, 0.035]).toJSON(),
      primitives.box({ name: "selected metric callout value bar", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(halfSpan + 0.44, 1.42, -halfSpan - 0.43).rotate(0, -0.34, 0).scale([0.58, 0.08, 0.035]).toJSON()
    ];
    // Dense grid rails, back-wall ticks, caps, shadows, and a trend ribbon make
    // the prefab read as an authored analytics scene rather than raw boxes.
    for (let index = 0; index < grid; index += 1) {
      const offset = (index - (grid - 1) / 2) * 0.58;
      nodes.push(primitives.box({
        name: `x grid floor guide ${index + 1}`,
        material: material.emissive({ color: "#244b5a", emissive: "#2e7187" })
      }).position(offset, 0.004, 0).scale([0.018, 0.012, floorSpan - 0.8]).toJSON());
      nodes.push(primitives.box({
        name: `z grid floor guide ${index + 1}`,
        material: material.emissive({ color: "#5f5228", emissive: "#8a7636" })
      }).position(0, 0.006, offset).scale([floorSpan - 0.8, 0.012, 0.018]).toJSON());
      nodes.push(primitives.box({
        name: `column label chip ${index + 1}`,
        material: material.emissive({ color: index % 2 === 0 ? "#7dd3fc" : "#c084fc", emissive: index % 2 === 0 ? "#7dd3fc" : "#c084fc" })
      }).position(offset, 0.07, halfSpan + 0.58).scale([0.28, 0.055, 0.09]).toJSON());
      nodes.push(primitives.box({
        name: `row label chip ${index + 1}`,
        material: material.emissive({ color: index % 2 === 0 ? "#fde68a" : "#fb7185", emissive: index % 2 === 0 ? "#fde68a" : "#fb7185" })
      }).position(-halfSpan - 0.58, 0.07, offset).scale([0.09, 0.055, 0.28]).toJSON());
    }
    for (let tick = 1; tick <= 4; tick += 1) {
      const y = tick * 0.52;
      nodes.push(primitives.box({
        name: `height tick ${tick} back wall line`,
        material: material.emissive({ color: "#44606f", emissive: "#5f8498" })
      }).position(0, y, -halfSpan - 0.51).scale([floorSpan - 0.85, 0.018, 0.028]).toJSON());
      nodes.push(primitives.box({
        name: `height tick ${tick} marker chip`,
        material: material.emissive({ color: "#e2e8f0", emissive: "#e2e8f0" })
      }).position(-halfSpan - 0.48, y, halfSpan + 0.36).scale([0.16, 0.034, 0.05]).toJSON());
    }
    const trendPoints: Array<{ readonly x: number; readonly y: number; readonly z: number; readonly color: AuraColor }> = [];
    for (let row = 0; row < grid; row += 1) {
      let rowPeak = 0;
      let rowPeakColumn = 0;
      for (let col = 0; col < grid; col += 1) {
        const normalized = ((row * 5 + col * 7) % 17) / 16;
        const height = 0.32 + normalized * 2.05;
        const x = (col - (grid - 1) / 2) * 0.58;
        const z = (row - (grid - 1) / 2) * 0.58;
        const color = dataBarColor(normalized);
        if (height > rowPeak) {
          rowPeak = height;
          rowPeakColumn = col;
        }
        nodes.push(primitives.box({
          name: `soft data bar footprint ${row + 1}-${col + 1}`,
          material: material.pbr({ color: "#020617", roughness: 0.94, opacity: 0.34 })
        }).position(x, 0.012, z).scale([0.44, 0.014, 0.44]).toJSON());
        nodes.push(primitives.box({
          name: `glowing data bar base ${row + 1}-${col + 1}`,
          material: material.emissive({ color, emissive: color })
        }).position(x, 0.045, z).scale([0.44, 0.035, 0.44]).toJSON());
        nodes.push(primitives.box({
          name: `height-colored data bar ${row + 1}-${col + 1}`,
          material: material.clearcoat({
            color,
            emissive: color,
            roughness: 0.24,
            clearcoat: 0.62
          })
        }).position(x, height / 2, z).scale([0.36, height, 0.36]).animate({ clip: "pulse", speed: 0.24 + normalized * 0.36 }).onPointer({ cursor: "pointer", onHover: "highlight bar and show value" }).toJSON());
        nodes.push(primitives.box({
          name: `bright data bar top cap ${row + 1}-${col + 1}`,
          material: material.emissive({ color, emissive: color })
        }).position(x, height + 0.035, z).scale([0.4, 0.052, 0.4]).animate({ clip: "pulse", speed: 0.18 + normalized * 0.3 }).toJSON());
        if (normalized > 0.72) {
          nodes.push(primitives.sphere({
            name: `hotspot value marker ${row + 1}-${col + 1}`,
            material: material.emissive({ color: "#ffffff", emissive: color })
          }).position(x, height + 0.18, z).scale(0.09).animate({ clip: "float", speed: 0.26 + normalized * 0.22 }).toJSON());
        }
      }
      const peakX = (rowPeakColumn - (grid - 1) / 2) * 0.58;
      const peakZ = (row - (grid - 1) / 2) * 0.58;
      trendPoints.push({ x: peakX, y: rowPeak + 0.18, z: peakZ, color: dataBarColor(Math.min(1, (rowPeak - 0.32) / 2.05)) });
    }
    for (let index = 0; index < trendPoints.length - 1; index += 1) {
      const current = trendPoints[index];
      const next = trendPoints[index + 1];
      const dx = next.x - current.x;
      const dz = next.z - current.z;
      const length = Math.hypot(dx, dz);
      nodes.push(primitives.box({
        name: `floating trend ribbon segment ${index + 1}`,
        material: material.emissive({ color: current.color, emissive: current.color })
      }).position((current.x + next.x) / 2, (current.y + next.y) / 2, (current.z + next.z) / 2).rotate(0, Math.atan2(dz, dx), 0).scale([Math.max(0.28, length), 0.045, 0.055]).toJSON());
    }
    nodes.push(effects.bloom({ intensity: 0.32, color: "#7dd3fc" }).toJSON());
    return nodes;
  },

  neonTunnel: (options: { readonly rings?: number } = {}): readonly AuraSceneNode[] => {
    const rings = Math.max(8, Math.min(28, options.rings ?? 16));
    const nodes: AuraSceneNode[] = [
      primitives.plane({ name: "glossy black neon tunnel floor", material: material.pbr({ color: "#05070d", roughness: 0.24, metallic: 0.16 }) }).position(0, -0.49, -3.8).scale([4.7, 1, 8.4]).toJSON(),
      primitives.box({ name: "left vanishing light rail", material: material.emissive({ color: "#1591ff", emissive: "#1591ff" }) }).position(-1.05, -0.38, -3.55).rotate(0, -0.08, 0).scale([0.045, 0.035, 7.4]).toJSON(),
      primitives.box({ name: "right vanishing light rail", material: material.emissive({ color: "#ff42c8", emissive: "#ff42c8" }) }).position(1.05, -0.38, -3.55).rotate(0, 0.08, 0).scale([0.045, 0.035, 7.4]).toJSON(),
      primitives.box({ name: "center perspective lane glow", material: material.emissive({ color: "#1f5f75", emissive: "#2d98ba" }) }).position(0, -0.47, -3.55).scale([0.035, 0.024, 7.2]).toJSON(),
      primitives.box({ name: "distant portal glow panel", material: material.emissive({ color: "#28174f", emissive: "#713dff" }) }).position(0, 0.42, -9.92).scale([1.24, 1.24, 0.05]).toJSON()
    ];
    const palette = ["#22d3ee", "#ff42c8", "#ffd166", "#8b5cf6"];
    // Each ring is an octagonal doorway with corner braces, reflections, and
    // speed dashes so the default screenshot reads as a finished flythrough.
    for (let index = 0; index < rings; index += 1) {
      const z = -0.3 - index * 0.34;
      const scale = 1 + index * 0.035;
      const color = palette[index % palette.length];
      const mat = material.emissive({ color, emissive: color });
      const sideGlow = palette[(index + 1) % palette.length];
      nodes.push(primitives.box({ name: `neon tunnel top segment ${index + 1}`, material: mat }).position(0, 1.22 * scale, z).scale([1.8 * scale, 0.055, 0.05]).animate({ clip: "pulse", speed: 0.18 + (index % 4) * 0.05 }).toJSON());
      nodes.push(primitives.box({ name: `neon tunnel bottom segment ${index + 1}`, material: mat }).position(0, -0.42 * scale, z).scale([1.8 * scale, 0.055, 0.05]).animate({ clip: "pulse", speed: 0.18 + (index % 4) * 0.05 }).toJSON());
      nodes.push(primitives.box({ name: `neon tunnel left segment ${index + 1}`, material: mat }).position(-0.92 * scale, 0.4, z).scale([0.055, 1.6 * scale, 0.05]).animate({ clip: "pulse", speed: 0.2 + (index % 3) * 0.04 }).toJSON());
      nodes.push(primitives.box({ name: `neon tunnel right segment ${index + 1}`, material: mat }).position(0.92 * scale, 0.4, z).scale([0.055, 1.6 * scale, 0.05]).animate({ clip: "pulse", speed: 0.2 + (index % 3) * 0.04 }).toJSON());
      nodes.push(primitives.box({ name: `neon tunnel upper left diagonal brace ${index + 1}`, material: material.emissive({ color: sideGlow, emissive: sideGlow }) }).position(-0.65 * scale, 0.98 * scale, z).rotate(0, 0, -0.78).scale([0.58 * scale, 0.042, 0.048]).toJSON());
      nodes.push(primitives.box({ name: `neon tunnel upper right diagonal brace ${index + 1}`, material: material.emissive({ color: sideGlow, emissive: sideGlow }) }).position(0.65 * scale, 0.98 * scale, z).rotate(0, 0, 0.78).scale([0.58 * scale, 0.042, 0.048]).toJSON());
      nodes.push(primitives.box({ name: `neon tunnel lower left diagonal brace ${index + 1}`, material: material.emissive({ color: sideGlow, emissive: sideGlow }) }).position(-0.65 * scale, -0.18 * scale, z).rotate(0, 0, 0.78).scale([0.52 * scale, 0.038, 0.048]).toJSON());
      nodes.push(primitives.box({ name: `neon tunnel lower right diagonal brace ${index + 1}`, material: material.emissive({ color: sideGlow, emissive: sideGlow }) }).position(0.65 * scale, -0.18 * scale, z).rotate(0, 0, -0.78).scale([0.52 * scale, 0.038, 0.048]).toJSON());
      nodes.push(primitives.box({ name: `floor reflection streak ${index + 1}`, material: material.emissive({ color, emissive: color, opacity: 0.44 }) }).position(0, -0.465, z + 0.06).scale([1.25 * scale, 0.018, 0.09]).toJSON());
      if (index % 2 === 0) {
        nodes.push(primitives.box({ name: `left wall speed dash ${index + 1}`, material: material.emissive({ color: "#dff8ff", emissive: color }) }).position(-1.28 * scale, 0.62, z + 0.08).scale([0.32, 0.035, 0.04]).toJSON());
        nodes.push(primitives.box({ name: `right wall speed dash ${index + 1}`, material: material.emissive({ color: "#ffe3fb", emissive: sideGlow }) }).position(1.28 * scale, 0.2, z - 0.06).scale([0.32, 0.035, 0.04]).toJSON());
      }
    }
    for (let index = 0; index < 14; index += 1) {
      const color = palette[index % palette.length];
      nodes.push(primitives.sphere({
        name: `floating tunnel spark ${index + 1}`,
        material: material.emissive({ color, emissive: color })
      }).position(seededRange(index, 901, -0.72, 0.72), seededRange(index, 902, -0.14, 0.98), seededRange(index, 903, -8.2, -0.8)).scale(seededRange(index, 904, 0.022, 0.045)).animate({ clip: "float", speed: seededRange(index, 905, 0.18, 0.42) }).toJSON());
    }
    nodes.push(effects.fog({ density: 0.2, color: "#3b4f7a" }).toJSON());
    nodes.push(effects.particles({ name: "ambient tunnel dust particles", emitter: "ambient", color: "#a5f3fc", particleCount: 900, radius: 2.2, height: 1.4, intensity: 0.45, speed: 0.38 }).toJSON());
    nodes.push(effects.bloom({ intensity: 0.72, color: "#ff42c8" }).toJSON());
    return nodes;
  },

  miniGolfHole: (): readonly AuraSceneNode[] => [
    primitives.plane({ name: "flat putting green", material: material.pbr({ color: "#2f8f48", roughness: 0.62 }) }).position(0, -0.03, -0.4).scale([5.2, 1, 3.4]).toJSON(),
    primitives.box({ name: "left course boundary wall", material: material.pbr({ color: "#14532d", roughness: 0.72 }) }).position(-2.52, 0.12, -0.4).scale([0.08, 0.22, 3.28]).toJSON(),
    primitives.box({ name: "right course boundary wall", material: material.pbr({ color: "#14532d", roughness: 0.72 }) }).position(2.52, 0.12, -0.4).scale([0.08, 0.22, 3.28]).toJSON(),
    primitives.box({ name: "back course boundary wall", material: material.pbr({ color: "#14532d", roughness: 0.72 }) }).position(0, 0.12, -2.08).scale([5.05, 0.22, 0.08]).toJSON(),
    primitives.box({ name: "tee mat", material: material.pbr({ color: "#166534", roughness: 0.56 }) }).position(-1.35, 0.012, 0.45).scale([0.72, 0.024, 0.46]).toJSON(),
    primitives.cylinder({ name: "single red obstacle", material: material.clearcoat({ color: "#e11d48", roughness: 0.18 }) }).position(0.35, 0.28, -0.65).scale([0.34, 0.56, 0.34]).toJSON(),
    primitives.cylinder({ name: "orange obstacle contact flash", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", opacity: 0.72 }) }).position(0.18, 0.58, -0.36).rotate(1.2, 0, 0.18).scale([0.18, 0.012, 0.18]).toJSON(),
    primitives.cylinder({ name: "ball contact shadow on green", material: material.pbr({ color: "#052e16", roughness: 0.9, opacity: 0.42 }) }).position(-1.35, 0.018, 0.45).scale([0.24, 0.01, 0.18]).toJSON(),
    primitives.sphere({ name: "white physics golf ball", material: material.clearcoat({ color: "#f8fafc", roughness: 0.12 }) }).position(-1.35, 0.16, 0.45).scale(0.16).animate({ clip: "roll", speed: 0.72 }).onPointer({ cursor: "crosshair", onClick: "aim and shoot ball" }).toJSON(),
    primitives.sphere({ name: "transparent moving ball ghost 1", material: material.clearcoat({ color: "#dbeafe", roughness: 0.16, opacity: 0.36 }) }).position(-0.84, 0.135, 0.16).scale(0.12).toJSON(),
    primitives.sphere({ name: "transparent moving ball ghost 2", material: material.clearcoat({ color: "#93c5fd", roughness: 0.18, opacity: 0.26 }) }).position(-0.32, 0.135, -0.18).scale(0.1).toJSON(),
    primitives.sphere({ name: "transparent moving ball ghost 3", material: material.clearcoat({ color: "#67e8f9", roughness: 0.2, opacity: 0.18 }) }).position(0.2, 0.135, -0.48).scale(0.085).toJSON(),
    primitives.cylinder({ name: "ball aim selection ring", material: material.emissive({ color: "#e0f2fe", emissive: "#e0f2fe" }) }).position(-1.35, 0.035, 0.45).scale([0.34, 0.014, 0.34]).toJSON(),
    primitives.box({ name: "cyan aim direction line", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9" }) }).position(-0.86, 0.08, 0.16).rotate(0, -0.42, 0).scale([0.9, 0.035, 0.055]).toJSON(),
    primitives.box({ name: "shot power meter track", material: material.pbr({ color: "#082f49", roughness: 0.56 }) }).position(-2.08, 0.075, 0.72).scale([0.08, 0.04, 0.86]).toJSON(),
    primitives.box({ name: "shot power meter fill", material: material.emissive({ color: "#22c55e", emissive: "#22c55e" }) }).position(-2.08, 0.13, 0.5).scale([0.1, 0.08, 0.42]).toJSON(),
    primitives.box({ name: "click drag control marker", material: material.emissive({ color: "#fde68a", emissive: "#fde68a" }) }).position(-1.76, 0.08, 0.82).rotate(0, -0.74, 0).scale([0.42, 0.03, 0.05]).toJSON(),
    primitives.box({ name: "dotted shot preview 1", material: material.emissive({ color: "#bae6fd", emissive: "#bae6fd" }) }).position(-0.56, 0.07, -0.02).rotate(0, -0.42, 0).scale([0.22, 0.026, 0.04]).toJSON(),
    primitives.box({ name: "dotted shot preview 2", material: material.emissive({ color: "#bae6fd", emissive: "#bae6fd" }) }).position(-0.22, 0.07, -0.22).rotate(0, -0.42, 0).scale([0.22, 0.026, 0.04]).toJSON(),
    primitives.box({ name: "rebound path preview after obstacle", material: material.emissive({ color: "#fef08a", emissive: "#fef08a" }) }).position(0.78, 0.07, -0.84).rotate(0, 0.42, 0).scale([0.48, 0.028, 0.045]).toJSON(),
    primitives.cylinder({ name: "dark cup hole", material: material.pbr({ color: "#050608", roughness: 0.9 }) }).position(1.55, 0.012, -1.1).scale([0.2, 0.02, 0.2]).toJSON(),
    primitives.cylinder({ name: "cup capture ring", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(1.55, 0.026, -1.1).scale([0.28, 0.012, 0.28]).toJSON(),
    primitives.box({ name: "flag pole", material: material.metal({ color: "#f8fafc" }) }).position(1.7, 0.48, -1.1).scale([0.025, 0.9, 0.025]).toJSON(),
    primitives.box({ name: "orange flag", material: material.emissive({ color: "#fb923c", emissive: "#fb923c" }) }).position(1.9, 0.78, -1.1).scale([0.32, 0.18, 0.035]).toJSON(),
    primitives.box({ name: "score counter plinth", material: material.emissive({ color: "#fef3c7", emissive: "#fef3c7" }) }).position(-1.92, 0.08, -1.86).scale([0.62, 0.06, 0.18]).toJSON(),
    primitives.box({ name: "score counter stroke digit bar", material: material.pbr({ color: "#0f172a", roughness: 0.44 }) }).position(-1.92, 0.18, -1.86).scale([0.055, 0.22, 0.035]).toJSON(),
    primitives.sphere({ name: "follow camera target beacon above ball", material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", opacity: 0.58 }) }).position(-1.35, 0.62, 0.45).scale(0.065).toJSON()
  ],

  primitiveHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => {
    const showJoints = options.showJoints ?? true;
    const motionTrail = options.motionTrail ?? true;
    const nodes: AuraSceneNode[] = [
    primitives.plane({ name: "walk cycle ground plane", material: material.pbr({ color: "#1f5130", roughness: 0.7 }) }).position(0, -0.04, -0.5).scale([4.8, 1, 3]).toJSON(),
    primitives.box({ name: "painted walking path", material: material.pbr({ color: "#2d3748", roughness: 0.78 }) }).position(0, 0.01, -0.45).scale([3.8, 0.025, 0.42]).toJSON(),
    primitives.box({ name: "white dashed stride marker 1", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(-1.05, 0.04, -0.45).scale([0.42, 0.025, 0.045]).toJSON(),
    primitives.box({ name: "white dashed stride marker 2", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(0.05, 0.04, -0.45).scale([0.42, 0.025, 0.045]).toJSON(),
    primitives.box({ name: "white dashed stride marker 3", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(1.15, 0.04, -0.45).scale([0.42, 0.025, 0.045]).toJSON(),
    primitives.box({ name: "cyan walk motion arrow shaft", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9" }) }).position(0.76, 0.06, -0.23).rotate(0, -0.18, 0).scale([0.58, 0.025, 0.035]).toJSON(),
    primitives.box({ name: "cyan walk motion arrow head", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9" }) }).position(1.07, 0.06, -0.17).rotate(0, -0.18, -0.72).scale([0.18, 0.025, 0.035]).toJSON(),
    primitives.cylinder({ name: "humanoid contact shadow", material: material.pbr({ color: "#050608", roughness: 0.94, opacity: 0.48 }) }).position(0.04, 0.035, -0.5).scale([0.82, 0.018, 0.5]).toJSON(),
    primitives.cylinder({ name: "connected blue humanoid torso", material: material.clearcoat({ color: "#2563eb", roughness: 0.16 }) }).position(0, 0.92, -0.55).scale([0.34, 0.78, 0.28]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.cylinder({ name: "short humanoid neck connector", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.22 }) }).position(0, 1.36, -0.55).scale([0.13, 0.24, 0.13]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.sphere({ name: "humanoid head", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.2 }) }).position(0, 1.55, -0.55).scale(0.27).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.sphere({ name: "left humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a" }) }).position(-0.075, 1.59, -0.3).scale(0.035).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.sphere({ name: "right humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a" }) }).position(0.075, 1.59, -0.3).scale(0.035).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.box({ name: "humanoid mouth line", material: material.emissive({ color: "#7f1d1d", emissive: "#7f1d1d" }) }).position(0, 1.48, -0.285).scale([0.13, 0.018, 0.02]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.box({ name: "shoulder bar connecting arms", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0, 1.16, -0.55).scale([0.82, 0.12, 0.14]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.box({ name: "left swinging arm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(-0.44, 0.9, -0.42).rotate(0.5, 0, -0.2).scale([0.13, 0.62, 0.13]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
    primitives.box({ name: "right swinging arm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0.44, 0.9, -0.68).rotate(-0.5, 0, 0.2).scale([0.13, 0.62, 0.13]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
    primitives.sphere({ name: "left humanoid hand", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.24 }) }).position(-0.5, 0.65, -0.32).scale(0.105).animate({ clip: "walk", speed: 0.9 }).toJSON(),
    primitives.sphere({ name: "right humanoid hand", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.24 }) }).position(0.5, 0.65, -0.8).scale(0.105).animate({ clip: "walk", speed: 0.9 }).toJSON(),
    primitives.box({ name: "hip bar connecting legs", material: material.clearcoat({ color: "#1d4ed8", roughness: 0.2 }) }).position(0, 0.52, -0.55).scale([0.52, 0.12, 0.16]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.box({ name: "forward walking leg", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(-0.18, 0.31, -0.3).rotate(-0.44, 0, -0.08).scale([0.16, 0.76, 0.16]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
    primitives.box({ name: "back walking leg", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(0.2, 0.31, -0.78).rotate(0.44, 0, 0.08).scale([0.16, 0.76, 0.16]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
    primitives.box({ name: "forward foot planted on path", material: material.clearcoat({ color: "#0f172a", roughness: 0.2 }) }).position(-0.35, 0.08, -0.08).rotate(0, -0.12, 0).scale([0.38, 0.1, 0.2]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
    primitives.box({ name: "back foot pushing off path", material: material.clearcoat({ color: "#0f172a", roughness: 0.2 }) }).position(0.38, 0.08, -0.98).rotate(0, 0.12, 0).scale([0.38, 0.1, 0.2]).animate({ clip: "walk", speed: 0.95 }).toJSON()
    ];
    if (showJoints) {
      nodes.push(
        primitives.sphere({ name: "left shoulder ball joint", material: material.clearcoat({ color: "#93c5fd", roughness: 0.16 }) }).position(-0.42, 1.16, -0.55).scale(0.095).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "right shoulder ball joint", material: material.clearcoat({ color: "#93c5fd", roughness: 0.16 }) }).position(0.42, 1.16, -0.55).scale(0.095).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "left elbow hinge", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(-0.48, 0.82, -0.37).scale(0.082).animate({ clip: "walk", speed: 0.9 }).toJSON(),
        primitives.sphere({ name: "right elbow hinge", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0.48, 0.82, -0.73).scale(0.082).animate({ clip: "walk", speed: 0.9 }).toJSON(),
        primitives.sphere({ name: "left hip ball joint", material: material.clearcoat({ color: "#1d4ed8", roughness: 0.18 }) }).position(-0.23, 0.52, -0.55).scale(0.09).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "right hip ball joint", material: material.clearcoat({ color: "#1d4ed8", roughness: 0.18 }) }).position(0.23, 0.52, -0.55).scale(0.09).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "forward knee hinge", material: material.clearcoat({ color: "#172033", roughness: 0.18 }) }).position(-0.26, 0.24, -0.2).scale(0.086).animate({ clip: "walk", speed: 0.95 }).toJSON(),
        primitives.sphere({ name: "back knee hinge", material: material.clearcoat({ color: "#172033", roughness: 0.18 }) }).position(0.28, 0.24, -0.88).scale(0.086).animate({ clip: "walk", speed: 0.95 }).toJSON()
      );
    }
    if (motionTrail) {
      nodes.push(
        primitives.cylinder({ name: "translucent previous stride torso ghost", material: material.emissive({ color: "#1e3a8a", emissive: "#60a5fa", opacity: 0.22 }) }).position(-0.62, 0.84, -0.62).scale([0.24, 0.62, 0.2]).toJSON(),
        primitives.sphere({ name: "translucent previous stride head ghost", material: material.emissive({ color: "#7dd3fc", emissive: "#7dd3fc", opacity: 0.2 }) }).position(-0.62, 1.42, -0.62).scale(0.2).toJSON(),
        primitives.box({ name: "cyan body motion trail ribbon", material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", opacity: 0.36 }) }).position(-0.38, 0.9, -0.64).rotate(0, -0.08, 0).scale([0.74, 0.05, 0.08]).toJSON(),
        primitives.box({ name: "orange forward foot motion streak", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", opacity: 0.58 }) }).position(-0.15, 0.075, -0.22).rotate(0, -0.26, 0).scale([0.62, 0.036, 0.055]).toJSON()
      );
    }
    return nodes;
  }
} as const;

export type AuraPromptSceneType = "product-viewer" | "cinematic-scene" | "mini-game" | "material-studio";
export type AuraPromptEffectId = "rain" | "fog" | "bloom" | "particles" | "wet-reflection" | "motion-trail" | "hud";
export type AuraPromptCameraPreset = "product-orbit" | "cinematic-dolly" | "game-board" | "material-inspection";
export type AuraPromptLightingPreset = "studio-softbox" | "neon-practicals" | "game-readable" | "material-studio";
export type AuraPromptInteractionMode = "orbit" | "keyboard" | "pointer";

export interface AuraPromptPlanSubject {
  readonly asset: AuraAssetRef<"model">;
  readonly label?: string;
}

export interface AuraPromptPlan {
  readonly sceneType: AuraPromptSceneType;
  readonly subject: AuraPromptPlanSubject;
  readonly style?: string;
  readonly environment?: string;
  readonly camera?: {
    readonly preset: AuraPromptCameraPreset;
    readonly note?: string;
  };
  readonly lighting?: {
    readonly preset: AuraPromptLightingPreset;
    readonly note?: string;
  };
  readonly effects?: readonly AuraPromptEffectId[];
  readonly interaction?: AuraPromptInteractionMode;
  readonly acceptanceCriteria: readonly string[];
  readonly negativeCriteria?: readonly string[];
}

export interface AuraPromptPlanReport {
  readonly schema: "aura3d-prompt-plan-report/1.0";
  readonly sceneType: AuraPromptSceneType;
  readonly subjectAssetId: string;
  readonly recipe: AuraPromptSceneType;
  readonly cameraPreset: AuraPromptCameraPreset;
  readonly lightingPreset: AuraPromptLightingPreset;
  readonly effects: readonly AuraPromptEffectId[];
  readonly acceptanceCriteria: readonly string[];
  readonly negativeCriteria: readonly string[];
  readonly warnings: readonly string[];
  readonly visualSystems: readonly string[];
  readonly repairHints: readonly string[];
}

export interface AuraCompiledPromptPlan {
  readonly scene: AuraSceneBuilder;
  readonly report: AuraPromptPlanReport;
}

export function definePromptPlan<const TPlan extends AuraPromptPlan>(plan: TPlan): TPlan {
  return plan;
}

export function compilePromptPlan(plan: AuraPromptPlan): AuraCompiledPromptPlan {
  const sceneBuilder = promptRecipes[plan.sceneType](plan.subject.asset, plan);
  return {
    scene: sceneBuilder,
    report: {
      schema: "aura3d-prompt-plan-report/1.0",
      sceneType: plan.sceneType,
      subjectAssetId: plan.subject.asset.id,
      recipe: plan.sceneType,
      cameraPreset: plan.camera?.preset ?? defaultCameraPreset(plan.sceneType),
      lightingPreset: plan.lighting?.preset ?? defaultLightingPreset(plan.sceneType),
      effects: plan.effects ?? defaultPromptEffects(plan.sceneType),
      acceptanceCriteria: plan.acceptanceCriteria,
      negativeCriteria: plan.negativeCriteria ?? [
        "Do not ship a lone GLB on a grid as product-quality prompt proof.",
        "Do not rely on labels or diagnostics to explain missing visual intent."
      ],
      warnings: promptPlanWarnings(plan),
      visualSystems: visualSystemsForPromptPlan(plan),
      repairHints: repairHintsForPromptPlan(plan)
    }
  };
}

export function promptPlanToScene(plan: AuraPromptPlan): AuraSceneBuilder {
  return compilePromptPlan(plan).scene;
}

export const promptRecipes = {
  "product-viewer": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#070b10")
      .addMany(prefabs.productStage())
      .add(model(asset, { name: plan.subject.label }).position(0, 0.54, -0.65).rotate(0, -0.38, 0).animate({ clip: "turntable", speed: 0.42 }))
      .add(lights.ambient({ intensity: 0.28, color: "#e8f1ff" }))
      .add(lights.studio({ intensity: 1.35 }))
      .add(lights.point({ name: "large cool product softbox", position: [-2.2, 2.45, 2.25], color: "#eef6ff", intensity: 2.75 }))
      .add(lights.point({ name: "front product fill", position: [0.35, 1.25, 2.2], color: "#f7fbff", intensity: 1.8 }))
      .add(lights.point({ name: "warm product rim", position: [2.1, 1.72, 0.15], color: "#ffd09a", intensity: 1.22 }))
      .add(effects.bloom({ intensity: 0.18, color: "#cfefff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.perspective({ position: [1.65, 1.18, 4.0], target: [0, 0.72, -0.65], fov: 38 }))
      .timeline(timeline.loop({ seconds: 8 })),

  "cinematic-scene": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#02040a")
      .add(primitives.plane({ name: "rainy alley back wall", material: material.emissive({ color: "#03070e", emissive: "#050b13" }) }).position(0, 1.06, -2.55).rotate(1.5708, 0, 0).scale([6.25, 1, 3.1]))
      .add(primitives.plane({ name: "black wet asphalt", material: material.pbr({ color: "#03070c", roughness: 0.08, metallic: 0.5 }) }).position(0, -0.07, -0.55).scale([7.0, 1, 5.9]))
      .add(primitives.box({ name: "left alley slab", material: material.pbr({ color: "#03060b", roughness: 0.46, metallic: 0.1 }) }).position(-2.9, 0.9, -0.95).rotate(0, 0.18, 0).scale([0.42, 2.25, 3.25]))
      .add(primitives.box({ name: "right alley slab", material: material.pbr({ color: "#03050a", roughness: 0.46, metallic: 0.1 }) }).position(2.95, 0.92, -1.05).rotate(0, -0.16, 0).scale([0.42, 2.35, 3.15]))
      .add(primitives.box({ name: "foreground left shadow frame", material: material.pbr({ color: "#010207", roughness: 0.5, metallic: 0.05 }) }).position(-3.35, 0.72, 1.0).rotate(0, -0.18, 0).scale([0.5, 1.72, 1.65]))
      .add(primitives.box({ name: "foreground right shadow frame", material: material.pbr({ color: "#010207", roughness: 0.5, metallic: 0.05 }) }).position(3.28, 0.7, 0.96).rotate(0, 0.18, 0).scale([0.5, 1.72, 1.65]))
      .add(primitives.box({ name: "rear door depth plane", material: material.pbr({ color: "#07111c", roughness: 0.35, metallic: 0.18 }) }).position(0.02, 0.6, -2.38).scale([1.14, 1.18, 0.08]))
      .add(primitives.box({ name: "cyan neon sign", material: material.emissive({ color: "#32ddff", emissive: "#32ddff" }) }).position(-2.22, 1.35, -1.55).rotate(0.05, 0, -0.24).scale([0.055, 1.48, 0.12]))
      .add(primitives.box({ name: "short cyan practical", material: material.emissive({ color: "#63eaff", emissive: "#63eaff" }) }).position(-1.82, 0.74, -1.85).rotate(0.05, 0, 0.12).scale([0.045, 0.76, 0.12]))
      .add(primitives.sphere({ name: "warm street practical", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.86, 0.78, -1.28).scale(0.34))
      .add(primitives.box({ name: "amber wet reflection", material: material.emissive({ color: "#b36d39", emissive: "#c77f45" }) }).position(1.62, -0.005, -0.42).rotate(0, -0.08, 0).scale([0.86, 0.035, 0.24]))
      .add(primitives.box({ name: "cyan wet reflection", material: material.emissive({ color: "#1a6d86", emissive: "#2398b7" }) }).position(-1.22, -0.005, -0.34).rotate(0, 0.16, 0).scale([0.72, 0.03, 0.18]))
      .add(primitives.box({ name: "long cyan puddle streak", material: material.emissive({ color: "#0f4356", emissive: "#1b8ba8" }) }).position(-0.34, -0.002, 0.28).rotate(0, 0.22, 0).scale([1.18, 0.026, 0.12]))
      .add(primitives.box({ name: "warm puddle streak", material: material.emissive({ color: "#835331", emissive: "#be7a43" }) }).position(0.9, -0.002, 0.12).rotate(0, -0.16, 0).scale([0.92, 0.026, 0.13]))
      .add(primitives.sphere({ name: "rain splash foreground", material: material.emissive({ color: "#c8f4ff", emissive: "#c8f4ff" }) }).position(-0.88, 0.035, 0.72).scale([0.07, 0.018, 0.07]))
      .add(primitives.sphere({ name: "rain splash key side", material: material.emissive({ color: "#ffe1ad", emissive: "#ffe1ad" }) }).position(1.14, 0.035, 0.44).scale([0.08, 0.018, 0.08]))
      .add(model(asset, { name: plan.subject.label }).position(-0.08, 0.02, -0.86).rotate(-0.08, -0.74, 0.02).scale(1.48))
      .add(lights.ambient({ intensity: 0.07, color: "#839dc6" }))
      .add(lights.point({ name: "hard cyan rim", position: [-2.35, 2.65, 0.85], color: "#38d6ff", intensity: 3.25 }))
      .add(lights.point({ name: "warm practical key", position: [2.35, 1.7, -0.25], color: "#ffd08a", intensity: 1.6 }))
      .add(lights.point({ name: "low floor bounce", position: [0.1, 0.45, 1.1], color: "#7edfff", intensity: 0.62 }))
      .add(effects.rain({ intensity: 0.46, color: "#c3e6ff" }))
      .add(effects.fog({ density: 0.08, color: "#32435a" }))
      .add(effects.bloom({ intensity: 0.36, color: "#6edfff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.dolly({ from: [0.46, 1.05, 4.28], to: [0.08, 0.86, 3.14], target: [-0.08, 0.56, -0.86], seconds: 8, fov: 39 }))
      .timeline(timeline.loop({ seconds: 8 })),

  "mini-game": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#030711")
      .add(primitives.plane({ name: "neon game board", material: material.pbr({ color: "#10222d", roughness: 0.5, metallic: 0.16 }) }).position(0, -0.08, -0.35).scale([5.8, 1, 4.05]))
      .add(primitives.box({ name: "north glass rail", material: material.emissive({ color: "#1b5e70", emissive: "#228aa4" }) }).position(0, 0.18, -2.18).scale([5.85, 0.32, 0.14]))
      .add(primitives.box({ name: "south glass rail", material: material.pbr({ color: "#18313e", roughness: 0.42, metallic: 0.12 }) }).position(0, 0.18, 1.52).scale([5.85, 0.32, 0.14]))
      .add(primitives.box({ name: "left glass rail", material: material.pbr({ color: "#172f3c", roughness: 0.42, metallic: 0.12 }) }).position(-2.76, 0.18, -0.35).scale([0.14, 0.32, 3.86]))
      .add(primitives.box({ name: "right glass rail", material: material.emissive({ color: "#1b5e70", emissive: "#228aa4" }) }).position(2.76, 0.18, -0.35).scale([0.14, 0.32, 3.86]))
      .add(primitives.box({ name: "hud score panel", material: material.pbr({ color: "#06131a", roughness: 0.34, metallic: 0.18 }) }).position(-1.82, 0.075, 1.05).scale([1.2, 0.045, 0.24]))
      .add(primitives.sphere({ name: "health pip 1", material: material.emissive({ color: "#5cff87", emissive: "#5cff87" }) }).position(-2.28, 0.17, 1.06).scale(0.12))
      .add(primitives.sphere({ name: "health pip 2", material: material.emissive({ color: "#5cff87", emissive: "#5cff87" }) }).position(-2.02, 0.17, 1.06).scale(0.12))
      .add(primitives.sphere({ name: "health pip 3", material: material.emissive({ color: "#5cff87", emissive: "#5cff87" }) }).position(-1.76, 0.17, 1.06).scale(0.12))
      .add(primitives.box({ name: "timer bar", material: material.emissive({ color: "#55e7ff", emissive: "#55e7ff" }) }).position(-0.22, 0.11, 1.04).scale([1.18, 0.052, 0.1]))
      .add(primitives.box({ name: "objective bar", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(1.34, 0.11, 1.04).scale([0.96, 0.052, 0.1]))
      .add(primitives.box({ name: "start lane glow", material: material.emissive({ color: "#55e7ff", emissive: "#55e7ff" }) }).position(-1.98, 0.03, 0.62).scale([0.94, 0.045, 0.15]))
      .add(primitives.box({ name: "center lane stripe", material: material.emissive({ color: "#225f75", emissive: "#2c91ad" }) }).position(0.1, 0.025, 0.3).rotate(0, -0.28, 0).scale([1.75, 0.035, 0.08]))
      .add(model(asset, { name: plan.subject.label ?? "player" }).position(-1.42, 0.02, 0.54).rotate(0, 0.72, 0).scale(0.74))
      .add(primitives.box({ name: "orange boost pack", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(-1.08, 0.42, 0.48).rotate(0, 0.52, 0).scale([0.28, 0.08, 0.12]))
      .add(primitives.sphere({ name: "player shield ring", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-1.42, 0.08, 0.54).scale([0.72, 0.06, 0.72]))
      .add(primitives.box({ name: "cyan motion trail", material: material.emissive({ color: "#4fd7ff", emissive: "#4fd7ff" }) }).position(-2.08, 0.1, 0.58).scale([0.82, 0.075, 0.16]))
      .add(primitives.box({ name: "route arrow shaft", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-0.86, 0.08, 0.18).rotate(0, -0.42, 0).scale([0.86, 0.04, 0.08]))
      .add(primitives.box({ name: "route arrow head", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-0.42, 0.1, -0.04).rotate(0, -0.42, 0.78).scale([0.28, 0.045, 0.08]))
      .add(primitives.box({ name: "danger floor plate", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(-0.18, 0.055, -0.58).rotate(0, 0.08, 0).scale([0.92, 0.04, 0.2]))
      .add(primitives.box({ name: "moving red hazard", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(-0.18, 0.34, -0.18).rotate(0, 0.56, 0).scale([0.86, 0.58, 0.38]))
      .add(primitives.sphere({ name: "hazard warning pulse", material: material.emissive({ color: "#ff2a42", emissive: "#ff2a42" }) }).position(-0.18, 0.84, -0.18).scale(0.22))
      .add(primitives.box({ name: "laser gate lower", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(0.95, 0.22, -0.9).rotate(0, -0.14, 0).scale([1.02, 0.075, 0.1]))
      .add(primitives.box({ name: "laser gate upper", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(0.95, 0.58, -0.9).rotate(0, -0.14, 0).scale([1.02, 0.075, 0.1]))
      .add(primitives.sphere({ name: "coin 1", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(-0.42, 0.48, 0.8).scale(0.34))
      .add(primitives.sphere({ name: "coin 2", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(0.48, 0.48, 0.18).scale(0.34))
      .add(primitives.sphere({ name: "coin 3", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(1.26, 0.48, -0.62).scale(0.34))
      .add(primitives.box({ name: "goal portal left", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(1.72, 0.48, -1.22).scale([0.14, 0.92, 0.18]))
      .add(primitives.box({ name: "goal portal right", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(2.12, 0.48, -1.22).scale([0.14, 0.92, 0.18]))
      .add(primitives.box({ name: "goal portal top", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.92, 0.94, -1.22).scale([0.52, 0.12, 0.18]))
      .add(lights.ambient({ intensity: 0.16, color: "#b3f7ff" }))
      .add(lights.point({ name: "arena key", position: [-1.55, 2.1, 1.6], color: "#8ef6ff", intensity: 2.25 }))
      .add(lights.point({ name: "goal glow", position: [2.0, 1.16, -1.2], color: "#ff9d5c", intensity: 2.0 }))
      .add(effects.bloom({ intensity: 0.28, color: "#9af0ff" }))
      .add(interactionNode(plan.interaction ?? "keyboard", "player"))
      .camera(camera.perspective({ position: [0, 3.22, 4.38], target: [0, 0.26, -0.42], fov: 39 }))
      .timeline(timeline.loop({ seconds: 6 })),

  "material-studio": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#080a0d")
      .add(primitives.plane({ name: "neutral material studio floor", material: material.pbr({ color: "#1b1f24", roughness: 0.32, metallic: 0.08 }) }).position(0, -0.08, -0.5).scale([6.0, 1, 3.6]))
      .add(model(asset, { name: plan.subject.label }).position(-1.25, 0.02, -0.72).rotate(-0.08, -0.42, 0).scale(0.92))
      .add(primitives.sphere({ name: "matte swatch", material: material.pbr({ color: "#c7d2e2", roughness: 0.88, metallic: 0 }) }).position(0.3, 0.5, -0.85).scale(0.44))
      .add(primitives.sphere({ name: "metal swatch", material: material.pbr({ color: "#dde8f2", roughness: 0.18, metallic: 0.86 }) }).position(1.08, 0.5, -0.85).scale(0.44))
      .add(primitives.sphere({ name: "emissive swatch", material: material.emissive({ color: "#ff4bd8", emissive: "#ff4bd8", roughness: 0.22 }) }).position(1.86, 0.5, -0.85).scale(0.44))
      .add(lights.ambient({ intensity: 0.22, color: "#edf4ff" }))
      .add(lights.point({ name: "large material softbox", position: [-1.8, 2.35, 2.25], color: "#f4f8ff", intensity: 2.45 }))
      .add(lights.point({ name: "material rim", position: [2.2, 1.6, 0.4], color: "#ffc98f", intensity: 1.2 }))
      .add(effects.bloom({ intensity: 0.2, color: "#f4f8ff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.perspective({ position: [0.15, 1.35, 4.1], target: [0.25, 0.45, -0.75], fov: 43 }))
      .timeline(timeline.loop({ seconds: 8 }))
} as const;

function interactionNode(mode: AuraPromptInteractionMode, target?: string): AuraNodeBuilder<AuraInteractionNode> {
  if (mode === "keyboard") return interactions.keyboard({ target });
  if (mode === "pointer") return interactions.pointer({ target });
  return interactions.orbit({ target });
}

function defaultCameraPreset(sceneType: AuraPromptSceneType): AuraPromptCameraPreset {
  if (sceneType === "cinematic-scene") return "cinematic-dolly";
  if (sceneType === "mini-game") return "game-board";
  if (sceneType === "material-studio") return "material-inspection";
  return "product-orbit";
}

function defaultLightingPreset(sceneType: AuraPromptSceneType): AuraPromptLightingPreset {
  if (sceneType === "cinematic-scene") return "neon-practicals";
  if (sceneType === "mini-game") return "game-readable";
  if (sceneType === "material-studio") return "material-studio";
  return "studio-softbox";
}

function defaultPromptEffects(sceneType: AuraPromptSceneType): readonly AuraPromptEffectId[] {
  if (sceneType === "cinematic-scene") return ["rain", "fog", "bloom", "wet-reflection"];
  if (sceneType === "mini-game") return ["motion-trail", "hud", "bloom"];
  if (sceneType === "material-studio") return ["bloom"];
  return ["bloom"];
}

function visualSystemsForPromptPlan(plan: AuraPromptPlan): readonly string[] {
  const systems = [
    `${plan.sceneType} recipe`,
    `${plan.camera?.preset ?? defaultCameraPreset(plan.sceneType)} camera`,
    `${plan.lighting?.preset ?? defaultLightingPreset(plan.sceneType)} lighting`
  ];
  for (const effect of plan.effects ?? defaultPromptEffects(plan.sceneType)) {
    systems.push(`${effect} effect`);
  }
  return systems;
}

function repairHintsForPromptPlan(plan: AuraPromptPlan): readonly string[] {
  const shared = [
    "If the screenshot reads as one asset plus decoration, add foreground, midground, and background structure before promoting it.",
    "If the subject is small or off-center, use a tighter camera preset, move the subject into the focal area, and recapture the screenshot.",
    "If lighting is flat, add a key, fill, and rim light with visibly different color or intensity.",
    "If the prompt effect is only symbolic, replace it with layered scene geometry, reflections, fog, glow, or state feedback that is visible in the screenshot."
  ];
  if (plan.sceneType === "product-viewer") {
    return [
      ...shared,
      "For product viewers, add plinth/table contact, reflection cards, a clean backdrop, and inspection/orbit controls.",
      "Do not mark product quality until the asset reads as a deliberate product hero without diagnostics text."
    ];
  }
  if (plan.sceneType === "cinematic-scene") {
    return [
      ...shared,
      "For cinematic scenes, add depth layers, practical light sources, wet floor response, fog/haze separation, and a composed dolly camera.",
      "Do not mark product quality if rain is only a few lines over a centered model."
    ];
  }
  if (plan.sceneType === "mini-game") {
    return [
      ...shared,
      "For mini-games, add visible player state, HUD-like score/health cues, hazards, collectibles, a goal, and interaction feedback.",
      "Do not mark product quality if the scene is just a character plus random primitive obstacles."
    ];
  }
  return [
    ...shared,
    "For material studios, add controlled swatches, labels or layout cues, reflection environment, texture previews, and consistent inspection lighting.",
    "Do not mark product quality until material differences are visible without reading code."
  ];
}

function promptPlanWarnings(plan: AuraPromptPlan): readonly string[] {
  const warnings: string[] = [];
  const acceptanceCriteria = plan.acceptanceCriteria.map((item) => item.trim()).filter(Boolean);
  if (!plan.subject.label?.trim()) {
    warnings.push("PromptPlan subject is missing a human-readable label; add one so reports and diagnostics describe the visible subject.");
  }
  if (!plan.style?.trim()) {
    warnings.push("PromptPlan style is missing; specify the visual tone so the recipe does not rely only on defaults.");
  }
  if (!plan.environment?.trim()) {
    warnings.push("PromptPlan environment is missing; specify the surrounding space so the output is not a lone asset.");
  }
  if (!plan.camera?.preset) {
    warnings.push(`PromptPlan camera preset is missing; defaulted to ${defaultCameraPreset(plan.sceneType)}.`);
  }
  if (!plan.lighting?.preset) {
    warnings.push(`PromptPlan lighting preset is missing; defaulted to ${defaultLightingPreset(plan.sceneType)}.`);
  }
  if (!plan.effects || plan.effects.length === 0) {
    warnings.push(`PromptPlan effects are missing; defaulted to ${defaultPromptEffects(plan.sceneType).join(", ")}.`);
  }
  if (!plan.interaction) {
    warnings.push("PromptPlan interaction is missing; defaulted to the recipe interaction.");
  }
  if (acceptanceCriteria.length < 3) {
    warnings.push("PromptPlan needs at least three concrete screenshot acceptance criteria before it can be used as product-quality proof.");
  }
  if ((plan.negativeCriteria ?? []).map((item) => item.trim()).filter(Boolean).length === 0) {
    warnings.push("PromptPlan negative criteria are missing; default anti-patterns were applied.");
  }
  return warnings;
}

export type AuraBackend = "webgl2" | "webgpu" | "canvas2d" | "headless";

export interface AuraDiagnostics {
  readonly backend: AuraBackend;
  readonly fps: number;
  readonly drawCalls: number;
  readonly renderSize: readonly [number, number];
  readonly assets: readonly AuraAssetLoadState[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface AuraAssetLoadState {
  readonly id: string;
  readonly type: AuraAssetType;
  readonly url: string;
  readonly status: "ready" | "optional-missing" | "error";
  readonly message?: string;
}

export interface AuraApp {
  readonly canvas?: HTMLCanvasElement;
  readonly scene: AuraSceneSnapshot;
  readonly backend: AuraBackend;
  diagnostics(): AuraDiagnostics;
  screenshot(): AuraScreenshot;
  dispose(): void;
}

export interface AuraCreateAppOptions {
  readonly scene: AuraSceneBuilder | AuraSceneSnapshot;
  readonly diagnostics?: boolean | AuraDiagnosticsOptions;
  readonly pixelRatio?: number;
  readonly autoStart?: boolean;
  readonly resize?: boolean;
}

export interface AuraDiagnosticsOptions {
  readonly overlay?: boolean;
  readonly assetPanel?: boolean;
  readonly performancePanel?: boolean;
}

export interface AuraScreenshot {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export type AuraAppTarget = string | HTMLElement | HTMLCanvasElement | null | undefined;

export class AuraRuntimeError extends Error {
  readonly code:
    | "missing-canvas"
    | "missing-asset"
    | "failed-glb-load"
    | "unsupported-texture"
    | "backend-fallback";

  constructor(code: AuraRuntimeError["code"], message: string) {
    super(message);
    this.name = "AuraRuntimeError";
    this.code = code;
  }
}

export function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions): AuraApp {
  const snapshot = normalizeSceneSnapshot(options.scene);
  const diagnosticsState = createInitialDiagnostics(snapshot);
  const canvas = resolveCanvas(target);
  const productionNodes = snapshot.nodes.filter(isWebGLRenderableNode);
  const shouldUseProductionRenderer = Boolean(canvas && productionNodes.length > 0 && typeof window !== "undefined");
  const backend: AuraBackend = shouldUseProductionRenderer ? "webgl2" : canvas ? "canvas2d" : "headless";
  const warnings = collectGeneratedCodeWarnings(snapshot);
  validateSceneAssets(snapshot, diagnosticsState.assets);
  diagnosticsState.warnings.push(...warnings);
  diagnosticsState.backend = backend;
  if (canvas) {
    configureCanvas(canvas, options.pixelRatio ?? devicePixelRatioSafe(), options.resize ?? true);
  }
  const overlay = canvas && shouldRenderOverlay(options.diagnostics, snapshot) ? createDiagnosticsOverlay(canvas, diagnosticsState) : undefined;
  let disposed = false;
  let animationHandle = 0;
  let productionController: { dispose(): void } | undefined;
  let lastTime = 0;
  const render = (time = performanceNow()) => {
    if (disposed) return;
    const delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67;
    lastTime = time;
    diagnosticsState.fps = Math.round(1000 / delta);
    diagnosticsState.drawCalls = renderSceneToCanvas(canvas, snapshot, time);
    if (canvas) diagnosticsState.renderSize = [canvas.width, canvas.height];
    overlay?.update();
    if (options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
      animationHandle = requestAnimationFrame(render);
    }
  };
  if (shouldUseProductionRenderer && canvas) {
    void startProductionRender(canvas, snapshot, diagnosticsState, options, overlay)
      .then((controller) => {
        productionController = controller;
        if (!disposed) markRouteReady(snapshot, diagnosticsState);
      })
      .catch((error: unknown) => {
        diagnosticsState.backend = "webgl2";
        diagnosticsState.errors.push(productionRenderErrorMessage(error));
        overlay?.update();
        markRouteError(snapshot, diagnosticsState);
      });
  } else {
    render();
    markRouteReady(snapshot, diagnosticsState);
  }
  return {
    canvas,
    scene: snapshot,
    get backend() {
      return diagnosticsState.backend;
    },
    diagnostics() {
      return snapshotDiagnostics(diagnosticsState);
    },
    screenshot() {
      return captureAuraScreenshot(canvas);
    },
    dispose() {
      disposed = true;
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      productionController?.dispose();
      overlay?.dispose();
    }
  };
}

export function createAuraRouteHealthSnapshot(app: AuraApp): {
  readonly status: "ready" | "error";
  readonly diagnostics: AuraDiagnostics;
  readonly scene: AuraSceneSnapshot;
} {
  const diagnostics = app.diagnostics();
  return {
    status: diagnostics.errors.length === 0 ? "ready" : "error",
    diagnostics,
    scene: app.scene
  };
}

export function captureAuraScreenshot(target?: HTMLCanvasElement): AuraScreenshot {
  if (!target) {
    return {
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,",
      width: 0,
      height: 0
    };
  }
  if (typeof target.toDataURL !== "function") {
    throw new AuraRuntimeError(
      "missing-canvas",
      "Aura3D screenshot failed because the target is not a canvas. Suggested fix: pass the app returned by createAuraApp or its canvas."
    );
  }
  return {
    mimeType: "image/png",
    dataUrl: target.toDataURL("image/png"),
    width: target.width,
    height: target.height
  };
}

export function createAuraAssetLoadError(asset: AuraAssetRef<"model">, reason: string): AuraRuntimeError {
  return new AuraRuntimeError(
    "failed-glb-load",
    `Aura3D failed to load GLB asset "${asset.id}" from "${asset.url}": ${reason}. Suggested fix: run aura3d assets validate and confirm the URL is served by your app.`
  );
}

interface WebGLRenderController {
  dispose(): void;
}

function isRenderableModelNode(node: AuraSceneNode): node is AuraModelNode {
  return node.kind === "model" && node.visible !== false && Boolean(node.asset.url) && ["glb", "gltf"].includes(node.asset.format);
}

function isWebGLRenderableNode(node: AuraSceneNode): node is AuraModelNode | AuraPrimitiveNode {
  return isRenderableModelNode(node) || node.kind === "primitive";
}

async function startProductionRender(
  canvas: HTMLCanvasElement,
  snapshot: AuraSceneSnapshot,
  diagnosticsState: MutableDiagnostics,
  options: AuraCreateAppOptions,
  overlay?: { update(): void }
): Promise<WebGLRenderController> {
  const renderableNode = snapshot.nodes.find(isWebGLRenderableNode);
  if (!renderableNode) {
    throw new AuraRuntimeError(
      "missing-asset",
      "Aura3D production rendering requires at least one typed model asset or primitive. Suggested fix: add model(assets.product), primitives.box(), primitives.sphere(), primitives.cylinder(), or primitives.plane()."
      );
  }

  const renderer = await createProductionSceneRenderer(canvas, snapshot);
  const continuousRender = shouldContinuouslyRender(snapshot);

  let disposed = false;
  let animationHandle = 0;
  const renderFrame = (time = performanceNow()) => {
    if (disposed) return;
    const drawCalls = renderer.render(time);
    diagnosticsState.backend = "webgl2";
    diagnosticsState.fps = diagnosticsState.fps || 60;
    diagnosticsState.drawCalls = drawCalls;
    diagnosticsState.renderSize = [canvas.width, canvas.height];
    overlay?.update();
    if (continuousRender && options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
      animationHandle = requestAnimationFrame(renderFrame);
    }
  };

  renderFrame();

  return {
    dispose() {
      disposed = true;
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      renderer.dispose();
    }
  };
}

function shouldContinuouslyRender(snapshot: AuraSceneSnapshot): boolean {
  if (snapshot.timeline?.mode === "loop") return true;
  if (snapshot.camera.mode === "dolly" || snapshot.camera.mode === "follow") return true;
  return snapshot.nodes.some((node) => {
    if ((node.kind === "model" || node.kind === "primitive") && node.animation) return true;
    if (node.kind !== "effect") return false;
    return node.effect === "particles" || node.effect === "rain";
  });
}

async function createProductionSceneRenderer(canvas: HTMLCanvasElement, snapshot: AuraSceneSnapshot): Promise<WebGLSceneRenderer> {
  try {
    return await createThreeSceneRenderer(canvas, snapshot);
  } catch (error) {
    if (typeof console !== "undefined") console.warn("Aura3D Three.js renderer fallback:", error);
    return await createWebGLSceneRenderer(canvas, snapshot);
  }
}

function colorToClearColor(color: AuraColor): readonly [number, number, number, number] {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    const value = Number.parseInt(color.slice(1), 16);
    return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255, 1];
  }
  return [0.02, 0.025, 0.035, 1];
}

interface WebGLSceneRenderer {
  render(time: number): number;
  dispose(): void;
}

async function createThreeSceneRenderer(canvas: HTMLCanvasElement, snapshot: AuraSceneSnapshot): Promise<WebGLSceneRenderer> {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(snapshot.background);
  const materialInspectionEnvironment = await createThreeMaterialInspectionEnvironment(THREE, renderer, snapshot);
  if (materialInspectionEnvironment) {
    threeScene.environment = materialInspectionEnvironment.texture;
  }
  const fog = snapshot.nodes.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "fog");
  if (fog) {
    threeScene.fog = new THREE.FogExp2(new THREE.Color(fog.color ?? "#9fb7d9"), Math.max(0.004, (fog.density ?? 0.1) * 0.045));
  }

  addThreeLights(THREE, threeScene, snapshot.nodes);
  const loader = new GLTFLoader();
  const disposables: any[] = materialInspectionEnvironment
    ? [materialInspectionEnvironment.texture, materialInspectionEnvironment.generator]
    : [];
  const frameUpdaters: Array<(time: number) => void> = [];
  const primitiveBatchNodes: AuraPrimitiveNode[] = [];

  for (const node of snapshot.nodes) {
    if (node.kind === "model" && isRenderableModelNode(node)) {
      const gltf = await loader.loadAsync(new URL(node.asset.url, document.baseURI).href);
      const modelRoot = gltf.scene ?? gltf.scenes?.[0];
      if (!modelRoot) {
        throw createAuraAssetLoadError(node.asset, "the GLB loaded but did not contain a default scene");
      }
      modelRoot.traverse((child: any) => {
        if (!child.isMesh) return;
        child.castShadow = node.castShadow;
        child.receiveShadow = node.receiveShadow;
        if (node.material) child.material = createThreeMaterial(THREE, node.material);
        else if (child.material) enhanceLoadedMaterial(child.material);
        disposables.push(child.geometry, child.material);
      });
      const pivot = normalizeThreeModel(THREE, modelRoot, node);
      threeScene.add(pivot);
      registerThreeNodeAnimation(pivot, node, frameUpdaters);
      disposables.push(modelRoot);
      continue;
    }
    if (node.kind === "primitive") {
      if (isThreeReadableTextLabel(node)) {
        const label = createThreeReadableTextLabel(THREE, node);
        threeScene.add(label);
        disposables.push(label, label.material, label.material.map);
        continue;
      }
      if (!node.animation) {
        primitiveBatchNodes.push(node);
        continue;
      }
      const mesh = createThreePrimitive(THREE, node);
      threeScene.add(mesh);
      registerThreeNodeAnimation(mesh, node, frameUpdaters);
      disposables.push(mesh.geometry, mesh.material);
      continue;
    }
  }

  for (const batch of createThreePrimitiveBatches(THREE, primitiveBatchNodes)) {
    threeScene.add(batch);
    disposables.push(batch, batch.geometry, batch.material);
  }

  const bloomEffect = snapshot.nodes.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "bloom");
  if (bloomEffect) {
    const bloom = createThreeBloom(THREE, snapshot, bloomEffect);
    threeScene.add(bloom);
    disposables.push(bloom, bloom.userData.texture);
    if (typeof bloom.userData.update === "function") frameUpdaters.push(bloom.userData.update);
  }

  const rainEffect = snapshot.nodes.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "rain");
  if (rainEffect) {
    const rain = createThreeRain(THREE, rainEffect);
    threeScene.add(rain);
    disposables.push(rain, rain.userData.mistTexture);
    if (typeof rain.userData.update === "function") frameUpdaters.push(rain.userData.update);
  }

  const particleEffects = snapshot.nodes.filter((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "particles");
  for (const particleEffect of particleEffects) {
    const particles = createThreeParticles(THREE, particleEffect);
    threeScene.add(particles);
    disposables.push(particles, particles.geometry, particles.material);
    if (typeof particles.userData.update === "function") frameUpdaters.push(particles.userData.update);
  }

  const cameraObject = new THREE.PerspectiveCamera(snapshot.camera.fov ?? 45, canvas.width / Math.max(1, canvas.height), 0.05, 100);

  return {
    render(time) {
      if (renderer.domElement.width !== canvas.width || renderer.domElement.height !== canvas.height) {
        renderer.setSize(canvas.width, canvas.height, false);
      }
      for (const update of frameUpdaters) update(time);
      updateThreeCamera(THREE, cameraObject, snapshot, canvas, time);
      renderer.render(threeScene, cameraObject);
      return Math.max(1, renderer.info.render.calls);
    },
    dispose() {
      for (const item of disposables) disposeThreeResource(item);
      renderer.dispose();
    }
  };
}

function addThreeLights(THREE: typeof import("three"), threeScene: any, nodes: readonly AuraSceneNode[]): void {
  const lightNodes = nodes.filter((node): node is AuraLightNode => node.kind === "light");
  if (lightNodes.length === 0) {
    threeScene.add(new THREE.HemisphereLight("#dfefff", "#071019", 1.35));
    const key = new THREE.DirectionalLight("#ffffff", 2.4);
    key.position.set(3.8, 5.6, 4.2);
    key.castShadow = true;
    threeScene.add(key);
    return;
  }
  for (const node of lightNodes) {
    const color = new THREE.Color(node.color ?? "#ffffff");
    if (node.light === "ambient") {
      threeScene.add(new THREE.HemisphereLight(color, new THREE.Color("#05070b"), Math.max(0.05, node.intensity * 1.8)));
      continue;
    }
    if (node.light === "point") {
      const light = new THREE.PointLight(color, Math.max(0.1, node.intensity * 26), 16, 1.65);
      const position = node.position ?? [2, 2.5, 1.5];
      light.position.set(position[0], position[1], position[2]);
      light.castShadow = false;
      threeScene.add(light);
      continue;
    }
    const light = new THREE.DirectionalLight(color, Math.max(0.1, node.intensity * 2.1));
    const position = node.position ?? [3, 4, 3];
    light.position.set(position[0], position[1], position[2]);
    light.castShadow = true;
    threeScene.add(light);
  }
}

function createThreePrimitiveBatches(THREE: typeof import("three"), nodes: readonly AuraPrimitiveNode[]): any[] {
  const groups = new Map<string, AuraPrimitiveNode[]>();
  for (const node of nodes) {
    const key = primitiveBatchKey(node);
    const existing = groups.get(key);
    if (existing) existing.push(node);
    else groups.set(key, [node]);
  }

  const meshes: any[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    if (group.length === 1) {
      meshes.push(createThreePrimitive(THREE, first));
      continue;
    }

    const geometry = createThreePrimitiveGeometry(THREE, first.primitive);
    const materialValue = createThreeMaterial(THREE, first.material ?? material.pbr());
    const mesh = new THREE.InstancedMesh(geometry, materialValue, group.length);
    mesh.name = `aura-instanced-${first.primitive}-${group.length}`;
    mesh.castShadow = first.primitive !== "plane" && !first.material?.emissive;
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    group.forEach((node, index) => {
      applyThreeTransform(dummy, node, primitiveSize(node));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }
  return meshes;
}

function primitiveBatchKey(node: AuraPrimitiveNode): string {
  return JSON.stringify({
    primitive: node.primitive,
    material: node.material ?? material.pbr(),
    castShadow: node.primitive !== "plane" && !node.material?.emissive
  });
}

function createThreePrimitiveGeometry(THREE: typeof import("three"), primitiveName: AuraPrimitiveNode["primitive"]): any {
  return primitiveName === "sphere"
    ? new THREE.SphereGeometry(0.5, 24, 12)
    : primitiveName === "box"
      ? new THREE.BoxGeometry(1, 1, 1)
      : primitiveName === "cylinder"
        ? new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1)
        : new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
}

function createThreePrimitive(THREE: typeof import("three"), node: AuraPrimitiveNode): any {
  const geometry = createThreePrimitiveGeometry(THREE, node.primitive);
  const materialValue = createThreeMaterial(THREE, node.material ?? material.pbr());
  const mesh = new THREE.Mesh(geometry, materialValue);
  mesh.castShadow = node.primitive !== "plane" && !node.material?.emissive;
  mesh.receiveShadow = true;
  applyThreeTransform(mesh, node, primitiveSize(node));
  return mesh;
}

function isThreeReadableTextLabel(node: AuraPrimitiveNode): boolean {
  return node.primitive === "plane" && node.name?.endsWith("readable planet label") === true;
}

function createThreeReadableTextLabel(THREE: typeof import("three"), node: AuraPrimitiveNode): any {
  const label = (node.name ?? "label").replace(/\s*readable planet label$/, "");
  const color = String(node.material?.emissive ?? node.material?.color ?? "#ffffff");
  const texture = createThreeTextTexture(THREE, label, color);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false
  }));
  const position = node.position ?? [0, 0.4, 0];
  const scale = typeof node.scale === "number" ? [node.scale, node.scale, node.scale] as const : node.scale ?? [0.8, 1, 0.24] as const;
  sprite.name = node.name ?? label;
  sprite.position.set(position[0], position[1], position[2]);
  sprite.scale.set(scale[0], scale[2] * 1.35, 1);
  return sprite;
}

function createThreeTextTexture(THREE: typeof import("three"), text: string, color: string): any {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(2,6,23,0.86)";
    context.fillRect(8, 18, canvas.width - 16, canvas.height - 36);
    context.strokeStyle = color;
    context.lineWidth = 8;
    context.strokeRect(12, 22, canvas.width - 24, canvas.height - 44);
    context.fillStyle = color;
    context.font = "700 64px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

async function createThreeMaterialInspectionEnvironment(
  THREE: typeof import("three"),
  renderer: any,
  snapshot: AuraSceneSnapshot
): Promise<{ readonly texture: any; readonly generator: any } | undefined> {
  const needsInspectionEnvironment = snapshot.nodes.some((node) =>
    node.kind === "primitive" && (
      node.name === "mirror chrome metal swatch" ||
      node.name === "transparent cyan glass swatch" ||
      node.name === "red automotive clearcoat swatch"
    )
  );
  if (!needsInspectionEnvironment) return undefined;

  try {
    const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
    const generator = new THREE.PMREMGenerator(renderer);
    const environment = new RoomEnvironment(renderer);
    const texture = generator.fromScene(environment, 0.04).texture;
    disposeThreeResource(environment);
    return { texture, generator };
  } catch {
    return undefined;
  }
}

function createThreeMaterial(THREE: typeof import("three"), spec: AuraMaterialSpec): any {
  const color = new THREE.Color(spec.color ?? "#d7dee8");
  const usePhysical = spec.transmission !== undefined || spec.clearcoat !== undefined;
  const transparent = spec.opacity !== undefined && spec.opacity < 1;
  const materialValue = usePhysical
    ? new THREE.MeshPhysicalMaterial({
      color,
      roughness: spec.roughness ?? 0.54,
      metalness: spec.metallic ?? 0,
      transparent,
      opacity: spec.opacity ?? 1,
      transmission: spec.transmission ?? 0,
      clearcoat: spec.clearcoat ?? 0,
      clearcoatRoughness: spec.clearcoatRoughness ?? 0.18,
      thickness: spec.thickness ?? 0,
      ior: spec.ior ?? 1.5,
      attenuationColor: new THREE.Color(spec.attenuationColor ?? spec.color ?? "#ffffff"),
      attenuationDistance: spec.attenuationDistance ?? Infinity,
      envMapIntensity: spec.envMapIntensity ?? 1,
      depthWrite: !transparent,
      side: transparent ? THREE.DoubleSide : THREE.FrontSide
    })
    : new THREE.MeshStandardMaterial({
      color,
      roughness: spec.roughness ?? 0.54,
      metalness: spec.metallic ?? 0,
      transparent,
      opacity: spec.opacity ?? 1,
      envMapIntensity: spec.envMapIntensity ?? 1,
      depthWrite: !transparent,
      side: transparent ? THREE.DoubleSide : THREE.FrontSide
    });
  if (spec.emissive) {
    materialValue.emissive = new THREE.Color(spec.emissive);
    materialValue.emissiveIntensity = 1.55;
  }
  return materialValue;
}

function enhanceLoadedMaterial(materialValue: any): void {
  const materials = Array.isArray(materialValue) ? materialValue : [materialValue];
  for (const entry of materials) {
    if (!entry || typeof entry !== "object") continue;
    if ("roughness" in entry && typeof entry.roughness === "number") entry.roughness = Math.min(entry.roughness, 0.82);
    if ("metalness" in entry && typeof entry.metalness === "number") entry.metalness = Math.max(entry.metalness, 0.02);
    entry.needsUpdate = true;
  }
}

function normalizeThreeModel(THREE: typeof import("three"), modelRoot: any, node: AuraModelNode): any {
  const box = new THREE.Box3().setFromObject(modelRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fitScale = 1.55 / Math.max(0.001, size.x, size.y, size.z);
  modelRoot.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  const pivot = new THREE.Group();
  pivot.add(modelRoot);
  applyThreeTransform(pivot, node, [fitScale, fitScale, fitScale]);
  return pivot;
}

function applyThreeTransform(object: any, node: AuraTransformSpec, baseScale: AuraVec3): void {
  const position = node.position ?? [0, 0, 0];
  const rotation = node.rotation ?? [0, 0, 0];
  const scaleValue = typeof node.scale === "number"
    ? [node.scale, node.scale, node.scale] as const
    : node.scale ?? [1, 1, 1] as const;
  object.position.set(position[0], position[1], position[2]);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  object.scale.set(baseScale[0] * scaleValue[0], baseScale[1] * scaleValue[1], baseScale[2] * scaleValue[2]);
  if (node.lookAt) object.lookAt(node.lookAt[0], node.lookAt[1], node.lookAt[2]);
}

function registerThreeNodeAnimation(object: any, node: AuraModelNode | AuraPrimitiveNode, frameUpdaters: Array<(time: number) => void>): void {
  if (!node.animation) return;
  const basePosition = node.position ?? [0, 0, 0];
  const baseRotation = node.rotation ?? [0, 0, 0];
  const nodeName = node.name?.toLowerCase() ?? "";
  const speed = Math.max(0.05, node.animation.speed ?? 1);
  frameUpdaters.push((time: number) => {
    const seconds = time / 1000;
    if (node.animation?.clip === "walk") {
      const phase = seconds * speed * Math.PI * 2;
      const oppositeStride = nodeName.includes("right") || nodeName.includes("back") ? Math.PI : 0;
      const travel = Math.sin(seconds * speed * 0.72) * 0.24;
      const bodyBob = Math.abs(Math.sin(phase)) * 0.028;
      object.position.x = basePosition[0] + travel;
      object.position.y = basePosition[1];
      object.position.z = basePosition[2];
      object.rotation.x = baseRotation[0];
      object.rotation.y = baseRotation[1];
      object.rotation.z = baseRotation[2];
      if (nodeName.includes("torso") || nodeName.includes("neck") || nodeName.includes("head") || nodeName.includes("eye") || nodeName.includes("mouth") || nodeName.includes("shoulder") || nodeName.includes("hip")) {
        object.position.y = basePosition[1] + bodyBob;
      }
      if (nodeName.includes("arm") || nodeName.includes("leg")) {
        object.rotation.x = baseRotation[0] + Math.sin(phase + oppositeStride) * 0.42;
      }
      if (nodeName.includes("hand") || nodeName.includes("foot")) {
        object.rotation.x = baseRotation[0] + Math.sin(phase + oppositeStride) * 0.18;
        object.position.y = basePosition[1] + Math.max(0, Math.sin(phase + oppositeStride)) * 0.055;
      }
      return;
    }
    if (node.animation?.clip === "float") {
      object.position.y = (node.position?.[1] ?? 0) + Math.sin(seconds * speed) * 0.08;
      object.rotation.y = baseRotation[1] + seconds * speed * 0.28;
      return;
    }
    if (node.animation?.clip === "turntable") {
      object.position.y = basePosition[1];
      object.rotation.y = baseRotation[1] + seconds * speed * 0.72;
      return;
    }
    if (node.animation?.clip === "pulse") {
      const pulse = 1 + Math.sin(seconds * speed * 2) * 0.08;
      object.scale.multiplyScalar(pulse / (object.userData.lastAuraPulse ?? 1));
      object.userData.lastAuraPulse = pulse;
      return;
    }
    object.rotation.y = baseRotation[1] + seconds * speed;
  });
}

function createThreeBloom(THREE: typeof import("three"), snapshot: AuraSceneSnapshot, effect: AuraEffectNode): any {
  const group = new THREE.Group();
  const intensity = Math.max(0.05, Math.min(1.4, effect.intensity ?? 0.35));
  const texture = createThreeRadialTexture(THREE, effect.color ?? "#ffffff");
  group.userData.texture = texture;
  const anchors = collectBloomAnchors(snapshot);
  anchors.forEach((anchor, index) => {
    const materialValue = new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color(anchor.color ?? effect.color ?? "#ffffff"),
      transparent: true,
      opacity: Math.min(0.46, 0.12 + intensity * anchor.opacity),
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    const sprite = new THREE.Sprite(materialValue);
    sprite.name = `aura-bloom-halo-${index}`;
    sprite.position.set(anchor.position[0], anchor.position[1], anchor.position[2]);
    sprite.scale.setScalar(anchor.size * (0.85 + intensity * 1.4));
    group.add(sprite);
  });
  group.userData.update = (time: number) => {
    const pulse = 1 + Math.sin(time * 0.0012) * 0.035 * intensity;
    group.children.forEach((child: any, index: number) => {
      const base = anchors[index]?.size ?? 1;
      child.scale.setScalar(base * (0.85 + intensity * 1.4) * pulse);
    });
  };
  return group;
}

function collectBloomAnchors(snapshot: AuraSceneSnapshot): readonly {
  readonly position: AuraVec3;
  readonly size: number;
  readonly opacity: number;
  readonly color?: AuraColor;
}[] {
  const anchors: Array<{ position: AuraVec3; size: number; opacity: number; color?: AuraColor }> = [];
  for (const node of snapshot.nodes) {
    if (node.kind === "primitive" && node.material?.emissive) {
      const size = primitiveSize(node);
      const scaleValue = typeof node.scale === "number" ? [node.scale, node.scale, node.scale] as const : node.scale ?? [1, 1, 1] as const;
      anchors.push({
        position: node.position ?? [0, 0.65, -0.6],
        size: Math.max(0.34, Math.max(size[0] * scaleValue[0], size[1] * scaleValue[1], size[2] * scaleValue[2]) * 1.45),
        opacity: 0.24,
        color: node.material.emissive
      });
    }
    if (node.kind === "light" && node.light === "point") {
      anchors.push({
        position: node.position ?? [0, 1.4, 0.6],
        size: Math.max(0.55, 0.28 + node.intensity * 0.32),
        opacity: 0.18,
        color: node.color
      });
    }
  }
  const modelNode = snapshot.nodes.find((node): node is AuraModelNode => node.kind === "model");
  if (modelNode) {
    const position = modelNode.position ?? [0, 0.42, -0.65];
    anchors.push({
      position: [position[0], position[1] + 0.42, position[2] + 0.08],
      size: 1.2,
      opacity: 0.12
    });
  }
  return anchors.length > 0 ? anchors.slice(0, 10) : [{ position: [0, 0.75, -0.75], size: 1.6, opacity: 0.16 }];
}

function createThreeRadialTexture(THREE: typeof import("three"), color: AuraColor): any {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, toAlphaColor(String(color), 0.95));
    gradient.addColorStop(0.18, toAlphaColor(String(color), 0.42));
    gradient.addColorStop(0.52, toAlphaColor(String(color), 0.14));
    gradient.addColorStop(1, toAlphaColor(String(color), 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createThreeRain(THREE: typeof import("three"), effect: AuraEffectNode): any {
  const group = new THREE.Group();
  const density = Math.max(0.2, Math.min(1.6, effect.density ?? effect.intensity ?? 0.72));
  const intensity = Math.max(0.1, Math.min(1.4, effect.intensity ?? 0.4));
  const color = effect.color ?? "#c9e8ff";
  const wind = effect.wind ?? [-0.32, -5.4, -0.16];
  const requestedCount = effect.particleCount ?? Math.round(520 * density);
  const dummy = new THREE.Object3D();
  const layers: any[] = [];
  const makeLayer = (name: string, count: number, zMin: number, zMax: number, length: number, width: number, opacity: number, speed: number) => {
    const geometry = new THREE.PlaneGeometry(width, length);
    const materialValue = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.InstancedMesh(geometry, materialValue, count);
    mesh.name = name;
    mesh.userData.entries = [];
    for (let index = 0; index < count; index += 1) {
      const entry = {
        x: seededRange(index, 11, -4.2, 4.2),
        y: seededRange(index, 23, 0.22, 3.25),
        z: seededRange(index, 37, zMin, zMax),
        scale: seededRange(index, 41, 0.72, 1.32),
        phase: seededRange(index, 53, 0, 1)
      };
      mesh.userData.entries.push(entry);
      applyRainInstance(dummy, mesh, index, entry, 0, length, wind, speed);
    }
    mesh.instanceMatrix.needsUpdate = true;
    layers.push({ mesh, length, speed });
    group.add(mesh);
  };

  makeLayer("aura-rain-background-volume", Math.round(requestedCount * 0.42), -3.8, -1.1, 0.36, 0.018, Math.min(0.34, intensity * 0.36), 0.6);
  makeLayer("aura-rain-midground-volume", Math.round(requestedCount * 0.36), -1.3, 0.9, 0.58, 0.026, Math.min(0.48, intensity * 0.54), 0.92);
  makeLayer("aura-rain-foreground-streaks", Math.round(requestedCount * 0.22), 0.75, 2.35, 0.82, 0.034, Math.min(0.66, intensity * 0.72), 1.22);

  const splashMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: effect.splashes === false ? 0 : 0.48,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const splashGeometry = new THREE.RingGeometry(0.028, 0.046, 20);
  const splashCount = effect.splashes === false ? 0 : Math.round(64 * density);
  const splashes = new THREE.InstancedMesh(splashGeometry, splashMaterial, splashCount);
  splashes.name = "aura-rain-floor-splash-ripples";
  splashes.userData.entries = [];
  for (let index = 0; index < splashCount; index += 1) {
    const entry = {
      x: seededRange(index, 71, -3.2, 3.2),
      z: seededRange(index, 89, -1.95, 1.5),
      scale: seededRange(index, 97, 0.58, 1.65),
      phase: seededRange(index, 109, 0, 1)
    };
    splashes.userData.entries.push(entry);
    applySplashInstance(dummy, splashes, index, entry, 0);
  }
  splashes.instanceMatrix.needsUpdate = true;
  group.add(splashes);

  if (effect.mist !== false) {
    const mistTexture = createThreeRadialTexture(THREE, color);
    group.userData.mistTexture = mistTexture;
    const mistMaterial = new THREE.SpriteMaterial({
      map: mistTexture,
      color: new THREE.Color(color),
      transparent: true,
      opacity: Math.min(0.18, 0.08 + intensity * 0.08),
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    for (let index = 0; index < 5; index += 1) {
      const sprite = new THREE.Sprite(mistMaterial.clone());
      sprite.name = `aura-rain-mist-bank-${index}`;
      sprite.position.set(-2.4 + index * 1.2, 0.32 + (index % 2) * 0.12, -1.5 + (index % 3) * 0.48);
      sprite.scale.set(1.4 + index * 0.18, 0.42, 1);
      group.add(sprite);
    }
  }

  group.userData.update = (time: number) => {
    const seconds = time / 1000;
    for (const layer of layers) {
      const entries = layer.mesh.userData.entries as Array<{ x: number; y: number; z: number; scale: number; phase: number }>;
      entries.forEach((entry, index) => {
        applyRainInstance(dummy, layer.mesh, index, entry, seconds, layer.length, wind, layer.speed * (effect.speed ?? 1));
      });
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
    const splashEntries = splashes.userData.entries as Array<{ x: number; z: number; scale: number; phase: number }>;
    splashEntries.forEach((entry, index) => applySplashInstance(dummy, splashes, index, entry, seconds));
    splashes.instanceMatrix.needsUpdate = true;
  };

  return group;
}

function createThreeParticles(THREE: typeof import("three"), effect: AuraEffectNode): any {
  const count = Math.max(120, Math.min(6000, effect.particleCount ?? 900));
  const radius = Math.max(0.1, effect.radius ?? 1.15);
  const height = Math.max(0.2, effect.height ?? 2.4);
  const intensity = Math.max(0.1, Math.min(1.8, effect.intensity ?? 0.8));
  const multicolor = effect.name?.includes("multicolor") || effect.emitter === "swirl";
  const lifetimeColor = effect.emitter === "fountain" || effect.name?.includes("lifetime");
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const baseColor = new THREE.Color(effect.color ?? "#7dfcff");
  const accentColor = new THREE.Color("#ffd166");
  const hotColor = new THREE.Color("#fff7ad");
  const midColor = baseColor.clone();
  const fallingColor = new THREE.Color("#ff7ad9");
  const oldColor = new THREE.Color("#60a5fa");
  const scratchColor = new THREE.Color();
  const writeColor = (index: number, seconds: number) => {
    if (lifetimeColor) {
      const life = getParticleLife(index, seconds, effect.emitter ?? "swirl");
      if (life < 0.28) {
        scratchColor.copy(hotColor).lerp(accentColor, life / 0.28);
      } else if (life < 0.56) {
        scratchColor.copy(accentColor).lerp(midColor, (life - 0.28) / 0.28);
      } else if (life < 0.82) {
        scratchColor.copy(midColor).lerp(fallingColor, (life - 0.56) / 0.26);
      } else {
        scratchColor.copy(fallingColor).lerp(oldColor, (life - 0.82) / 0.18);
      }
    } else if (multicolor) {
      scratchColor.setHSL(seededRange(index, 173, 0, 1), 0.84, 0.64);
    } else {
      scratchColor.copy(baseColor).lerp(accentColor, seededRange(index, 173, 0, 0.42));
    }
    colors[index * 3] = scratchColor.r;
    colors[index * 3 + 1] = scratchColor.g;
    colors[index * 3 + 2] = scratchColor.b;
  };
  for (let index = 0; index < count; index += 1) {
    writeParticlePosition(positions, index, 0, effect.emitter ?? "swirl", radius, height);
    writeColor(index, 0);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const materialValue = new THREE.PointsMaterial({
    size: (multicolor ? 0.042 : 0.028) + intensity * (multicolor ? 0.024 : 0.018),
    vertexColors: true,
    transparent: true,
    opacity: Math.min(0.98, (multicolor ? 0.62 : 0.48) + intensity * 0.22),
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geometry, materialValue);
  points.name = effect.name ?? "aura-particle-system";
  points.userData.update = (time: number) => {
    const seconds = time / 1000 * (effect.speed ?? 1);
    const attribute = geometry.getAttribute("position");
    const values = attribute.array as Float32Array;
    const colorAttribute = geometry.getAttribute("color");
    for (let index = 0; index < count; index += 1) {
      writeParticlePosition(values, index, seconds, effect.emitter ?? "swirl", radius, height);
      if (lifetimeColor) writeColor(index, seconds);
    }
    attribute.needsUpdate = true;
    if (lifetimeColor) colorAttribute.needsUpdate = true;
  };
  return points;
}

function getParticleLife(seedIndex: number, seconds: number, emitter: AuraEffectNode["emitter"]): number {
  if (emitter !== "fountain") return (seededRange(seedIndex, 181, 0, 1) + seconds * 0.18) % 1;
  const phase = seededRange(seedIndex, 181, 0, 1);
  const jet = seededRange(seedIndex, 199, 0.42, 1);
  return (phase + seconds * 0.34 * jet) % 1;
}

function writeParticlePosition(
  positions: Float32Array,
  index: number,
  seconds: number,
  emitter: AuraEffectNode["emitter"],
  radius: number,
  height: number,
  seedIndex = index
): void {
  const angleSeed = seededRange(seedIndex, 191, 0, 1);
  const angle = angleSeed * Math.PI * 2 + seconds * (emitter === "swirl" ? 1.45 : 0.14);
  const radial = radius * (0.18 + seededRange(seedIndex, 193, 0, 0.82));
  let x = Math.cos(angle) * radial;
  let y = seededRange(seedIndex, 197, 0.08, height);
  let z = Math.sin(angle) * radial;
  if (emitter === "fountain") {
    const jet = seededRange(seedIndex, 199, 0.42, 1);
    const rise = getParticleLife(seedIndex, seconds, emitter);
    const arc = Math.sin(rise * Math.PI);
    const spread = radius * (0.16 + rise * 0.92) * seededRange(seedIndex, 203, 0.42, 1);
    const wobble = Math.sin(seconds * 1.7 + angleSeed * Math.PI * 2) * 0.12;
    x = Math.cos(angle + wobble) * spread;
    y = 0.12 + arc * height + seededRange(seedIndex, 207, -0.08, 0.08);
    z = Math.sin(angle + wobble) * spread;
  } else if (emitter === "ambient") {
    x = seededRange(seedIndex, 211, -radius * 2, radius * 2);
    y = seededRange(seedIndex, 223, 0.08, height);
    z = seededRange(seedIndex, 227, -radius * 1.4, radius * 1.4);
  }
  positions[index * 3] = x;
  positions[index * 3 + 1] = y;
  positions[index * 3 + 2] = z;
}

function applyRainInstance(
  dummy: { position: { set(x: number, y: number, z: number): void }; rotation: { set(x: number, y: number, z: number): void }; scale: { set(x: number, y: number, z: number): void }; updateMatrix(): void; matrix: unknown },
  mesh: { setMatrixAt(index: number, matrix: unknown): void },
  index: number,
  entry: { readonly x: number; readonly y: number; readonly z: number; readonly scale: number; readonly phase: number },
  seconds: number,
  length: number,
  wind: AuraVec3,
  speed: number
): void {
  const fall = ((seconds * speed + entry.phase) % 1) * 3.6;
  const y = 3.15 - ((3.15 - entry.y + fall) % 3.4);
  dummy.position.set(entry.x + wind[0] * fall * 0.06, y, entry.z + wind[2] * fall * 0.08);
  dummy.rotation.set(0, 0, -0.17 + wind[0] * 0.055);
  dummy.scale.set(entry.scale, entry.scale, entry.scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function applySplashInstance(
  dummy: { position: { set(x: number, y: number, z: number): void }; rotation: { set(x: number, y: number, z: number): void }; scale: { set(x: number, y: number, z: number): void }; updateMatrix(): void; matrix: unknown },
  mesh: { setMatrixAt(index: number, matrix: unknown): void },
  index: number,
  entry: { readonly x: number; readonly z: number; readonly scale: number; readonly phase: number },
  seconds: number
): void {
  const ripple = 0.35 + (((seconds * 1.8 + entry.phase) % 1) * 1.25);
  dummy.position.set(entry.x, 0.022, entry.z);
  dummy.rotation.set(-Math.PI / 2, 0, seededRange(index, 131, 0, Math.PI));
  dummy.scale.set(entry.scale * ripple, entry.scale * ripple, entry.scale * ripple);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function seededRange(index: number, salt: number, min: number, max: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  const normalized = value - Math.floor(value);
  return min + (max - min) * normalized;
}

function resolveCameraTarget(snapshot: AuraSceneSnapshot, cameraSpec: AuraCameraSpec): AuraVec3 {
  if (cameraSpec.mode === "follow" && cameraSpec.targetNode) {
    const targetNode = snapshot.nodes.find((node): node is AuraModelNode | AuraPrimitiveNode =>
      (node.kind === "model" || node.kind === "primitive") &&
      (node.name === cameraSpec.targetNode || (node.kind === "model" && node.asset.id === cameraSpec.targetNode))
    );
    if (targetNode?.position) return targetNode.position;
  }
  return cameraSpec.target ?? [0, 0.7, 0];
}

function updateThreeCamera(THREE: typeof import("three"), cameraObject: any, snapshot: AuraSceneSnapshot, canvas: HTMLCanvasElement, time: number): void {
  const cameraSpec = snapshot.camera;
  const target = resolveCameraTarget(snapshot, cameraSpec);
  let eye: AuraVec3 = cameraSpec.position ?? [0, 1.4, cameraSpec.distance ?? 4];
  if (cameraSpec.mode === "orbit") {
    const distance = cameraSpec.distance ?? 4;
    eye = cameraSpec.position ?? [target[0] + distance * 0.62, target[1] + distance * 0.42, target[2] + distance * 0.78];
  }
  if (cameraSpec.mode === "follow") {
    const distance = cameraSpec.distance ?? 4;
    eye = cameraSpec.position ?? [target[0] - distance * 0.38, target[1] + distance * 0.52, target[2] + distance * 0.82];
  }
  if (cameraSpec.mode === "dolly") {
    const seconds = cameraSpec.seconds ?? 6;
    const phase = (time / 1000 % seconds) / seconds;
    const eased = 0.5 - Math.cos(phase * Math.PI * 2) * 0.5;
    const from = cameraSpec.from ?? [0, 1.4, 5];
    const to = cameraSpec.to ?? [0, 1.2, 3.4];
    eye = mix3(from, to, eased);
  }
  cameraObject.aspect = canvas.width / Math.max(1, canvas.height);
  cameraObject.fov = cameraSpec.fov ?? 45;
  cameraObject.position.set(eye[0], eye[1], eye[2]);
  cameraObject.lookAt(new THREE.Vector3(target[0], target[1], target[2]));
  cameraObject.updateProjectionMatrix();
}

function disposeThreeResource(item: any): void {
  if (!item) return;
  if (Array.isArray(item)) {
    for (const entry of item) disposeThreeResource(entry);
    return;
  }
  if (typeof item.traverse === "function") {
    item.traverse((child: any) => {
      disposeThreeResource(child.geometry);
      disposeThreeResource(child.material);
    });
  }
  if (typeof item.dispose === "function") item.dispose();
}

interface WebGLPrimitive {
  readonly position: WebGLBuffer;
  readonly normal: WebGLBuffer;
  readonly index?: WebGLBuffer;
  readonly count: number;
  readonly mode: number;
  readonly indexType?: number;
  readonly color?: readonly [number, number, number];
}

interface WebGLModel {
  readonly node?: AuraModelNode | AuraPrimitiveNode;
  readonly primitives: readonly WebGLPrimitive[];
  readonly bounds: GltfBounds;
  readonly color: readonly [number, number, number];
  readonly normalizeToUnit: boolean;
  readonly modelMatrix?: Float32Array;
}

interface GltfPrimitive {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  readonly mode: number;
  readonly color?: readonly [number, number, number];
}

interface GltfModel {
  readonly primitives: readonly GltfPrimitive[];
  readonly bounds: GltfBounds;
}

interface GltfBounds {
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

interface GltfJson {
  readonly scene?: number;
  readonly scenes?: readonly {
    readonly nodes?: readonly number[];
  }[];
  readonly nodes?: readonly {
    readonly name?: string;
    readonly mesh?: number;
    readonly children?: readonly number[];
    readonly matrix?: readonly number[];
    readonly translation?: readonly number[];
    readonly rotation?: readonly number[];
    readonly scale?: readonly number[];
  }[];
  readonly buffers?: readonly { readonly uri?: string; readonly byteLength?: number }[];
  readonly bufferViews?: readonly { readonly buffer: number; readonly byteOffset?: number; readonly byteLength: number; readonly byteStride?: number }[];
  readonly accessors?: readonly {
    readonly bufferView?: number;
    readonly byteOffset?: number;
    readonly componentType: number;
    readonly count: number;
    readonly type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4";
    readonly normalized?: boolean;
    readonly min?: readonly number[];
    readonly max?: readonly number[];
  }[];
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly attributes?: Record<string, number>;
      readonly indices?: number;
      readonly mode?: number;
      readonly material?: number;
    }[];
  }[];
  readonly materials?: readonly {
    readonly pbrMetallicRoughness?: {
      readonly baseColorFactor?: readonly number[];
    };
    readonly emissiveFactor?: readonly number[];
  }[];
}

async function createWebGLSceneRenderer(canvas: HTMLCanvasElement, snapshot: AuraSceneSnapshot): Promise<WebGLSceneRenderer> {
  const gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
  if (!gl) {
    throw new AuraRuntimeError("backend-fallback", "Aura3D could not create a WebGL2 renderer. Suggested fix: use a WebGL2-capable browser.");
  }
  const backdrop = createWebGLBackdrop(gl, snapshot);
  const program = createWebGLProgram(gl);
  const modelNodes = snapshot.nodes.filter(isRenderableModelNode);
  const assetModels = await Promise.all(modelNodes.map(async (node) => createWebGLModel(gl, node, await loadGltfForWebGL(node.asset.url))));
  const primitiveModels = snapshot.nodes
    .filter((node): node is AuraPrimitiveNode => node.kind === "primitive")
    .map((node) => createWebGLPrimitiveModel(gl, node));
  const rainModels = snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "rain")
    ? [createWebGLRainModel(gl)]
    : [];
  const particleModels = snapshot.nodes
    .filter((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "particles")
    .map((node) => createWebGLParticleModel(gl, node));
  const models = [...assetModels, ...primitiveModels, ...rainModels, ...particleModels];
  const background = colorToClearColor(snapshot.background);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  return {
    render(time) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(background[0], background[1], background[2], background[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      let drawCalls = backdrop.render();
      gl.useProgram(program.program);
      gl.enable(gl.DEPTH_TEST);
      const viewProjection = createViewProjection(snapshot, canvas.width / Math.max(1, canvas.height), time);
      gl.uniformMatrix4fv(program.uniforms.viewProjection, false, viewProjection);
      gl.uniform3fv(program.uniforms.lightDirection, new Float32Array(normalize3([0.45, 0.82, 0.36])));
      for (const modelEntry of models) {
        const modelMatrix = modelEntry.modelMatrix ?? createModelMatrix(modelEntry.node, modelEntry.bounds, modelEntry.normalizeToUnit, time);
        gl.uniformMatrix4fv(program.uniforms.model, false, modelMatrix);
        for (const primitiveEntry of modelEntry.primitives) {
          gl.uniform3fv(program.uniforms.color, new Float32Array(primitiveEntry.color ?? modelEntry.color));
          gl.bindBuffer(gl.ARRAY_BUFFER, primitiveEntry.position);
          gl.enableVertexAttribArray(program.attributes.position);
          gl.vertexAttribPointer(program.attributes.position, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, primitiveEntry.normal);
          gl.enableVertexAttribArray(program.attributes.normal);
          gl.vertexAttribPointer(program.attributes.normal, 3, gl.FLOAT, false, 0, 0);
          if (primitiveEntry.index && primitiveEntry.indexType) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, primitiveEntry.index);
            gl.drawElements(primitiveEntry.mode, primitiveEntry.count, primitiveEntry.indexType, 0);
          } else {
            gl.drawArrays(primitiveEntry.mode, 0, primitiveEntry.count);
          }
          drawCalls += 1;
        }
      }
      return drawCalls;
    },
    dispose() {
      for (const modelEntry of models) {
        for (const primitiveEntry of modelEntry.primitives) {
          gl.deleteBuffer(primitiveEntry.position);
          gl.deleteBuffer(primitiveEntry.normal);
          if (primitiveEntry.index) gl.deleteBuffer(primitiveEntry.index);
        }
      }
      gl.deleteProgram(program.program);
      backdrop.dispose();
    }
  };
}

function createWebGLBackdrop(gl: WebGL2RenderingContext, snapshot: AuraSceneSnapshot): { render(): number; dispose(): void } {
  const program = createBackdropProgram(gl);
  const palette = createBackdropPalette(snapshot);
  const vertices = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1
  ]));
  return {
    render() {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(program.program);
      gl.uniform3fv(program.uniforms.low, new Float32Array(palette.low));
      gl.uniform3fv(program.uniforms.mid, new Float32Array(palette.mid));
      gl.uniform3fv(program.uniforms.high, new Float32Array(palette.high));
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.enableVertexAttribArray(program.attribute);
      gl.vertexAttribPointer(program.attribute, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.depthMask(true);
      return 1;
    },
    dispose() {
      gl.deleteBuffer(vertices);
      gl.deleteProgram(program.program);
    }
  };
}

function createBackdropProgram(gl: WebGL2RenderingContext): {
  readonly program: WebGLProgram;
  readonly attribute: number;
  readonly uniforms: {
    readonly low: WebGLUniformLocation;
    readonly mid: WebGLUniformLocation;
    readonly high: WebGLUniformLocation;
  };
} {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec3 u_low;
uniform vec3 u_mid;
uniform vec3 u_high;
out vec4 outColor;
void main() {
  float band = smoothstep(0.05, 0.78, v_uv.y);
  vec3 color = mix(u_low, u_mid, band);
  float stageGlow = smoothstep(0.62, 0.0, abs(v_uv.x - 0.50)) * smoothstep(0.08, 0.74, v_uv.y);
  color += u_mid * stageGlow * 0.18;
  float vignette = smoothstep(0.98, 0.24, distance(v_uv, vec2(0.50, 0.46)));
  color = mix(u_high, color, vignette);
  outColor = vec4(color, 1.0);
}`);
  const program = gl.createProgram();
  if (!program) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 backdrop program allocation failed.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 backdrop shader link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  return {
    program,
    attribute: gl.getAttribLocation(program, "a_position"),
    uniforms: {
      low: requiredUniform(gl, program, "u_low"),
      mid: requiredUniform(gl, program, "u_mid"),
      high: requiredUniform(gl, program, "u_high")
    }
  };
}

function createBackdropPalette(snapshot: AuraSceneSnapshot): {
  readonly low: readonly [number, number, number];
  readonly mid: readonly [number, number, number];
  readonly high: readonly [number, number, number];
} {
  const base = colorToRgb(snapshot.background);
  const effectColor = snapshot.nodes.find((node): node is AuraEffectNode => node.kind === "effect" && Boolean(node.color))?.color;
  const accent = effectColor ? colorToRgb(effectColor) : base;
  return {
    low: scaleRgb(base, 0.72),
    mid: clampRgb(mixRgb(scaleRgb(base, 1.55), accent, 0.28)),
    high: scaleRgb(base, 0.16)
  };
}

function createWebGLModel(gl: WebGL2RenderingContext, node: AuraModelNode, modelData: GltfModel): WebGLModel {
  return {
    node,
    bounds: modelData.bounds,
    color: colorToRgb(node.material?.color ?? "#8fb4ff"),
    normalizeToUnit: true,
    primitives: modelData.primitives.map((primitiveEntry) => {
      const position = createBuffer(gl, gl.ARRAY_BUFFER, primitiveEntry.positions);
      const normal = createBuffer(gl, gl.ARRAY_BUFFER, primitiveEntry.normals);
      const index = primitiveEntry.indices ? createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, primitiveEntry.indices) : undefined;
      return {
        position,
        normal,
        ...(index ? { index } : {}),
        count: primitiveEntry.indices?.length ?? primitiveEntry.positions.length / 3,
        mode: webglDrawMode(gl, primitiveEntry.mode),
        color: node.material?.color ? colorToRgb(node.material.color) : primitiveEntry.color,
        ...(primitiveEntry.indices ? { indexType: primitiveEntry.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT } : {})
      };
    })
  };
}

function createWebGLPrimitiveModel(gl: WebGL2RenderingContext, node: AuraPrimitiveNode): WebGLModel {
  const primitive = node.primitive === "sphere"
    ? createSphereGeometry()
    : node.primitive === "box"
      ? createBoxGeometry()
      : node.primitive === "cylinder"
        ? createCylinderGeometry()
        : createPlaneGeometry();
  return {
    node,
    bounds: primitive.bounds,
    color: colorToRgb(node.material?.emissive ?? node.material?.color ?? "#d7dee8"),
    normalizeToUnit: false,
    primitives: [{
      position: createBuffer(gl, gl.ARRAY_BUFFER, primitive.positions),
      normal: createBuffer(gl, gl.ARRAY_BUFFER, primitive.normals),
      index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, primitive.indices),
      count: primitive.indices.length,
      mode: gl.TRIANGLES,
      indexType: gl.UNSIGNED_SHORT
    }]
  };
}

function createWebGLRainModel(gl: WebGL2RenderingContext): WebGLModel {
  const lineCount = 90;
  const positions = new Float32Array(lineCount * 2 * 3);
  const normals = new Float32Array(lineCount * 2 * 3);
  const indices = new Uint16Array(lineCount * 2);
  for (let index = 0; index < lineCount; index += 1) {
    const x = ((index * 37) % 100) / 18 - 2.8;
    const z = ((index * 53) % 100) / 20 - 2.5;
    const y = 0.65 + ((index * 29) % 100) / 45;
    const base = index * 6;
    positions.set([x, y, z, x - 0.08, y - 0.42, z + 0.04], base);
    normals.set([0, 1, 0, 0, 1, 0], base);
    indices[index * 2] = index * 2;
    indices[index * 2 + 1] = index * 2 + 1;
  }
  return {
    bounds: { min: [-3, 0, -3], max: [3, 3, 3] },
    color: [0.62, 0.82, 1],
    normalizeToUnit: false,
    modelMatrix: identity4(),
    primitives: [{
      position: createBuffer(gl, gl.ARRAY_BUFFER, positions),
      normal: createBuffer(gl, gl.ARRAY_BUFFER, normals),
      index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices),
      count: indices.length,
      mode: gl.LINES,
      indexType: gl.UNSIGNED_SHORT
    }]
  };
}

function createWebGLParticleModel(gl: WebGL2RenderingContext, effect: AuraEffectNode): WebGLModel {
  const count = Math.max(120, Math.min(1800, effect.particleCount ?? 900));
  const positions = new Float32Array(count * 2 * 3);
  const normals = new Float32Array(count * 2 * 3);
  const indices = new Uint16Array(count * 2);
  const radius = effect.radius ?? 1.15;
  const height = effect.height ?? 2.4;
  for (let index = 0; index < count; index += 1) {
    const base = index * 6;
    writeParticlePosition(positions, index * 2, 0, effect.emitter ?? "swirl", radius, height, index);
    positions[base + 3] = positions[base] + seededRange(index, 239, -0.025, 0.025);
    positions[base + 4] = positions[base + 1] + 0.035;
    positions[base + 5] = positions[base + 2] + seededRange(index, 241, -0.025, 0.025);
    normals.set([0, 1, 0, 0, 1, 0], base);
    indices[index * 2] = index * 2;
    indices[index * 2 + 1] = index * 2 + 1;
  }
  return {
    bounds: { min: [-radius * 2, 0, -radius * 2], max: [radius * 2, height, radius * 2] },
    color: colorToRgb(effect.color ?? "#7dfcff"),
    normalizeToUnit: false,
    modelMatrix: identity4(),
    primitives: [{
      position: createBuffer(gl, gl.ARRAY_BUFFER, positions),
      normal: createBuffer(gl, gl.ARRAY_BUFFER, normals),
      index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices),
      count: indices.length,
      mode: gl.LINES,
      indexType: gl.UNSIGNED_SHORT
    }]
  };
}

function createBuffer(gl: WebGL2RenderingContext, target: number, data: Float32Array | Uint16Array | Uint32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 buffer allocation failed. Suggested fix: reload the page or reduce asset complexity.");
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data as unknown as BufferSource, gl.STATIC_DRAW);
  return buffer;
}

function createWebGLProgram(gl: WebGL2RenderingContext): {
  readonly program: WebGLProgram;
  readonly attributes: { readonly position: number; readonly normal: number };
  readonly uniforms: {
    readonly model: WebGLUniformLocation;
    readonly viewProjection: WebGLUniformLocation;
    readonly color: WebGLUniformLocation;
    readonly lightDirection: WebGLUniformLocation;
  };
} {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
uniform mat4 u_model;
uniform mat4 u_viewProjection;
out vec3 v_normal;
out vec3 v_world;
void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  v_world = world.xyz;
  v_normal = normalize(mat3(u_model) * a_normal);
  gl_Position = u_viewProjection * world;
}`);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec3 v_normal;
in vec3 v_world;
uniform vec3 u_color;
uniform vec3 u_lightDirection;
out vec4 outColor;
void main() {
  vec3 normal = normalize(v_normal);
  float key = max(dot(normal, normalize(u_lightDirection)), 0.0);
  float rim = pow(1.0 - max(dot(normal, normalize(vec3(0.0, 0.35, 1.0))), 0.0), 2.0);
  vec3 color = u_color * (0.28 + key * 0.74) + vec3(0.35, 0.65, 1.0) * rim * 0.22;
  outColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}`);
  const program = gl.createProgram();
  if (!program) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 program allocation failed.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 shader link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  const uniforms = {
    model: requiredUniform(gl, program, "u_model"),
    viewProjection: requiredUniform(gl, program, "u_viewProjection"),
    color: requiredUniform(gl, program, "u_color"),
    lightDirection: requiredUniform(gl, program, "u_lightDirection")
  };
  return {
    program,
    attributes: {
      position: gl.getAttribLocation(program, "a_position"),
      normal: gl.getAttribLocation(program, "a_normal")
    },
    uniforms
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 shader allocation failed.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 shader compile failed: ${gl.getShaderInfoLog(shader) ?? "unknown error"}`);
  }
  return shader;
}

function requiredUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 shader is missing uniform ${name}.`);
  return location;
}

function webglDrawMode(gl: WebGL2RenderingContext, mode: number): number {
  if (mode === 0) return gl.POINTS;
  if (mode === 1) return gl.LINES;
  if (mode === 3) return gl.LINE_STRIP;
  if (mode === 5) return gl.TRIANGLE_STRIP;
  return gl.TRIANGLES;
}

async function loadGltfForWebGL(url: string): Promise<GltfModel> {
  const absoluteUrl = new URL(url, document.baseURI).href;
  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new AuraRuntimeError("failed-glb-load", `Aura3D failed to fetch model "${url}" (${response.status}). Suggested fix: confirm the asset is in public/aura-assets and run aura3d assets validate.`);
  }
  const bytes = await response.arrayBuffer();
  const loaded = isGlb(bytes) ? parseGlb(bytes) : { json: JSON.parse(new TextDecoder().decode(bytes)) as GltfJson, buffers: [] as ArrayBuffer[] };
  const buffers = loaded.buffers.length > 0 ? loaded.buffers : await loadExternalGltfBuffers(loaded.json, absoluteUrl);
  return createGltfModel(loaded.json, buffers);
}

function isGlb(bytes: ArrayBuffer): boolean {
  return new DataView(bytes).getUint32(0, true) === 0x46546c67;
}

function parseGlb(bytes: ArrayBuffer): { readonly json: GltfJson; readonly buffers: readonly ArrayBuffer[] } {
  const view = new DataView(bytes);
  if (view.getUint32(4, true) !== 2) {
    throw new AuraRuntimeError("failed-glb-load", "Aura3D only supports glTF 2.0 GLB assets in the browser renderer.");
  }
  let offset = 12;
  let json: GltfJson | undefined;
  const buffers: ArrayBuffer[] = [];
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunk = bytes.slice(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    if (chunkType === 0x004e4942) buffers.push(chunk);
    offset += 8 + chunkLength;
  }
  if (!json) throw new AuraRuntimeError("failed-glb-load", "Aura3D could not find a JSON chunk in the GLB asset.");
  return { json, buffers };
}

async function loadExternalGltfBuffers(json: GltfJson, modelUrl: string): Promise<readonly ArrayBuffer[]> {
  return await Promise.all((json.buffers ?? []).map(async (buffer) => {
    if (!buffer.uri) return new ArrayBuffer(0);
    if (buffer.uri.startsWith("data:")) return dataUriToArrayBuffer(buffer.uri);
    const response = await fetch(new URL(buffer.uri, modelUrl).href);
    if (!response.ok) throw new AuraRuntimeError("failed-glb-load", `Aura3D failed to fetch glTF buffer "${buffer.uri}" (${response.status}).`);
    return await response.arrayBuffer();
  }));
}

function dataUriToArrayBuffer(uri: string): ArrayBuffer {
  const [, data = ""] = uri.split(",", 2);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function createGltfModel(json: GltfJson, buffers: readonly ArrayBuffer[]): GltfModel {
  const primitives: GltfPrimitive[] = [];
  let bounds: GltfBounds | undefined;

  const pushMesh = (meshIndex: number, matrix: Float32Array): void => {
    const mesh = json.meshes?.[meshIndex];
    if (!mesh) return;
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = primitive.attributes?.POSITION;
      if (positionAccessor === undefined) continue;
      const sourcePositions = readAccessor(json, buffers, positionAccessor, 3);
      const sourceNormals = primitive.attributes?.NORMAL === undefined
        ? createDefaultNormals(sourcePositions.length / 3)
        : readAccessor(json, buffers, primitive.attributes.NORMAL, 3);
      const positions = transformPositions(sourcePositions, matrix);
      const normals = transformNormals(sourceNormals, matrix);
      const indices = primitive.indices === undefined ? undefined : readIndices(json, buffers, primitive.indices);
      const primitiveBounds = boundsFromPositions(positions);
      bounds = bounds ? mergeBounds(bounds, primitiveBounds) : primitiveBounds;
      primitives.push({
        positions,
        normals,
        ...(indices ? { indices } : {}),
        mode: primitive.mode ?? 4,
        color: materialColor(json, primitive.material)
      });
    }
  };

  const visitNode = (nodeIndex: number, parentMatrix: Float32Array, stack: Set<number>): void => {
    if (stack.has(nodeIndex)) return;
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const localMatrix = gltfNodeMatrix(node);
    const worldMatrix = multiply4(parentMatrix, localMatrix);
    const nextStack = new Set(stack);
    nextStack.add(nodeIndex);
    if (node.mesh !== undefined) pushMesh(node.mesh, worldMatrix);
    for (const childIndex of node.children ?? []) visitNode(childIndex, worldMatrix, nextStack);
  };

  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes;
  if (json.nodes?.length && sceneRoots?.length) {
    for (const nodeIndex of sceneRoots) visitNode(nodeIndex, identity4(), new Set());
  } else if (json.nodes?.length) {
    const childNodes = new Set<number>();
    for (const node of json.nodes) for (const childIndex of node.children ?? []) childNodes.add(childIndex);
    const roots = json.nodes.map((_, nodeIndex) => nodeIndex).filter((nodeIndex) => !childNodes.has(nodeIndex));
    for (const nodeIndex of roots.length > 0 ? roots : json.nodes.map((_, nodeIndex) => nodeIndex)) visitNode(nodeIndex, identity4(), new Set());
  } else {
    for (let meshIndex = 0; meshIndex < (json.meshes?.length ?? 0); meshIndex += 1) pushMesh(meshIndex, identity4());
  }

  if (primitives.length === 0) {
    throw new AuraRuntimeError("failed-glb-load", "Aura3D found no mesh primitives with POSITION data in the model. Suggested fix: export a visible mesh to GLB/glTF.");
  }
  return { primitives, bounds: bounds ?? { min: [-1, -1, -1], max: [1, 1, 1] } };
}

function materialColor(json: GltfJson, materialIndex: number | undefined): readonly [number, number, number] | undefined {
  if (materialIndex === undefined) return undefined;
  const materialEntry = json.materials?.[materialIndex];
  const base = materialEntry?.pbrMetallicRoughness?.baseColorFactor;
  if (base && base.length >= 3) return [clamp01(base[0]!), clamp01(base[1]!), clamp01(base[2]!)];
  const emissive = materialEntry?.emissiveFactor;
  if (emissive && emissive.length >= 3) return [clamp01(emissive[0]!), clamp01(emissive[1]!), clamp01(emissive[2]!)];
  return undefined;
}

function createPlaneGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  return {
    positions: new Float32Array([
      -0.5, 0, -0.5,
      0.5, 0, -0.5,
      0.5, 0, 0.5,
      -0.5, 0, 0.5
    ]),
    normals: new Float32Array([
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    bounds: { min: [-0.5, 0, -0.5], max: [0.5, 0, 0.5] }
  };
}

function createBoxGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const positions = new Float32Array([
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
    -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
  ]);
  return {
    positions,
    normals,
    indices: new Uint16Array([
      0, 1, 2, 0, 2, 3,
      4, 5, 6, 4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23
    ]),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  };
}

function createSphereGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const rows = 12;
  const columns = 16;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const theta = v * Math.PI;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const phi = u * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      positions.push(x * 0.5, y * 0.5, z * 0.5);
      normals.push(x, y, z);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  };
}

function createCylinderGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const segments = 24;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 0.5;
    const z = Math.sin(angle) * 0.5;
    positions.push(x, -0.5, z, x, 0.5, z);
    normals.push(Math.cos(angle), 0, Math.sin(angle), Math.cos(angle), 0, Math.sin(angle));
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  const topCenter = positions.length / 3;
  positions.push(0, 0.5, 0);
  normals.push(0, 1, 0);
  const bottomCenter = positions.length / 3;
  positions.push(0, -0.5, 0);
  normals.push(0, -1, 0);
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(topCenter, base + 1, base + 3);
    indices.push(bottomCenter, base + 2, base);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  };
}

function readAccessor(json: GltfJson, buffers: readonly ArrayBuffer[], accessorIndex: number, expectedComponents: number): Float32Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.bufferView === undefined) throw new AuraRuntimeError("failed-glb-load", `Aura3D could not read glTF accessor ${accessorIndex}.`);
  const componentCount = componentCountForAccessor(accessor.type);
  const output = new Float32Array(accessor.count * expectedComponents);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new AuraRuntimeError("failed-glb-load", `Aura3D could not read glTF bufferView ${accessor.bufferView}.`);
  const buffer = buffers[view.buffer];
  if (!buffer) throw new AuraRuntimeError("failed-glb-load", `Aura3D could not read glTF buffer ${view.buffer}.`);
  const data = new DataView(buffer);
  const componentBytes = componentByteLength(accessor.componentType);
  const stride = view.byteStride ?? componentBytes * componentCount;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let row = 0; row < accessor.count; row += 1) {
    for (let component = 0; component < expectedComponents; component += 1) {
      output[row * expectedComponents + component] = component < componentCount
        ? readAccessorComponent(data, start + row * stride + component * componentBytes, accessor.componentType, Boolean(accessor.normalized))
        : component === 1 ? 1 : 0;
    }
  }
  return output;
}

function readIndices(json: GltfJson, buffers: readonly ArrayBuffer[], accessorIndex: number): Uint16Array | Uint32Array {
  const values = readAccessor(json, buffers, accessorIndex, 1);
  const max = values.reduce((largest, value) => Math.max(largest, value), 0);
  return max > 65535 ? Uint32Array.from(values) : Uint16Array.from(values);
}

function readAccessorComponent(data: DataView, offset: number, componentType: number, normalized: boolean): number {
  if (componentType === 5126) return data.getFloat32(offset, true);
  if (componentType === 5125) return normalizeComponent(data.getUint32(offset, true), 4294967295, normalized);
  if (componentType === 5123) return normalizeComponent(data.getUint16(offset, true), 65535, normalized);
  if (componentType === 5121) return normalizeComponent(data.getUint8(offset), 255, normalized);
  if (componentType === 5122) return normalizeSignedComponent(data.getInt16(offset, true), 32767, normalized);
  if (componentType === 5120) return normalizeSignedComponent(data.getInt8(offset), 127, normalized);
  throw new AuraRuntimeError("failed-glb-load", `Aura3D does not support glTF component type ${componentType}.`);
}

function normalizeComponent(value: number, max: number, normalized: boolean): number {
  return normalized ? value / max : value;
}

function normalizeSignedComponent(value: number, max: number, normalized: boolean): number {
  return normalized ? Math.max(-1, value / max) : value;
}

function componentByteLength(componentType: number): number {
  if (componentType === 5120 || componentType === 5121) return 1;
  if (componentType === 5122 || componentType === 5123) return 2;
  if (componentType === 5125 || componentType === 5126) return 4;
  throw new AuraRuntimeError("failed-glb-load", `Aura3D does not support glTF component type ${componentType}.`);
}

function componentCountForAccessor(type: string): number {
  if (type === "SCALAR") return 1;
  if (type === "VEC2") return 2;
  if (type === "VEC3") return 3;
  if (type === "VEC4") return 4;
  if (type === "MAT4") return 16;
  return 1;
}

function createDefaultNormals(count: number): Float32Array {
  const normals = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    normals[index * 3 + 1] = 1;
  }
  return normals;
}

function gltfNodeMatrix(node: NonNullable<GltfJson["nodes"]>[number]): Float32Array {
  if (node.matrix?.length === 16) return new Float32Array(node.matrix);
  const translate = node.translation ?? [0, 0, 0];
  const rotate = node.rotation ?? [0, 0, 0, 1];
  const scale = node.scale ?? [1, 1, 1];
  return multiply4(
    translation(translate[0] ?? 0, translate[1] ?? 0, translate[2] ?? 0),
    multiply4(
      rotationQuaternion(rotate),
      scaling(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1)
    )
  );
}

function rotationQuaternion(rotation: readonly number[]): Float32Array {
  const length = Math.hypot(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0, rotation[3] ?? 1) || 1;
  const x = (rotation[0] ?? 0) / length;
  const y = (rotation[1] ?? 0) / length;
  const z = (rotation[2] ?? 0) / length;
  const w = (rotation[3] ?? 1) / length;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return new Float32Array([
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1
  ]);
}

function transformPositions(positions: Float32Array, matrix: Float32Array): Float32Array {
  const output = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!;
    const y = positions[index + 1]!;
    const z = positions[index + 2]!;
    output[index] = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
    output[index + 1] = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
    output[index + 2] = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!;
  }
  return output;
}

function transformNormals(normals: Float32Array, matrix: Float32Array): Float32Array {
  const output = new Float32Array(normals.length);
  for (let index = 0; index < normals.length; index += 3) {
    const x = normals[index]!;
    const y = normals[index + 1]!;
    const z = normals[index + 2]!;
    const nx = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z;
    const ny = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z;
    const nz = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z;
    const length = Math.hypot(nx, ny, nz) || 1;
    output[index] = nx / length;
    output[index + 1] = ny / length;
    output[index + 2] = nz / length;
  }
  return output;
}

function boundsFromPositions(positions: Float32Array): GltfBounds {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let index = 0; index < positions.length; index += 3) {
    min[0] = Math.min(min[0], positions[index]!);
    min[1] = Math.min(min[1], positions[index + 1]!);
    min[2] = Math.min(min[2], positions[index + 2]!);
    max[0] = Math.max(max[0], positions[index]!);
    max[1] = Math.max(max[1], positions[index + 1]!);
    max[2] = Math.max(max[2], positions[index + 2]!);
  }
  return { min, max };
}

function mergeBounds(a: GltfBounds, b: GltfBounds): GltfBounds {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]
  };
}

function createViewProjection(snapshot: AuraSceneSnapshot, aspect: number, time: number): Float32Array {
  const cameraSpec = snapshot.camera;
  const target = resolveCameraTarget(snapshot, cameraSpec);
  let eye: AuraVec3 = cameraSpec.position ?? [0, 1.4, cameraSpec.distance ?? 4];
  if (cameraSpec.mode === "orbit") {
    const distance = cameraSpec.distance ?? 4;
    eye = cameraSpec.position ?? [target[0] + distance * 0.62, target[1] + distance * 0.42, target[2] + distance * 0.78];
  }
  if (cameraSpec.mode === "follow") {
    const distance = cameraSpec.distance ?? 4;
    eye = cameraSpec.position ?? [target[0] - distance * 0.38, target[1] + distance * 0.52, target[2] + distance * 0.82];
  }
  if (cameraSpec.mode === "dolly") {
    const seconds = cameraSpec.seconds ?? 6;
    const phase = (time / 1000 % seconds) / seconds;
    const eased = 0.5 - Math.cos(phase * Math.PI * 2) * 0.5;
    const from = cameraSpec.from ?? [0, 1.4, 5];
    const to = cameraSpec.to ?? [0, 1.2, 3.4];
    eye = mix3(from, to, eased);
  }
  const view = lookAt(eye, target, [0, 1, 0]);
  const projection = perspective(((cameraSpec.fov ?? 45) * Math.PI) / 180, aspect, 0.05, 100);
  return multiply4(projection, view);
}

function createModelMatrix(node: AuraModelNode | AuraPrimitiveNode | undefined, bounds: GltfBounds, normalizeToUnit: boolean, time = 0): Float32Array {
  const extent = [
    Math.max(0.001, bounds.max[0] - bounds.min[0]),
    Math.max(0.001, bounds.max[1] - bounds.min[1]),
    Math.max(0.001, bounds.max[2] - bounds.min[2])
  ] as const;
  const fitScale = normalizeToUnit ? 1.55 / Math.max(extent[0], extent[1], extent[2]) : 1;
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const baseSize = node?.kind === "primitive" ? primitiveSize(node) : [1, 1, 1] as const;
  const nodeScale = typeof node?.scale === "number" ? [node.scale, node.scale, node.scale] as const : node?.scale ?? [1, 1, 1] as const;
  const position = animatedPosition(node, time);
  const rotation = animatedRotation(node, time);
  return multiply4(
    translation(position[0], position[1], position[2]),
    multiply4(
      rotationXYZ(rotation),
      multiply4(
        scaling(nodeScale[0] * baseSize[0] * fitScale, nodeScale[1] * baseSize[1] * fitScale, nodeScale[2] * baseSize[2] * fitScale),
        normalizeToUnit ? translation(-centerX, -bounds.min[1], -centerZ) : identity4()
      )
    )
  );
}

function animatedPosition(node: AuraModelNode | AuraPrimitiveNode | undefined, time: number): AuraVec3 {
  const basePosition = node?.position ?? [0, 0, 0];
  if (node?.animation?.clip !== "float") return basePosition;
  const speed = Math.max(0.05, node.animation.speed ?? 1);
  return [basePosition[0], basePosition[1] + Math.sin((time / 1000) * speed) * 0.08, basePosition[2]];
}

function animatedRotation(node: AuraModelNode | AuraPrimitiveNode | undefined, time: number): AuraVec3 {
  const baseRotation = node?.rotation ?? [0, 0, 0];
  if (!node?.animation) return baseRotation;
  const speed = Math.max(0.05, node.animation.speed ?? 1);
  const seconds = time / 1000;
  if (node.animation.clip === "turntable") {
    return [baseRotation[0], baseRotation[1] + seconds * speed * 0.72, baseRotation[2]];
  }
  if (node.animation.clip === "float") {
    return [baseRotation[0], baseRotation[1] + seconds * speed * 0.28, baseRotation[2]];
  }
  if (node.animation.clip === "pulse" || node.animation.clip === "walk") return baseRotation;
  return [baseRotation[0], baseRotation[1] + seconds * speed, baseRotation[2]];
}

function primitiveSize(node: AuraPrimitiveNode): AuraVec3 {
  if (typeof node.size === "number") return [node.size, node.size, node.size];
  return node.size ?? [1, 1, 1];
}

function perspective(fovRadians: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovRadians / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function lookAt(eye: AuraVec3, target: AuraVec3, up: AuraVec3): Float32Array {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1
  ]);
}

function multiply4(a: Float32Array, b: Float32Array): Float32Array {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row]! * b[column * 4]! +
        a[4 + row]! * b[column * 4 + 1]! +
        a[8 + row]! * b[column * 4 + 2]! +
        a[12 + row]! * b[column * 4 + 3]!;
    }
  }
  return output;
}

function translation(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function identity4(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function scaling(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ]);
}

function rotationXYZ(rotation: AuraVec3): Float32Array {
  const [x, y, z] = rotation;
  const cx = Math.cos(x); const sx = Math.sin(x);
  const cy = Math.cos(y); const sy = Math.sin(y);
  const cz = Math.cos(z); const sz = Math.sin(z);
  const rx = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  const ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rz = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return multiply4(rz, multiply4(ry, rx));
}

function colorToRgb(color: AuraColor): readonly [number, number, number] {
  const clear = colorToClearColor(color);
  return [clear[0], clear[1], clear[2]];
}

function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): readonly [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function scaleRgb(value: readonly [number, number, number], scale: number): readonly [number, number, number] {
  return clampRgb([value[0] * scale, value[1] * scale, value[2] * scale]);
}

function clampRgb(value: readonly [number, number, number]): readonly [number, number, number] {
  return [
    clamp01(value[0]),
    clamp01(value[1]),
    clamp01(value[2])
  ];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalize3(value: AuraVec3): AuraVec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross3(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot3(a: AuraVec3, b: AuraVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function mix3(a: AuraVec3, b: AuraVec3, t: number): AuraVec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function productionRenderErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function normalizeSceneSnapshot(value: AuraSceneBuilder | AuraSceneSnapshot): AuraSceneSnapshot {
  return value instanceof AuraSceneBuilder ? value.toJSON() : value;
}

function resolveCanvas(target: AuraAppTarget): HTMLCanvasElement {
  if (!target) {
    throw new AuraRuntimeError(
      "missing-canvas",
      "Aura3D could not mount because the app target was null or undefined. Suggested fix: pass a selector like createAuraApp(\"#app\", ...) or check document.querySelector before mounting."
    );
  }
  if (typeof target === "string") {
    if (typeof document === "undefined") {
      throw new AuraRuntimeError(
        "missing-canvas",
        `Aura3D could not find canvas target "${target}" because document is unavailable. Suggested fix: run createAuraApp in a browser or pass an HTMLCanvasElement.`
      );
    }
    const element = document.querySelector(target);
    if (!element) {
      throw new AuraRuntimeError(
        "missing-canvas",
        `Aura3D could not find canvas target "${target}". Suggested fix: add <canvas id="${target.replace(/^#/, "")}"></canvas> or pass an existing element.`
      );
    }
    if (element instanceof HTMLCanvasElement) return element;
    if (element instanceof HTMLElement) return appendCanvas(element);
    throw new AuraRuntimeError(
      "missing-canvas",
      `Aura3D target "${target}" is not an HTMLElement. Suggested fix: pass a canvas or container element.`
    );
  }
  return target instanceof HTMLCanvasElement ? target : appendCanvas(target);
}

function appendCanvas(target: HTMLElement): HTMLCanvasElement {
  applyDefaultCanvasMountLayout(target);
  const canvas = document.createElement("canvas");
  canvas.dataset.aura3dCanvas = "true";
  target.append(canvas);
  return canvas;
}

function applyDefaultCanvasMountLayout(target: HTMLElement): void {
  if (typeof window === "undefined") return;
  if (target.parentElement === document.body && !target.hasAttribute("data-aura3d-preserve-page-layout")) {
    document.documentElement.style.width ||= "100%";
    document.documentElement.style.height ||= "100%";
    document.body.style.width ||= "100%";
    document.body.style.height ||= "100%";
    document.body.style.margin ||= "0";
    document.body.style.overflow ||= "hidden";
  }
  target.style.width ||= "100%";
  target.style.height ||= "100vh";
  target.style.minHeight ||= "100vh";
  target.style.position ||= "relative";
  target.style.overflow ||= "hidden";
}

function configureCanvas(canvas: HTMLCanvasElement, pixelRatio: number, resize: boolean): void {
  canvas.style.width ||= "100%";
  canvas.style.height ||= "100%";
  canvas.style.display ||= "block";
  const rect = canvas.getBoundingClientRect();
  const parent = canvas.parentElement;
  const cssWidth = rect.width || canvas.clientWidth || parent?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 960) || 960;
  const cssHeight = rect.height || canvas.clientHeight || parent?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 540) || 540;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const width = Math.max(320, Math.round(cssWidth * pixelRatio));
  const height = Math.max(220, Math.round(cssHeight * pixelRatio));
  canvas.width = resize ? width : canvas.width || width;
  canvas.height = resize ? height : canvas.height || height;
}

function validateSceneAssets(snapshot: AuraSceneSnapshot, assets: AuraAssetLoadState[]): void {
  for (const node of snapshot.nodes) {
    if (node.kind !== "model") continue;
    const asset = node.asset;
    if (!asset.url && !asset.optional) {
      throw new AuraRuntimeError(
        "missing-asset",
        `Aura3D asset "${asset.id}" is missing a URL. Suggested fix: run aura3d assets add ./asset.glb --name ${asset.id}.`
      );
    }
    if (asset.type === "model" && !["glb", "gltf"].includes(asset.format)) {
      throw new AuraRuntimeError(
        "failed-glb-load",
        `Aura3D model "${asset.id}" uses unsupported format "${asset.format}". Suggested fix: export GLB/glTF or add an explicit loader before using model(assets.${asset.id}).`
      );
    }
    assets.push({
      id: asset.id,
      type: asset.type,
      url: asset.url,
      status: asset.url ? "ready" : "optional-missing",
      message: asset.url ? undefined : "Optional placeholder asset has no URL yet."
    });
    validateMaterialTexture(node.material);
  }
}

function validateMaterialTexture(materialSpec?: AuraMaterialSpec): void {
  const texture = materialSpec?.texture;
  if (!texture) return;
  if (!["png", "jpg", "jpeg", "webp", "ktx2"].includes(texture.format)) {
    throw new AuraRuntimeError(
      "unsupported-texture",
      `Aura3D texture asset "${texture.id}" uses unsupported format "${texture.format}". Suggested fix: use png, jpg, jpeg, webp, or ktx2 textures.`
    );
  }
}

interface MutableDiagnostics {
  backend: AuraBackend;
  fps: number;
  drawCalls: number;
  renderSize: [number, number];
  assets: AuraAssetLoadState[];
  warnings: string[];
  errors: string[];
}

function createInitialDiagnostics(snapshot: AuraSceneSnapshot): MutableDiagnostics {
  return {
    backend: "headless",
    fps: 0,
    drawCalls: 0,
    renderSize: [0, 0],
    assets: [],
    warnings: snapshot.nodes.length === 0 ? ["Scene contains no renderable nodes. Add model(assets.assetId) or primitives.box()."] : [],
    errors: []
  };
}

function snapshotDiagnostics(value: MutableDiagnostics): AuraDiagnostics {
  return {
    backend: value.backend,
    fps: value.fps,
    drawCalls: value.drawCalls,
    renderSize: value.renderSize,
    assets: [...value.assets],
    warnings: [...value.warnings],
    errors: [...value.errors]
  };
}

function collectGeneratedCodeWarnings(snapshot: AuraSceneSnapshot): string[] {
  const warnings: string[] = [];
  if (!snapshot.nodes.some((node) => node.kind === "light")) {
    warnings.push("Scene has no lights. Suggested fix: add lights.studio() or lights.ambient().");
  }
  if (!snapshot.nodes.some((node) => node.kind === "interaction")) {
    warnings.push("Scene has no interactions. Suggested fix: add interactions.orbit() for product/viewer scenes.");
  }
  for (const node of snapshot.nodes) {
    if (node.kind === "model" && node.asset.id === "unsafe-url") {
      warnings.push(`Model uses unsafeModelUrl("${node.asset.url}"). Suggested fix: run assets add and use typed assets.`);
    }
  }
  return warnings;
}

function renderSceneToCanvas(canvas: HTMLCanvasElement | undefined, snapshot: AuraSceneSnapshot, time: number): number {
  if (!canvas) return 0;
  const context = canvas.getContext("2d");
  if (!context) return 0;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, snapshot.background);
  gradient.addColorStop(1, shadeColor(snapshot.background, -32));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height);
  let drawCalls = 1;
  snapshot.nodes.forEach((node, index) => {
    if (node.kind === "model" || node.kind === "primitive") {
      drawRenderableNode(context, width, height, node, index, time);
      drawCalls += 1;
    }
    if (node.kind === "effect") {
      drawEffect(context, width, height, node, time);
      drawCalls += 1;
    }
  });
  return drawCalls;
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  const horizon = height * 0.68;
  for (let i = 0; i < 12; i += 1) {
    const y = horizon + i * 18;
    context.beginPath();
    context.moveTo(width * 0.12, y);
    context.lineTo(width * 0.88, y);
    context.stroke();
  }
  for (let i = -6; i <= 6; i += 1) {
    context.beginPath();
    context.moveTo(width * 0.5 + i * 38, horizon);
    context.lineTo(width * 0.5 + i * 80, height);
    context.stroke();
  }
  context.restore();
}

function drawRenderableNode(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  node: AuraModelNode | AuraPrimitiveNode,
  index: number,
  time: number
): void {
  const x = width * 0.5 + ((node.position?.[0] ?? index - 1) * width) / 8;
  const y = height * 0.58 - ((node.position?.[1] ?? 0) * height) / 7;
  const phase = Math.sin(time / 900 + index) * 8;
  const primitiveSize = node.kind === "primitive" ? node.size : undefined;
  const size = typeof primitiveSize === "number" ? primitiveSize * 80 : typeof node.scale === "number" ? node.scale * 80 : 92;
  const color = node.material?.color ?? (node.kind === "model" ? "#77a7ff" : "#d7dee8");
  context.save();
  context.shadowColor = "rgba(56,214,255,0.34)";
  context.shadowBlur = 24;
  context.fillStyle = color;
  if (node.kind === "primitive" && node.primitive === "sphere") {
    context.beginPath();
    context.arc(x, y + phase, size * 0.46, 0, Math.PI * 2);
    context.fill();
  } else if (node.kind === "primitive" && node.primitive === "cylinder") {
    context.beginPath();
    context.ellipse(x, y - size * 0.34 + phase, size * 0.46, size * 0.16, 0, 0, Math.PI * 2);
    context.rect(x - size * 0.46, y - size * 0.34 + phase, size * 0.92, size * 0.68);
    context.ellipse(x, y + size * 0.34 + phase, size * 0.46, size * 0.16, 0, 0, Math.PI * 2);
    context.fill();
  } else if (node.kind === "primitive" && node.primitive === "plane") {
    context.fillRect(x - size * 0.7, y - size * 0.16, size * 1.4, size * 0.32);
  } else {
    context.beginPath();
    context.moveTo(x, y - size * 0.58 + phase);
    context.lineTo(x + size * 0.54, y - size * 0.18 + phase);
    context.lineTo(x + size * 0.34, y + size * 0.55 + phase);
    context.lineTo(x - size * 0.42, y + size * 0.48 + phase);
    context.lineTo(x - size * 0.58, y - size * 0.16 + phase);
    context.closePath();
    context.fill();
  }
  context.shadowBlur = 0;
  context.fillStyle = "rgba(255,255,255,0.78)";
  context.font = `${Math.max(12, width / 72)}px system-ui, sans-serif`;
  context.textAlign = "center";
  const label = node.kind === "model" ? node.asset.id : node.name ?? node.primitive;
  context.fillText(label, x, y + size * 0.76 + phase);
  context.restore();
}

function drawEffect(context: CanvasRenderingContext2D, width: number, height: number, node: AuraEffectNode, time: number): void {
  context.save();
  if (node.effect === "fog") {
    context.fillStyle = toAlphaColor(node.color ?? "#9fb7d9", node.density ?? 0.12);
    context.fillRect(0, height * 0.2, width, height * 0.8);
  }
  if (node.effect === "bloom") {
    const gradient = context.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, width * 0.46);
    gradient.addColorStop(0, toAlphaColor(node.color ?? "#ffffff", (node.intensity ?? 0.35) * 0.3));
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  if (node.effect === "rain") {
    const density = Math.max(0.2, Math.min(1.6, node.density ?? node.intensity ?? 0.72));
    const intensity = Math.max(0.1, Math.min(1.4, node.intensity ?? 0.4));
    const color = node.color ?? "#bcd7ff";
    const mist = context.createLinearGradient(0, height * 0.24, 0, height * 0.78);
    mist.addColorStop(0, toAlphaColor(color, node.mist === false ? 0 : 0.02 * intensity));
    mist.addColorStop(0.62, toAlphaColor(color, node.mist === false ? 0 : 0.09 * intensity));
    mist.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = mist;
    context.fillRect(0, height * 0.2, width, height * 0.72);
    const drawLayer = (count: number, length: number, alpha: number, lineWidth: number, speed: number, spread: number) => {
      context.strokeStyle = toAlphaColor(color, alpha);
      context.lineWidth = lineWidth;
      for (let i = 0; i < count; i += 1) {
        const x = (i * 47 + time * 0.045 * speed + spread) % width;
        const y = (i * 89 + time * 0.22 * speed) % (height * 0.82);
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - length * 0.27, y + length);
        context.stroke();
      }
    };
    drawLayer(Math.round(80 * density), 24, Math.min(0.24, intensity * 0.18), 1, 0.65, 11);
    drawLayer(Math.round(58 * density), 38, Math.min(0.42, intensity * 0.28), 1.2, 0.95, 37);
    drawLayer(Math.round(34 * density), 58, Math.min(0.62, intensity * 0.38), 1.6, 1.28, 73);
    if (node.splashes !== false) {
      context.strokeStyle = toAlphaColor(color, Math.min(0.32, intensity * 0.24));
      context.lineWidth = 1;
      for (let i = 0; i < Math.round(36 * density); i += 1) {
        const x = ((i * 83) % 100) / 100 * width;
        const y = height * (0.64 + ((i * 41) % 28) / 100);
        const radius = 3 + ((i * 17) % 8);
        context.beginPath();
        context.ellipse(x, y, radius * 1.9, radius * 0.42, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }
  if (node.effect === "particles") {
    const count = Math.max(120, Math.min(1600, node.particleCount ?? 900));
    const radius = Math.max(0.1, node.radius ?? 1.15);
    const height3d = Math.max(0.2, node.height ?? 2.4);
    const color = String(node.color ?? "#7dfcff");
    context.fillStyle = toAlphaColor(color, Math.min(0.9, 0.38 + (node.intensity ?? 0.8) * 0.22));
    for (let index = 0; index < count; index += 1) {
      const position = new Float32Array(3);
      writeParticlePosition(position, 0, time / 1000 * (node.speed ?? 1), node.emitter ?? "swirl", radius, height3d, index);
      const jitterX = seededRange(index, 251, -radius, radius);
      const jitterZ = seededRange(index, 257, -radius, radius);
      const x = width * 0.5 + (position[0] + jitterX * 0.18) * width * 0.09;
      const y = height * 0.68 - position[1] * height * 0.16 + jitterZ * height * 0.02;
      const size = seededRange(index, 263, 1.1, 2.9);
      context.fillRect(x, y, size, size);
    }
  }
  context.restore();
}

function shouldRenderOverlay(diagnostics: AuraCreateAppOptions["diagnostics"], snapshot: AuraSceneSnapshot): boolean {
  if (typeof diagnostics === "boolean") return diagnostics;
  if (diagnostics?.overlay || diagnostics?.assetPanel || diagnostics?.performancePanel) return true;
  return snapshot.diagnostics.enabled;
}

function createDiagnosticsOverlay(canvas: HTMLCanvasElement, diagnosticsState: MutableDiagnostics): { update(): void; dispose(): void } {
  const parent = canvas.parentElement ?? document.body;
  const overlay = document.createElement("div");
  overlay.className = "aura-diagnostics-overlay";
  overlay.style.cssText = [
    "position:absolute",
    "right:12px",
    "top:12px",
    "z-index:10",
    "font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
    "color:#ecf7ff",
    "background:rgba(6,10,18,0.82)",
    "border:1px solid rgba(146,176,210,0.36)",
    "border-radius:8px",
    "padding:10px 12px",
    "min-width:190px",
    "pointer-events:none"
  ].join(";");
  const computed = getComputedStyle(parent);
  if (computed.position === "static") parent.style.position = "relative";
  parent.append(overlay);
  const update = () => {
    const diagnostics = snapshotDiagnostics(diagnosticsState);
    overlay.innerHTML = [
      `<b>Aura3D diagnostics</b>`,
      `<div>backend: ${escapeHtml(diagnostics.backend)}</div>`,
      `<div>fps: ${diagnostics.fps}</div>`,
      `<div>draw calls: ${diagnostics.drawCalls}</div>`,
      `<div>render size: ${diagnostics.renderSize[0]} x ${diagnostics.renderSize[1]}</div>`,
      `<div>assets: ${diagnostics.assets.map((asset) => `${asset.id}:${asset.status}`).join(", ") || "none"}</div>`,
      diagnostics.warnings.length ? `<div>warnings: ${diagnostics.warnings.length}</div>` : ""
    ].join("");
  };
  update();
  return {
    update,
    dispose() {
      overlay.remove();
    }
  };
}

function markRouteReady(snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  markRouteState("ready", snapshot, diagnostics);
}

function markRouteError(snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  markRouteState("error", snapshot, diagnostics);
}

function markRouteState(status: "ready" | "error", snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  if (typeof document !== "undefined") {
    document.body.dataset.aura3dReady = status === "ready" ? "true" : "error";
    document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  }
  if (typeof window !== "undefined") {
    (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = {
      status,
      scene: snapshot,
      diagnostics: snapshotDiagnostics(diagnostics)
    };
  }
}

function devicePixelRatioSafe(): number {
  return typeof window === "undefined" ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function shadeColor(color: string, amount: number): string {
  if (!color.startsWith("#") || color.length < 7) return color;
  const value = Number.parseInt(color.slice(1, 7), 16);
  const red = clampChannel((value >> 16) + amount);
  const green = clampChannel(((value >> 8) & 0xff) + amount);
  const blue = clampChannel((value & 0xff) + amount);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function toAlphaColor(color: string, alpha: number): string {
  if (!color.startsWith("#") || color.length < 7) return `rgba(255,255,255,${alpha})`;
  const value = Number.parseInt(color.slice(1, 7), 16);
  return `rgba(${value >> 16},${(value >> 8) & 0xff},${value & 0xff},${alpha})`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
