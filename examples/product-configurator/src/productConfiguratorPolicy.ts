// Vendored, self-contained product-configurator policy data for the standalone example.
// Local copy so the example stays off apps/ internals (public-api-contracts audit).

export interface ProductConfiguratorControlTarget {
  readonly control: string;
  readonly sourceMaterial: string;
}

export interface ProductConfiguratorPolicy {
  readonly routeId: string;
  readonly materialControlsBoundToSourceMaterials: boolean;
  readonly unsupportedVariantClaims: readonly string[];
  readonly allowedControlTargets: readonly ProductConfiguratorControlTarget[];
}

export const productConfiguratorPolicy: ProductConfiguratorPolicy = {
  routeId: "product-configurator",
  materialControlsBoundToSourceMaterials: true,
  unsupportedVariantClaims: [
    "KHR_materials_variants parity is not proven in the current branch.",
    "Imported raycast target parity is not proven in the current branch."
  ],
  allowedControlTargets: [
    { control: "paint", sourceMaterial: "body_paint" },
    { control: "glass", sourceMaterial: "window_glass" },
    { control: "roofPanels", sourceMaterial: "carbon_roof" },
    { control: "wheels", sourceMaterial: "alloy_wheel" },
    { control: "tires", sourceMaterial: "tire_rubber" },
    { control: "chrome", sourceMaterial: "chrome_trim" },
    { control: "interior", sourceMaterial: "seat_leather" },
    { control: "dashboard", sourceMaterial: "dashboard_soft_touch" },
    { control: "emissive", sourceMaterial: "headlight_emissive" }
  ]
};
