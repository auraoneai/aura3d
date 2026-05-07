import { type CollectedLight } from "./LightCollector";
import { type CascadeSplit } from "./CascadedShadowMaps";

export interface DebugLine {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly color: readonly [number, number, number, number];
}

export class LightingDebug {
  buildLightLines(lights: readonly CollectedLight[], length = 1): readonly DebugLine[] {
    if (!(length > 0)) {
      throw new RangeError("Debug light line length must be positive");
    }
    return lights.map((light) => {
      const from = light.position;
      const to: [number, number, number] = [
        from[0] + light.direction[0] * length,
        from[1] + light.direction[1] * length,
        from[2] + light.direction[2] * length
      ];
      return {
        from,
        to,
        color: [light.color[0], light.color[1], light.color[2], 1]
      };
    });
  }

  buildShadowMapLabel(light: CollectedLight): string {
    return `${light.kind}:${light.castsShadow ? "shadow" : "unshadowed"}:${light.intensity.toFixed(3)}`;
  }

  buildCascadeLines(splits: readonly CascadeSplit[], width = 2): readonly DebugLine[] {
    if (!(width > 0)) {
      throw new RangeError("Cascade debug width must be positive");
    }

    const lines: DebugLine[] = [];
    for (const split of splits) {
      if (!(split.near > 0) || !(split.far > split.near)) {
        throw new RangeError("Cascade split near/far range is invalid");
      }
      const halfWidth = width / 2;
      const color = cascadeColor(split.index);
      const nearZ = -split.near;
      const farZ = -split.far;
      const nearCorners = [
        [-halfWidth, -halfWidth, nearZ],
        [halfWidth, -halfWidth, nearZ],
        [halfWidth, halfWidth, nearZ],
        [-halfWidth, halfWidth, nearZ]
      ] as const;
      const farCorners = [
        [-halfWidth, -halfWidth, farZ],
        [halfWidth, -halfWidth, farZ],
        [halfWidth, halfWidth, farZ],
        [-halfWidth, halfWidth, farZ]
      ] as const;

      for (let index = 0; index < 4; index += 1) {
        const next = (index + 1) % 4;
        lines.push({ from: nearCorners[index]!, to: nearCorners[next]!, color });
        lines.push({ from: farCorners[index]!, to: farCorners[next]!, color });
        lines.push({ from: nearCorners[index]!, to: farCorners[index]!, color });
      }
    }
    return lines;
  }
}

function cascadeColor(index: number): readonly [number, number, number, number] {
  const palette: readonly (readonly [number, number, number, number])[] = [
    [0.95, 0.3, 0.2, 1],
    [0.2, 0.75, 0.35, 1],
    [0.2, 0.45, 1, 1],
    [0.95, 0.8, 0.2, 1]
  ];
  return palette[Math.abs(index) % palette.length]!;
}
