import { composeMat4 } from "@galileo3d/scene";
import { Geometry } from "../../Geometry";
import type { RenderItem } from "../../ForwardPass";
import { UnlitMaterial } from "../../UnlitMaterial";

export interface ContactShadowBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface ContactShadowPassOptions {
  readonly bounds: ContactShadowBounds;
  readonly floorY: number;
  readonly labelPrefix?: string;
  readonly opacity?: number;
  readonly lightDirection?: readonly [number, number, number];
  readonly softness?: number;
  readonly footprintPoints?: readonly (readonly [number, number, number])[];
}

export interface ContactShadowPassDiagnostics {
  readonly mode: "directional-multi-lobe-receiver-contact";
  readonly parity: "not-full-contact-shadow";
  readonly layerCount: number;
  readonly quality: "bounded-receiver-contact";
  readonly floorY: number;
  readonly receiverGap: number;
  readonly gapFade: number;
  readonly gapSpread: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly softness: number;
  readonly directionalOffset: readonly [number, number];
  readonly lightAngleFade: number;
  readonly projectionStretch: number;
  readonly projectionYawRadians: number;
  readonly footprintPointCount: number;
  readonly footprintLayerCount: number;
}

export interface ContactShadowPassResult {
  readonly renderItems: readonly RenderItem[];
  readonly diagnostics: ContactShadowPassDiagnostics;
  dispose(): void;
}

