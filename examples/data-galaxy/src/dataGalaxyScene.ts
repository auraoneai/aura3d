import { buildDataGalaxyFocalSystem } from './dataGalaxyFocalSystem';
export function buildDataGalaxyScene() {
    return {
        routeId: 'data-galaxy',
        title: 'Data Galaxy',
        generatedDataGlbActiveInHero: false,
        heroDrawer: 'dataGalaxyFocalSystem',
        routeComposition: {
            focalElementId: 'data-galaxy-focal-system',
            generatedGlbRole: 'excluded-from-hero-proof',
            densityPolicy: 'curated-hierarchy',
            forbiddenRouteFillers: ['object-count-padding', 'semantic-filler', 'particle-carpet', 'fog-sphere', 'debug-line-carpet'],
            environment: 'deep-space-volume',
        },
        focalSystem: buildDataGalaxyFocalSystem(),
        baselineDefects: [
            'The current branch now contains a reusable Data focal effect source proof.',
            'The regenerated reset baseline remains a diagnostic scene, not Data route acceptance.',
            'The next fix must connect this route to a real focused capture harness before gallery acceptance.',
        ],
    };
}
