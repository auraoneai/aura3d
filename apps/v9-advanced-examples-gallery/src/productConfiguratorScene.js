export const productConfiguratorScene = {
    routeId: 'product-configurator',
    title: 'Product Configurator',
    heroAsset: {
        id: 'original-car-concept',
        path: 'assets/v9/product-configurator/original-car-concept.glb',
        required: true,
        presentInCurrentBranch: true,
    },
    supportAssets: [],
    stageComposition: {
        heroFocalAssetId: 'original-car-concept',
        allowedHeroAssetIds: ['original-car-concept'],
        forbiddenHeroProps: ['watch', 'shoe', 'sunglasses', 'generic-prop', 'generated-support-object'],
        environment: 'studio-cove',
        cameraIntent: 'front-three-quarter-product',
        clutterPolicy: 'hero-only',
    },
    materialRoles: [
        {
            role: 'paint',
            expectedMaterialNames: ['body_paint', 'clearcoat_paint', 'paint_primary'],
            currentSource: 'original-car-glb-fixture',
            currentVisualState: 'mapped to body_paint in original-car-concept GLB fixture',
        },
        {
            role: 'glass',
            expectedMaterialNames: ['glass', 'window_glass', 'windshield'],
            currentSource: 'original-car-glb-fixture',
            currentVisualState: 'mapped to window_glass in original-car-concept GLB fixture',
        },
        {
            role: 'roofPanels',
            expectedMaterialNames: ['roof', 'carbon_roof', 'panel_roof'],
            currentSource: 'original-car-glb-fixture',
            currentVisualState: 'mapped to carbon_roof in original-car-concept GLB fixture',
        },
        {
            role: 'wheels',
            expectedMaterialNames: ['wheel', 'rim', 'alloy'],
            currentSource: 'original-car-glb-fixture',
            currentVisualState: 'mapped to alloy_wheel in original-car-concept GLB fixture',
        },
        {
            role: 'tires',
            expectedMaterialNames: ['tire', 'rubber'],
            currentSource: 'original-car-glb-fixture',
            currentVisualState: 'mapped to tire_rubber in original-car-concept GLB fixture',
        },
        {
            role: 'chrome',
            expectedMaterialNames: ['chrome', 'trim', 'metal'],
            currentSource: 'original-car-glb-fixture',
            currentVisualState: 'mapped to chrome_trim in original-car-concept GLB fixture',
        },
        {
            role: 'interior',
            expectedMaterialNames: ['interior', 'seat', 'leather'],
            currentSource: 'original-car-glb-fixture',
            currentVisualState: 'mapped to seat_leather in original-car-concept GLB fixture',
        },
        {
            role: 'dashboard',
            expectedMaterialNames: ['dashboard', 'dash', 'instrument_panel'],
            currentSource: 'original-car-glb-fixture',
            currentVisualState: 'mapped to dashboard_soft_touch in original-car-concept GLB fixture',
        },
        {
            role: 'emissive',
            expectedMaterialNames: ['emissive', 'headlight', 'taillight', 'screen'],
            currentSource: 'original-car-glb-fixture',
            currentVisualState: 'mapped to headlight_emissive in original-car-concept GLB fixture',
        },
    ],
    baselineDefects: [
        'The current branch now contains a deterministic original car-concept GLB fixture for material proof.',
        'The regenerated reset baseline is a deterministic diagnostic scene, not a Product visual fix.',
        'The next fix must connect proven material roles to gallery route composition before route polish.',
    ],
};
export function buildProductConfiguratorScene() {
    return productConfiguratorScene;
}
//# sourceMappingURL=productConfiguratorScene.js.map