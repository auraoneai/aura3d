import { PRODUCTION_BENCHMARK_SCENES } from '../shared/scenes';
export function renderA3DScene(scene: typeof PRODUCTION_BENCHMARK_SCENES[number]): string { return 'a3d:' + scene; }
