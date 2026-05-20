import { linearToSrgbChannel } from "./ColorManagement";

export type V4RenderDebugView =
  | "base-color"
  | "normal"
  | "roughness"
  | "metallic"
  | "emissive"
  | "lighting-only"
  | "diffuse-ibl"
  | "specular-ibl"
  | "tone-mapped-output";

export interface V4DebugViewInput {
  readonly width: number;
  readonly height: number;
  readonly baseColor?: Uint8Array;
  readonly normal?: Uint8Array;
  readonly roughness?: Uint8Array;
  readonly metallic?: Uint8Array;
  readonly emissive?: Uint8Array;
  readonly lightingOnly?: Uint8Array;
  readonly diffuseIbl?: Uint8Array;
  readonly specularIbl?: Uint8Array;
  readonly toneMappedOutput?: Uint8Array;
}

export interface V4DebugViewResult {
  readonly view: V4RenderDebugView;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly source: string;
}

export const V4_REQUIRED_DEBUG_VIEWS: readonly V4RenderDebugView[] = [
  "base-color",
  "normal",
  "roughness",
  "metallic",
  "emissive",
  "lighting-only",
  "diffuse-ibl",
  "specular-ibl",
  "tone-mapped-output"
];

export function createV4DebugView(input: V4DebugViewInput, view: V4RenderDebugView): V4DebugViewResult {
  validateInput(input);
  const pixels = sourcePixels(input, view);
  if (pixels) {
    return { view, width: input.width, height: input.height, pixels: new Uint8Array(pixels), source: "provided-buffer" };
  }

  const fallback = new Uint8Array(input.width * input.height * 4);
  const color = fallbackColor(view);
  for (let index = 0; index < fallback.length; index += 4) {
    fallback[index] = color[0];
    fallback[index + 1] = color[1];
    fallback[index + 2] = color[2];
    fallback[index + 3] = 255;
  }
  return { view, width: input.width, height: input.height, pixels: fallback, source: "diagnostic-fallback" };
}

export function createV4DebugViewSet(input: V4DebugViewInput): readonly V4DebugViewResult[] {
  return V4_REQUIRED_DEBUG_VIEWS.map((view) => createV4DebugView(input, view));
}

export function encodeLinearDebugColor(color: readonly [number, number, number, number]): [number, number, number, number] {
  return [
    byte(linearToSrgbChannel(color[0])),
    byte(linearToSrgbChannel(color[1])),
    byte(linearToSrgbChannel(color[2])),
    byte(color[3])
  ];
}

function sourcePixels(input: V4DebugViewInput, view: V4RenderDebugView): Uint8Array | undefined {
  switch (view) {
    case "base-color":
      return input.baseColor;
    case "normal":
      return input.normal;
    case "roughness":
      return input.roughness;
    case "metallic":
      return input.metallic;
    case "emissive":
      return input.emissive;
    case "lighting-only":
      return input.lightingOnly;
    case "diffuse-ibl":
      return input.diffuseIbl;
    case "specular-ibl":
      return input.specularIbl;
    case "tone-mapped-output":
      return input.toneMappedOutput;
  }
}

function fallbackColor(view: V4RenderDebugView): readonly [number, number, number] {
  switch (view) {
    case "base-color":
      return [180, 180, 180];
    case "normal":
      return [128, 128, 255];
    case "roughness":
      return [96, 96, 96];
    case "metallic":
      return [16, 16, 16];
    case "emissive":
      return [0, 0, 0];
    case "lighting-only":
      return [210, 210, 210];
    case "diffuse-ibl":
      return [120, 150, 190];
    case "specular-ibl":
      return [220, 230, 245];
    case "tone-mapped-output":
      return [180, 190, 205];
  }
}

function validateInput(input: V4DebugViewInput): void {
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width <= 0 || input.height <= 0) {
    throw new Error("V4 debug view dimensions must be positive integers.");
  }
  for (const [name, pixels] of Object.entries(input)) {
    if (pixels instanceof Uint8Array && pixels.length !== input.width * input.height * 4) {
      throw new Error(`V4 debug view buffer ${name} must contain width * height * 4 RGBA bytes.`);
    }
  }
}

function byte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value * 255)));
}
