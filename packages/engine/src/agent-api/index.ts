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
  readonly primitive: "box" | "sphere" | "plane";
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

export type AuraEffectType = "fog" | "bloom" | "rain";

export interface AuraEffectNode {
  readonly kind: "effect";
  readonly effect: AuraEffectType;
  readonly intensity?: number;
  readonly density?: number;
  readonly color?: AuraColor;
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
  plane: (options?: AuraPrimitiveOptions) => primitive("plane", options)
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
  orbit: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => ({
    mode: "orbit",
    distance: options.distance ?? 4,
    target: options.target ?? [0, 0.8, 0],
    fov: options.fov ?? 45
  }),
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
      color: options.color ?? "#bcd7ff"
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

export type AuraPromptSceneType = "product-viewer" | "cinematic-scene" | "mini-game" | "material-studio";
export type AuraPromptEffectId = "rain" | "fog" | "bloom" | "wet-reflection" | "motion-trail" | "hud";
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
  readonly visualSystems: readonly string[];
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
      visualSystems: visualSystemsForPromptPlan(plan)
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
      .add(primitives.plane({ name: "charcoal sweep backdrop", material: material.emissive({ color: "#111923", emissive: "#182433" }) }).position(0, 1.02, -2.2).rotate(1.5708, 0, 0).scale([5.4, 1, 2.75]))
      .add(primitives.plane({ name: "matte graphite product table", material: material.pbr({ color: "#242c31", roughness: 0.48, metallic: 0.06 }) }).position(0, -0.06, -0.55).scale([4.8, 1, 3.25]))
      .add(primitives.box({ name: "left vertical softbox", material: material.emissive({ color: "#eef6ff", emissive: "#eef6ff" }) }).position(-1.9, 0.86, -0.92).rotate(0, 0.22, 0).scale([0.08, 1.24, 1.58]))
      .add(primitives.box({ name: "right cool flag", material: material.emissive({ color: "#35506c", emissive: "#4d708f" }) }).position(1.98, 0.75, -1.05).rotate(0, -0.18, 0).scale([0.08, 0.95, 1.38]))
      .add(primitives.box({ name: "warm table reflection", material: material.emissive({ color: "#7a5a39", emissive: "#9f7145" }) }).position(0.72, -0.01, 0.36).rotate(0, -0.12, 0).scale([1.1, 0.03, 0.18]))
      .add(model(asset, { name: plan.subject.label }).position(0, 0.02, -0.68).rotate(-0.12, -0.42, 0.02).scale(0.96))
      .add(lights.ambient({ intensity: 0.28, color: "#e8f1ff" }))
      .add(lights.point({ name: "large cool softbox", position: [-2.2, 2.45, 2.25], color: "#eef6ff", intensity: 2.75 }))
      .add(lights.point({ name: "front product fill", position: [0.35, 1.25, 2.2], color: "#f7fbff", intensity: 1.8 }))
      .add(lights.point({ name: "warm product rim", position: [2.1, 1.72, 0.15], color: "#ffd09a", intensity: 1.22 }))
      .add(effects.bloom({ intensity: 0.18, color: "#cfefff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.dolly({ from: [0.22, 1.12, 4.55], to: [0.05, 1.0, 3.55], target: [0, 0.58, -0.68], seconds: 7 }))
      .timeline(timeline.loop({ seconds: 7 })),

  "cinematic-scene": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#02040a")
      .add(primitives.plane({ name: "rainy alley back wall", material: material.emissive({ color: "#03070e", emissive: "#050b13" }) }).position(0, 1.06, -2.55).rotate(1.5708, 0, 0).scale([6.25, 1, 3.1]))
      .add(primitives.plane({ name: "black wet asphalt", material: material.pbr({ color: "#03070c", roughness: 0.08, metallic: 0.5 }) }).position(0, -0.07, -0.55).scale([7.0, 1, 5.9]))
      .add(primitives.box({ name: "left alley slab", material: material.pbr({ color: "#03060b", roughness: 0.46, metallic: 0.1 }) }).position(-2.9, 0.9, -0.95).rotate(0, 0.18, 0).scale([0.42, 2.25, 3.25]))
      .add(primitives.box({ name: "right alley slab", material: material.pbr({ color: "#03050a", roughness: 0.46, metallic: 0.1 }) }).position(2.95, 0.92, -1.05).rotate(0, -0.16, 0).scale([0.42, 2.35, 3.15]))
      .add(primitives.box({ name: "cyan neon sign", material: material.emissive({ color: "#32ddff", emissive: "#32ddff" }) }).position(-2.22, 1.35, -1.55).rotate(0.05, 0, -0.24).scale([0.055, 1.48, 0.12]))
      .add(primitives.box({ name: "short cyan practical", material: material.emissive({ color: "#63eaff", emissive: "#63eaff" }) }).position(-1.82, 0.74, -1.85).rotate(0.05, 0, 0.12).scale([0.045, 0.76, 0.12]))
      .add(primitives.sphere({ name: "warm street practical", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.86, 0.78, -1.28).scale(0.34))
      .add(primitives.box({ name: "amber wet reflection", material: material.emissive({ color: "#b36d39", emissive: "#c77f45" }) }).position(1.62, -0.005, -0.42).rotate(0, -0.08, 0).scale([0.86, 0.035, 0.24]))
      .add(primitives.box({ name: "cyan wet reflection", material: material.emissive({ color: "#1a6d86", emissive: "#2398b7" }) }).position(-1.22, -0.005, -0.34).rotate(0, 0.16, 0).scale([0.72, 0.03, 0.18]))
      .add(model(asset, { name: plan.subject.label }).position(-0.08, 0.02, -0.86).rotate(-0.08, -0.74, 0.02).scale(1.42))
      .add(lights.ambient({ intensity: 0.07, color: "#839dc6" }))
      .add(lights.point({ name: "hard cyan rim", position: [-2.35, 2.65, 0.85], color: "#38d6ff", intensity: 3.25 }))
      .add(lights.point({ name: "warm practical key", position: [2.35, 1.7, -0.25], color: "#ffd08a", intensity: 1.6 }))
      .add(lights.point({ name: "low floor bounce", position: [0.1, 0.45, 1.1], color: "#7edfff", intensity: 0.62 }))
      .add(effects.rain({ intensity: 0.46, color: "#c3e6ff" }))
      .add(effects.fog({ density: 0.08, color: "#32435a" }))
      .add(effects.bloom({ intensity: 0.36, color: "#6edfff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.dolly({ from: [0.5, 1.05, 4.65], to: [0.08, 0.86, 3.45], target: [-0.08, 0.52, -0.86], seconds: 8 }))
      .timeline(timeline.loop({ seconds: 8 })),

  "mini-game": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#030711")
      .add(primitives.plane({ name: "neon game board", material: material.pbr({ color: "#10222d", roughness: 0.5, metallic: 0.16 }) }).position(0, -0.08, -0.35).scale([5.8, 1, 4.05]))
      .add(primitives.box({ name: "north glass rail", material: material.emissive({ color: "#1b5e70", emissive: "#228aa4" }) }).position(0, 0.18, -2.18).scale([5.85, 0.32, 0.14]))
      .add(primitives.box({ name: "south glass rail", material: material.pbr({ color: "#18313e", roughness: 0.42, metallic: 0.12 }) }).position(0, 0.18, 1.52).scale([5.85, 0.32, 0.14]))
      .add(primitives.box({ name: "left glass rail", material: material.pbr({ color: "#172f3c", roughness: 0.42, metallic: 0.12 }) }).position(-2.76, 0.18, -0.35).scale([0.14, 0.32, 3.86]))
      .add(primitives.box({ name: "right glass rail", material: material.emissive({ color: "#1b5e70", emissive: "#228aa4" }) }).position(2.76, 0.18, -0.35).scale([0.14, 0.32, 3.86]))
      .add(primitives.box({ name: "start lane glow", material: material.emissive({ color: "#55e7ff", emissive: "#55e7ff" }) }).position(-1.98, 0.03, 0.62).scale([0.94, 0.045, 0.15]))
      .add(primitives.box({ name: "center lane stripe", material: material.emissive({ color: "#225f75", emissive: "#2c91ad" }) }).position(0.1, 0.025, 0.3).rotate(0, -0.28, 0).scale([1.75, 0.035, 0.08]))
      .add(model(asset, { name: plan.subject.label ?? "player" }).position(-1.42, 0.02, 0.54).rotate(0, 0.72, 0).scale(0.74))
      .add(primitives.box({ name: "orange boost pack", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(-1.08, 0.42, 0.48).rotate(0, 0.52, 0).scale([0.28, 0.08, 0.12]))
      .add(primitives.sphere({ name: "player shield ring", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-1.42, 0.08, 0.54).scale([0.72, 0.06, 0.72]))
      .add(primitives.box({ name: "cyan motion trail", material: material.emissive({ color: "#4fd7ff", emissive: "#4fd7ff" }) }).position(-2.08, 0.1, 0.58).scale([0.82, 0.075, 0.16]))
      .add(primitives.box({ name: "moving red hazard", material: material.emissive({ color: "#ff445f", emissive: "#ff445f" }) }).position(-0.18, 0.34, -0.18).rotate(0, 0.56, 0).scale([0.76, 0.52, 0.34]))
      .add(primitives.box({ name: "laser gate lower", material: material.emissive({ color: "#ff3159", emissive: "#ff3159" }) }).position(0.95, 0.22, -0.9).rotate(0, -0.14, 0).scale([1.02, 0.055, 0.08]))
      .add(primitives.box({ name: "laser gate upper", material: material.emissive({ color: "#ff3159", emissive: "#ff3159" }) }).position(0.95, 0.58, -0.9).rotate(0, -0.14, 0).scale([1.02, 0.055, 0.08]))
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
      .camera(camera.perspective({ position: [0, 3.05, 4.55], target: [0, 0.22, -0.35], fov: 41 }))
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

export function createAuraApp(target: string | HTMLElement | HTMLCanvasElement, options: AuraCreateAppOptions): AuraApp {
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
      "Aura3D production rendering requires at least one typed model asset or primitive. Suggested fix: add model(assets.product), primitives.box(), primitives.sphere(), or primitives.plane()."
      );
  }

  const renderer = await createProductionSceneRenderer(canvas, snapshot);

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
    if (options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
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
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(snapshot.background);
  const fog = snapshot.nodes.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "fog");
  if (fog) {
    threeScene.fog = new THREE.FogExp2(new THREE.Color(fog.color ?? "#9fb7d9"), Math.max(0.004, (fog.density ?? 0.1) * 0.045));
  }

  addThreeLights(THREE, threeScene, snapshot.nodes);
  const loader = new GLTFLoader();
  const disposables: any[] = [];

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
      disposables.push(modelRoot);
      continue;
    }
    if (node.kind === "primitive") {
      const mesh = createThreePrimitive(THREE, node);
      threeScene.add(mesh);
      disposables.push(mesh.geometry, mesh.material);
      continue;
    }
  }

  if (snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "rain")) {
    const rain = createThreeRain(THREE);
    threeScene.add(rain);
    disposables.push(rain.geometry, rain.material);
  }

  const cameraObject = new THREE.PerspectiveCamera(snapshot.camera.fov ?? 45, canvas.width / Math.max(1, canvas.height), 0.05, 100);

  return {
    render(time) {
      if (renderer.domElement.width !== canvas.width || renderer.domElement.height !== canvas.height) {
        renderer.setSize(canvas.width, canvas.height, false);
      }
      updateThreeCamera(THREE, cameraObject, snapshot.camera, canvas, time);
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
      light.castShadow = true;
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

function createThreePrimitive(THREE: typeof import("three"), node: AuraPrimitiveNode): any {
  const geometry = node.primitive === "sphere"
    ? new THREE.SphereGeometry(0.5, 40, 24)
    : node.primitive === "box"
      ? new THREE.BoxGeometry(1, 1, 1)
      : new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
  const materialValue = createThreeMaterial(THREE, node.material ?? material.pbr());
  const mesh = new THREE.Mesh(geometry, materialValue);
  mesh.castShadow = node.primitive !== "plane" && !node.material?.emissive;
  mesh.receiveShadow = true;
  applyThreeTransform(mesh, node, primitiveSize(node));
  return mesh;
}

function createThreeMaterial(THREE: typeof import("three"), spec: AuraMaterialSpec): any {
  const color = new THREE.Color(spec.color ?? "#d7dee8");
  const materialValue = new THREE.MeshStandardMaterial({
    color,
    roughness: spec.roughness ?? 0.54,
    metalness: spec.metallic ?? 0
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

function createThreeRain(THREE: typeof import("three")): any {
  const lineCount = 150;
  const vertices: number[] = [];
  for (let index = 0; index < lineCount; index += 1) {
    const x = ((index * 37) % 100) / 16 - 3.1;
    const z = ((index * 53) % 100) / 17 - 2.9;
    const y = 0.52 + ((index * 29) % 100) / 36;
    vertices.push(x, y, z, x - 0.08, y - 0.52, z + 0.035);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: "#c9e8ff", transparent: true, opacity: 0.74 }));
}

function updateThreeCamera(THREE: typeof import("three"), cameraObject: any, cameraSpec: AuraCameraSpec, canvas: HTMLCanvasElement, time: number): void {
  const target = cameraSpec.target ?? [0, 0.7, 0];
  let eye: AuraVec3 = cameraSpec.position ?? [0, 1.4, cameraSpec.distance ?? 4];
  if (cameraSpec.mode === "orbit") {
    const distance = cameraSpec.distance ?? 4;
    eye = [target[0], target[1] + 0.55, target[2] + distance];
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
  const models = [...assetModels, ...primitiveModels, ...rainModels];
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
      const viewProjection = createViewProjection(snapshot.camera, canvas.width / Math.max(1, canvas.height), time);
      gl.uniformMatrix4fv(program.uniforms.viewProjection, false, viewProjection);
      gl.uniform3fv(program.uniforms.lightDirection, new Float32Array(normalize3([0.45, 0.82, 0.36])));
      for (const modelEntry of models) {
        const modelMatrix = modelEntry.modelMatrix ?? createModelMatrix(modelEntry.node, modelEntry.bounds, modelEntry.normalizeToUnit);
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
  const primitive = node.primitive === "sphere" ? createSphereGeometry() : node.primitive === "box" ? createBoxGeometry() : createPlaneGeometry();
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

function createViewProjection(cameraSpec: AuraCameraSpec, aspect: number, time: number): Float32Array {
  const target = cameraSpec.target ?? [0, 0.7, 0];
  let eye: AuraVec3 = cameraSpec.position ?? [0, 1.4, cameraSpec.distance ?? 4];
  if (cameraSpec.mode === "orbit") {
    const distance = cameraSpec.distance ?? 4;
    eye = [target[0], target[1] + 0.55, target[2] + distance];
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

function createModelMatrix(node: AuraModelNode | AuraPrimitiveNode | undefined, bounds: GltfBounds, normalizeToUnit: boolean): Float32Array {
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
  const position = node?.position ?? [0, 0, 0];
  return multiply4(
    translation(position[0], position[1], position[2]),
    multiply4(
      rotationXYZ(node?.rotation ?? [0, 0, 0]),
      multiply4(
        scaling(nodeScale[0] * baseSize[0] * fitScale, nodeScale[1] * baseSize[1] * fitScale, nodeScale[2] * baseSize[2] * fitScale),
        normalizeToUnit ? translation(-centerX, -bounds.min[1], -centerZ) : identity4()
      )
    )
  );
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

function resolveCanvas(target: string | HTMLElement | HTMLCanvasElement): HTMLCanvasElement {
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
  const canvas = document.createElement("canvas");
  canvas.dataset.aura3dCanvas = "true";
  target.append(canvas);
  return canvas;
}

function configureCanvas(canvas: HTMLCanvasElement, pixelRatio: number, resize: boolean): void {
  canvas.style.width ||= "100%";
  canvas.style.height ||= "100%";
  canvas.style.display ||= "block";
  const rect = canvas.getBoundingClientRect();
  const parent = canvas.parentElement;
  const cssWidth = rect.width || canvas.clientWidth || parent?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 960) || 960;
  const cssHeight = rect.height || canvas.clientHeight || parent?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 540) || 540;
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
    context.strokeStyle = toAlphaColor(node.color ?? "#bcd7ff", Math.min(0.6, node.intensity ?? 0.4));
    context.lineWidth = 1;
    for (let i = 0; i < 80; i += 1) {
      const x = (i * 47 + time * 0.08) % width;
      const y = (i * 89 + time * 0.42) % height;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 9, y + 28);
      context.stroke();
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
