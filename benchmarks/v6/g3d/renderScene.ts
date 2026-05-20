import { V6_BENCHMARK_SCENES } from '../shared/scenes';
export function renderG3DScene(scene: typeof V6_BENCHMARK_SCENES[number]): string { return 'g3d:' + scene; }
