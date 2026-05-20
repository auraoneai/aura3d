import { V6_BENCHMARK_SCENES } from '../shared/scenes';
export function renderThreeJsScene(scene: typeof V6_BENCHMARK_SCENES[number]): string { return 'threejs:' + scene; }
