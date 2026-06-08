export const productConfiguratorPolicy = {
    routeId: 'product-configurator',
    materialControlsBoundToSourceMaterials: true,
    unsupportedVariantClaims: [
        'KHR_materials_variants parity is not proven in the current branch.',
        'Imported raycast target parity is not proven in the current branch.',
    ],
    allowedControlTargets: [
        { control: 'paint', sourceMaterial: 'body_paint' },
        { control: 'glass', sourceMaterial: 'window_glass' },
        { control: 'roofPanels', sourceMaterial: 'carbon_roof' },
        { control: 'wheels', sourceMaterial: 'alloy_wheel' },
        { control: 'tires', sourceMaterial: 'tire_rubber' },
        { control: 'chrome', sourceMaterial: 'chrome_trim' },
        { control: 'interior', sourceMaterial: 'seat_leather' },
        { control: 'dashboard', sourceMaterial: 'dashboard_soft_touch' },
        { control: 'emissive', sourceMaterial: 'headlight_emissive' },
    ],
};
//# sourceMappingURL=productConfiguratorPolicy.js.map