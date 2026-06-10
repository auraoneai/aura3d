export const dataGalaxyFocalSystem = {
    id: 'data-galaxy-focal-system',
    generatedGlbActiveInHero: false,
    visualLanguage: 'premium-data-galaxy',
    cpuStaticMode: true,
    gpuDispatchesClaimed: 0,
    elements: [
        { kind: 'luminous-core', count: 1, role: 'primary data gravity well', visualWeight: 'primary' },
        { kind: 'orbital-ring', count: 4, role: 'layered analytics orbits with varied tilt', visualWeight: 'secondary' },
        { kind: 'data-stream', count: 12, role: 'curated directional streams into and out of the core', visualWeight: 'secondary' },
        { kind: 'depth-anchor', count: 24, role: 'sparse parallax anchors that define volume without filler', visualWeight: 'support' },
    ],
    hierarchy: [
        'The luminous core is the only primary focal subject.',
        'Orbital rings and data streams support the core instead of competing with it.',
        'Depth anchors remain sparse and cannot become object-count padding.',
        'The effect remains CPU/static and claims no GPU dispatches.',
    ],
    forbiddenScaffoldElements: [
        'core-cube',
        'debug-orbit',
        'semantic-node',
        'debug-line-carpet',
        'generated-data-glb-hero',
    ],
};
export function buildDataGalaxyFocalSystem() {
    return dataGalaxyFocalSystem;
}
