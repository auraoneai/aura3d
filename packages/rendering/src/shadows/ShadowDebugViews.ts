import type { ExternalParityCascadedShadowPipeline } from "./CascadedShadowPipeline";
import type { ExternalParityContactShadow } from "./ContactShadows";

export interface ExternalParityShadowDebugView {
  readonly id: "shadow-atlas" | "cascade-splits" | "contact-shadow";
  readonly label: string;
  readonly metrics: Record<string, number | string | boolean>;
}

export function createExternalParityShadowDebugViews(input: {
  readonly cascade: ExternalParityCascadedShadowPipeline;
  readonly contact: ExternalParityContactShadow;
}): readonly ExternalParityShadowDebugView[] {
  return [
    {
      id: "shadow-atlas",
      label: "Shadow Atlas",
      metrics: {
        atlasSize: input.cascade.atlas.atlasSize,
        allocationCount: input.cascade.atlas.allocations.length,
        utilization: input.cascade.atlas.utilization,
        pcfSamples: input.cascade.filter.samples.length
      }
    },
    {
      id: "cascade-splits",
      label: "Cascade Splits",
      metrics: {
        cascadeCount: input.cascade.cascades.length,
        near: input.cascade.cascades[0]?.near ?? 0,
        far: input.cascade.cascades.at(-1)?.far ?? 0,
        stableTexelSnapping: input.cascade.stableTexelSnapping
      }
    },
    {
      id: "contact-shadow",
      label: "Contact Shadow",
      metrics: {
        radius: input.contact.radius,
        opacity: input.contact.opacity,
        softness: input.contact.softness,
        anchorStrength: input.contact.anchorStrength
      }
    }
  ];
}
