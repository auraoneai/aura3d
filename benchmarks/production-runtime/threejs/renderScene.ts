import { PRODUCTION_BENCHMARK_SCENES } from '../shared/scenes';
export function renderThreeJsScene(scene: typeof PRODUCTION_BENCHMARK_SCENES[number]): string { return 'threejs:' + scene; }