export function createContactShadowPass(options: ContactShadowPassOptions): ContactShadowPassResult {
  const bounds = options.bounds;
  const labelPrefix = options.labelPrefix ?? "g3d-contact-shadow";
  const opacity = clamp(options.opacity ?? 1, 0, 1);
  const softness = clamp(options.softness ?? 0.72, 0.15, 1);
  const lightDirection = normalize3(options.lightDirection ?? [-0.42, -0.82, -0.38]);
  const width = Math.max(0.001, bounds.max[0] - bounds.min[0]);
  const depth = Math.max(0.001, bounds.max[2] - bounds.min[2]);
  const height = Math.max(0.001, bounds.max[1] - bounds.min[1]);
  const receiverGap = Math.max(0, bounds.min[1] - options.floorY);
  const gapReference = Math.max(0.18, height * 0.55);
  const gapFade = Math.pow(1 - clamp(receiverGap / gapReference, 0, 0.96), 1.35);
  const gapSpread = 1 + clamp(receiverGap / Math.max(height, 0.001), 0, 1.15) * 0.55;
  const horizontalLight = Math.hypot(lightDirection[0], lightDirection[2]);
  const lightVertical = clamp(Math.abs(lightDirection[1]), 0.05, 1);
  const lightAngleFade = mix(0.88, 1.08, lightVertical);
  const projectionStretch = 1 + clamp(horizontalLight / Math.max(lightVertical, 0.05), 0, 1.5) * 0.18 * softness;
  const projectionYawRadians = horizontalLight > 0.0001 ? Math.atan2(-lightDirection[2], -lightDirection[0]) : 0;
  const projectionRotation = yawQuaternion(projectionYawRadians);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const radiusX = Math.max(0.34, width * (0.82 + softness * 0.22) * gapSpread * projectionStretch);
  const radiusZ = Math.max(0.24, depth * (0.7 + softness * 0.2) * gapSpread / Math.sqrt(projectionStretch));
  const directionalOffset: readonly [number, number] = [
    clamp(-lightDirection[0] * height * 0.24, -radiusX * 0.34, radiusX * 0.34),
    clamp(-lightDirection[2] * height * 0.24, -radiusZ * 0.34, radiusZ * 0.34)
  ];
  const geometry = Geometry.cylinder({ radius: 0.5, height: 1, segments: 128, capped: true });
  const layers = [
    { id: "ambient-penumbra", scaleX: 2.1, scaleZ: 1.72, lift: 0.024, alpha: 0.018, offsetScale: 0.9 },
    { id: "directional-penumbra", scaleX: 1.62, scaleZ: 1.16, lift: 0.027, alpha: 0.052, offsetScale: 1.08 },
    { id: "cast-falloff", scaleX: 1.05, scaleZ: 0.68, lift: 0.03, alpha: 0.13, offsetScale: 1.42 },
    { id: "cast-core", scaleX: 0.72, scaleZ: 0.42, lift: 0.033, alpha: 0.26, offsetScale: 1.74 },
    { id: "near-contact", scaleX: 0.76, scaleZ: 0.58, lift: 0.036, alpha: 0.18, offsetScale: 0.2 },
    { id: "core-contact", scaleX: 0.42, scaleZ: 0.34, lift: 0.039, alpha: 0.22, offsetScale: 0 },
    { id: "asset-anchor", scaleX: 0.22, scaleZ: 0.18, lift: 0.042, alpha: 0.14, offsetScale: -0.08 }
  ] as const;
  const renderItems: RenderItem[] = layers.map((layer) => ({
    label: `${labelPrefix}-${layer.id}`,
    geometry,
    material: new UnlitMaterial({
      name: `${labelPrefix}-${layer.id}-material`,
      color: [0.011, 0.012, 0.015, layer.alpha * opacity * gapFade * lightAngleFade],
      renderState: { blend: true, depthWrite: false, cullMode: "none" }
    }),
    modelMatrix: composeMat4(
      [
        centerX + directionalOffset[0] * layer.offsetScale,
        options.floorY + layer.lift,
        centerZ + directionalOffset[1] * layer.offsetScale
      ],
      projectionRotation,
      [radiusX * layer.scaleX, 0.0035, radiusZ * layer.scaleZ]
    )
  }));
  const footprintPoints = sanitizeFootprintPoints(options.footprintPoints ?? [], bounds, options.floorY).slice(0, 24);
  const footprintRadius = Math.max(0.035, Math.min(radiusX, radiusZ) * 0.115);
  footprintPoints.forEach((point, index) => {
    const pointGap = Math.max(0, point[1] - options.floorY);
    const pointFade = Math.pow(1 - clamp(pointGap / gapReference, 0, 0.96), 1.5);
    renderItems.push({
      label: `${labelPrefix}-footprint-${index}`,
      geometry,
      material: new UnlitMaterial({
        name: `${labelPrefix}-footprint-${index}-material`,
        color: [0.006, 0.007, 0.009, 0.04 * opacity * gapFade * pointFade],
        renderState: { blend: true, depthWrite: false, cullMode: "none" }
      }),
      modelMatrix: composeMat4(
        [
          point[0] + directionalOffset[0] * 0.16,
          options.floorY + 0.045 + index * 0.0002,
          point[2] + directionalOffset[1] * 0.16
        ],
        projectionRotation,
        [footprintRadius * 1.35, 0.0025, footprintRadius]
      )
    });
  });
  return {
    renderItems,
    diagnostics: {
      mode: "directional-multi-lobe-receiver-contact",
      parity: "not-full-contact-shadow",
      layerCount: layers.length,
      quality: "bounded-receiver-contact",
      floorY: options.floorY,
      receiverGap,
      gapFade,
      gapSpread,
      radiusX,
      radiusZ,
      softness,
      directionalOffset,
      lightAngleFade,
      projectionStretch,
      projectionYawRadians,
      footprintPointCount: footprintPoints.length,
      footprintLayerCount: footprintPoints.length
    },
    dispose() {
      geometry.dispose();
    }
  };
}

function sanitizeFootprintPoints(
  points: readonly (readonly [number, number, number])[],
  bounds: ContactShadowBounds,
  floorY: number
): readonly [number, number, number][] {
  return points
    .filter((point) => point.length === 3 && point.every(Number.isFinite))
    .map((point) => [
      clamp(point[0], bounds.min[0], bounds.max[0]),
      Math.max(floorY, point[1]),
      clamp(point[2], bounds.min[2], bounds.max[2])
    ] as [number, number, number]);
}

function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

function yawQuaternion(yawRadians: number): [number, number, number, number] {
  const half = yawRadians * 0.5;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalize3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 0.00001) return [0, -1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}
